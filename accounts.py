"""Cuentas, vuelos y alojamientos guardados y avisos de precio (SQLite)."""
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import threading
import time
from datetime import date, timedelta
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import urlsplit

from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("TOPTRAVEL_DB", ROOT / "data" / "toptravel.db"))

COOKIE = "tt_session"
SESSION_SECONDS = 30 * 86400
PASSWORD_MIN = 8
PASSWORD_MAX = 200
MAX_SAVED = 100
MAX_FAILS = 5
FAIL_WINDOW = 900
CHECK_EVERY = 6 * 3600
RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin letras y números que se confunden

EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
IATA = re.compile(r"^[A-Z]{3}$")
PRICE_KEY = re.compile(r"^g\d+-d\d+$")
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CABINS = {"economy", "premium", "business", "first"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_sealed TEXT,
  salt BLOB NOT NULL,
  password BLOB NOT NULL,
  recovery_hash TEXT,
  email_alerts INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saved (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  item_key TEXT NOT NULL,
  data TEXT NOT NULL,
  last_price REAL,
  checked_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, item_key)
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  old_price REAL NOT NULL,
  new_price REAL NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS price_history (
  route TEXT NOT NULL,
  day TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (route, day)
);
CREATE INDEX IF NOT EXISTS alerts_user ON alerts (user_id, is_read);
"""

# server.py la sustituye por la que lee SMTP_* de .env: sin esos datos no se envía nada.
mail_settings = lambda: {}
# El gráfico de precios sigue oculto hasta que el historial tenga datos suficientes.
insights_ready = lambda: False

_fails = {}
_fails_lock = threading.Lock()
_dummy_salt = secrets.token_bytes(16)


class Context:
    """Datos de la petición: quién la hace y qué cookie hay que enviar."""

    def __init__(self, user_id=None, ip="", token=None):
        self.user_id = user_id
        self.ip = ip
        self.token = token
        self.set_cookie = None
        self.secure = False


# ---------- Cifrado de datos personales ----------
# Correos, viajes guardados y avisos se guardan cifrados. Para buscar un correo sin
# descifrarlo, la columna "email" guarda solo una huella que no se puede revertir.
_cipher = None
_index_key = b""


def load_keys():
    global _cipher, _index_key
    path = DB_PATH.parent / "clave-datos.key"
    if not path.exists():
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as file:
            file.write(Fernet.generate_key())
    key = path.read_bytes().strip()
    _cipher = Fernet(key)
    _index_key = hashlib.sha256(b"toptravel-huellas" + key).digest()


def seal(text):
    return _cipher.encrypt(text.encode("utf-8")).decode("ascii")


def unseal(token):
    return _cipher.decrypt(token.encode("ascii")).decode("utf-8")


def fingerprint(text):
    return hmac.new(_index_key, text.encode("utf-8"), hashlib.sha256).hexdigest()


def seal_old_rows(db):
    """Cifra lo que se guardó antes de que existiera el cifrado."""
    for row in db.execute("SELECT id, email FROM users WHERE email_sealed IS NULL").fetchall():
        db.execute("UPDATE users SET email = ?, email_sealed = ? WHERE id = ?", (fingerprint(row["email"]), seal(row["email"]), row["id"]))
    for row in db.execute("SELECT id, item_key, data FROM saved WHERE data LIKE '{%'").fetchall():
        db.execute("UPDATE saved SET item_key = ?, data = ? WHERE id = ?", (fingerprint(row["item_key"]), seal(row["data"]), row["id"]))
    for row in db.execute("SELECT id, title FROM alerts WHERE title NOT LIKE 'gAAAA%'").fetchall():
        db.execute("UPDATE alerts SET title = ? WHERE id = ?", (seal(row["title"]), row["id"]))


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    # Nada de lo que cree este programa debe poder leerlo otro usuario del sistema.
    os.umask(0o077)
    DB_PATH.parent.mkdir(exist_ok=True)
    DB_PATH.parent.chmod(0o700)
    load_keys()
    db = connect()
    try:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
        if "recovery_hash" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN recovery_hash TEXT")
        if "email_alerts" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN email_alerts INTEGER NOT NULL DEFAULT 1")
        if "email_sealed" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN email_sealed TEXT")
        seal_old_rows(db)
        db.commit()
    finally:
        db.close()
    for path in (DB_PATH, DB_PATH.with_name(DB_PATH.name + "-wal"), DB_PATH.with_name(DB_PATH.name + "-shm")):
        if path.exists():
            path.chmod(0o600)


def hash_password(password, salt):
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024)


def token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def user_from_token(token):
    if not token:
        return None
    db = connect()
    try:
        row = db.execute(
            "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?",
            (token_hash(token), int(time.time())),
        ).fetchone()
        return row["user_id"] if row else None
    finally:
        db.close()


def cookie_header(value, max_age, secure):
    extra = "; Secure" if secure else ""
    return f"{COOKIE}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{extra}"


def start_session(db, user_id, ctx):
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    db.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (token_hash(token), user_id, now + SESSION_SECONDS),
    )
    ctx.set_cookie = cookie_header(token, SESSION_SECONDS, ctx.secure)


def too_many_fails(key):
    now = time.time()
    with _fails_lock:
        recent = [t for t in _fails.get(key, []) if now - t < FAIL_WINDOW]
        _fails[key] = recent
        return len(recent) >= MAX_FAILS


def note_fail(key):
    with _fails_lock:
        _fails.setdefault(key, []).append(time.time())


def new_recovery_code():
    """Devuelve el código para la persona y su resumen para guardar: permite recuperar sin correo."""
    code = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(20))
    return "-".join(code[i:i + 5] for i in range(0, 20, 5)), recovery_hash(code)


def recovery_hash(code):
    clean = re.sub(r"[^A-Z0-9]", "", str(code).upper())
    return hashlib.sha256(clean.encode("ascii", "ignore")).hexdigest()


def read_credentials(body):
    email = str(body.get("email") or "").strip().lower()
    password = body.get("password")
    return email, password if isinstance(password, str) else ""


def api_register(body, ctx):
    email, password = read_credentials(body)
    if not EMAIL.match(email) or len(email) > 200:
        return 400, {"error": "El correo no es válido."}
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        return 400, {"error": f"La contraseña debe tener al menos {PASSWORD_MIN} caracteres."}
    if too_many_fails(f"reg:{ctx.ip}"):
        return 429, {"error": "Demasiados intentos. Se puede volver a intentar dentro de unos minutos."}
    salt = secrets.token_bytes(16)
    digest = hash_password(password, salt)
    code, code_hash = new_recovery_code()
    db = connect()
    try:
        try:
            cursor = db.execute(
                "INSERT INTO users (email, email_sealed, salt, password, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (fingerprint(email), seal(email), salt, digest, code_hash, int(time.time())),
            )
        except sqlite3.IntegrityError:
            note_fail(f"reg:{ctx.ip}")
            return 409, {"error": "Ya existe una cuenta con ese correo."}
        start_session(db, cursor.lastrowid, ctx)
        db.commit()
    finally:
        db.close()
    return 201, {"user": {"email": email}, "recoveryCode": code}


def api_login(body, ctx):
    email, password = read_credentials(body)
    key = f"login:{ctx.ip}:{email}"
    if too_many_fails(key):
        return 429, {"error": "Demasiados intentos. Se puede volver a intentar dentro de unos minutos."}
    db = connect()
    try:
        row = db.execute("SELECT id, salt, password FROM users WHERE email = ?", (fingerprint(email),)).fetchone()
        # Se calcula siempre para que no se note si el correo existe.
        digest = hash_password(password[:PASSWORD_MAX], row["salt"] if row else _dummy_salt)
        if not row or not hmac.compare_digest(digest, row["password"]):
            note_fail(key)
            return 401, {"error": "Correo o contraseña incorrectos."}
        with _fails_lock:
            _fails.pop(key, None)
        start_session(db, row["id"], ctx)
        db.commit()
    finally:
        db.close()
    return 200, {"user": {"email": email}}


def api_recover(body, ctx):
    """Cambia la contraseña con el código de recuperación, que deja de valer."""
    email, password = read_credentials(body)
    code = str(body.get("code") or "")[:60]
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        return 400, {"error": f"La contraseña debe tener al menos {PASSWORD_MIN} caracteres."}
    keys = (f"recover:{ctx.ip}", f"recover:{email}")
    if any(too_many_fails(key) for key in keys):
        return 429, {"error": "Demasiados intentos. Se puede volver a intentar dentro de unos minutos."}
    db = connect()
    try:
        row = db.execute("SELECT id, recovery_hash FROM users WHERE email = ?", (fingerprint(email),)).fetchone()
        stored = (row["recovery_hash"] if row else None) or ""
        if not stored or not hmac.compare_digest(stored, recovery_hash(code)):
            for key in keys:
                note_fail(key)
            return 401, {"error": "El correo o el código de recuperación no son correctos."}
        salt = secrets.token_bytes(16)
        new_code, code_hash = new_recovery_code()
        db.execute(
            "UPDATE users SET salt = ?, password = ?, recovery_hash = ? WHERE id = ?",
            (salt, hash_password(password, salt), code_hash, row["id"]),
        )
        # Cierra cualquier sesión abierta con la contraseña anterior.
        db.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        start_session(db, row["id"], ctx)
        db.commit()
    finally:
        db.close()
    return 200, {"user": {"email": email}, "recoveryCode": new_code}


def api_new_recovery_code(body, ctx):
    password = body.get("password")
    password = password if isinstance(password, str) else ""
    key = f"code:{ctx.user_id}"
    if too_many_fails(key):
        return 429, {"error": "Demasiados intentos. Se puede volver a intentar dentro de unos minutos."}
    db = connect()
    try:
        row = db.execute("SELECT salt, password FROM users WHERE id = ?", (ctx.user_id,)).fetchone()
        if not row or not hmac.compare_digest(hash_password(password[:PASSWORD_MAX], row["salt"]), row["password"]):
            note_fail(key)
            return 401, {"error": "La contraseña no es correcta."}
        code, code_hash = new_recovery_code()
        db.execute("UPDATE users SET recovery_hash = ? WHERE id = ?", (code_hash, ctx.user_id))
        db.commit()
    finally:
        db.close()
    return 200, {"recoveryCode": code}


def api_logout(_body, ctx):
    if ctx.token:
        db = connect()
        try:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(ctx.token),))
            db.commit()
        finally:
            db.close()
    ctx.set_cookie = cookie_header("", 0, ctx.secure)
    return 200, {"ok": True}


def api_delete_account(body, ctx):
    password = body.get("password")
    password = password if isinstance(password, str) else ""
    key = f"delete:{ctx.user_id}"
    if too_many_fails(key):
        return 429, {"error": "Demasiados intentos. Se puede volver a intentar dentro de unos minutos."}
    db = connect()
    try:
        row = db.execute("SELECT salt, password FROM users WHERE id = ?", (ctx.user_id,)).fetchone()
        if not row or not hmac.compare_digest(hash_password(password[:PASSWORD_MAX], row["salt"]), row["password"]):
            note_fail(key)
            return 401, {"error": "La contraseña no es correcta."}
        db.execute("DELETE FROM users WHERE id = ?", (ctx.user_id,))
        db.commit()
    finally:
        db.close()
    ctx.set_cookie = cookie_header("", 0, ctx.secure)
    return 200, {"ok": True}


def send_mail(to, subject, text):
    """Envía un correo; devuelve False si el correo no está configurado."""
    config = mail_settings()
    host, user, password = config.get("SMTP_HOST"), config.get("SMTP_USER"), config.get("SMTP_PASSWORD")
    if not host:
        return False
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"TopTravel <{config.get('MAIL_FROM') or user}>"
    message["To"] = to
    message.set_content(text)
    port = int(config.get("SMTP_PORT") or 587)
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=30, context=ssl.create_default_context()) as smtp:
            smtp.login(user, password)
            smtp.send_message(message)
        return True
    with smtplib.SMTP(host, port, timeout=30) as smtp:
        # Solo un servidor de pruebas en este mismo ordenador puede ir sin cifrar.
        if host not in ("127.0.0.1", "localhost"):
            smtp.starttls(context=ssl.create_default_context())
        if user:
            smtp.login(user, password)
        smtp.send_message(message)
    return True


def mail_changes(db, changes):
    """Un solo correo por persona con todos sus cambios de precio."""
    site = (mail_settings().get("SITE_URL") or "").rstrip("/")
    for user_id, lines in changes.items():
        row = db.execute("SELECT email_sealed, email_alerts FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row or not row["email_alerts"]:
            continue
        text = "Ha cambiado un precio guardado en TopTravel:\n\n" + "\n".join(lines)
        text += "\n\nLos precios son orientativos: el precio final se confirma antes de comprar."
        if site:
            text += f"\n\nVer los avisos: {site}"
        text += "\n\nEstos correos se pueden desactivar en «Cuenta»."
        try:
            send_mail(unseal(row["email_sealed"]), "Ha cambiado un precio guardado", text)
        except (smtplib.SMTPException, OSError, ValueError) as error:
            # Sin el correo, el aviso sigue viéndose dentro de la web.
            print(f"No se ha podido enviar un aviso: {type(error).__name__}", flush=True)


def api_email_alerts(body, ctx):
    enabled = 1 if body.get("enabled") else 0
    db = connect()
    try:
        db.execute("UPDATE users SET email_alerts = ? WHERE id = ?", (enabled, ctx.user_id))
        db.commit()
    finally:
        db.close()
    return 200, {"emailAlerts": bool(enabled)}


def api_me(_query, ctx):
    if not ctx.user_id:
        return 200, {"user": None, "unread": 0, "insights": insights_ready()}
    db = connect()
    try:
        user = db.execute("SELECT email_sealed, email_alerts FROM users WHERE id = ?", (ctx.user_id,)).fetchone()
        unread = db.execute("SELECT COUNT(*) AS n FROM alerts WHERE user_id = ? AND is_read = 0", (ctx.user_id,)).fetchone()
    finally:
        db.close()
    return 200, {
        "user": {"email": unseal(user["email_sealed"]), "emailAlerts": bool(user["email_alerts"]), "mailReady": bool(mail_settings().get("SMTP_HOST"))} if user else None,
        "unread": unread["n"],
        "insights": insights_ready(),
    }


# ---------- Validación de lo que se guarda ----------
def clean_text(value, limit, required=False):
    text = " ".join(str(value or "").split())[:limit]
    if required and not text:
        raise ValueError("falta un dato")
    return text


def clean_date(value, required=True):
    if not value and not required:
        return None
    text = str(value or "")
    if not ISO_DATE.match(text):
        raise ValueError("fecha no válida")
    date.fromisoformat(text)
    return text


def clean_place(value):
    if not isinstance(value, dict) or not IATA.match(str(value.get("code") or "")):
        raise ValueError("lugar no válido")
    return {
        "code": value["code"],
        "city": clean_text(value.get("city"), 80, True),
        "country": clean_text(value.get("country"), 80),
        "airport": clean_text(value.get("airport"), 80),
    }


def clean_int(value, low, high, default):
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


def clean_pax(value):
    value = value if isinstance(value, dict) else {}
    return {
        "adults": clean_int(value.get("adults"), 1, 30, 1),
        "children": clean_int(value.get("children"), 0, 10, 0),
        "infants": clean_int(value.get("infants"), 0, 10, 0),
        "rooms": clean_int(value.get("rooms"), 1, 30, 1),
        "cabin": value.get("cabin") if value.get("cabin") in CABINS else "economy",
    }


def clean_flight(data):
    start = clean_date(data.get("start"))
    end = clean_date(data.get("end"), required=False)
    if end and end < start:
        raise ValueError("fechas no válidas")
    return {
        "origin": clean_place(data.get("origin")),
        "dest": clean_place(data.get("dest")),
        "start": start,
        "end": end,
        "direct": bool(data.get("direct")),
        "pax": clean_pax(data.get("pax")),
    }


def clean_stay(data):
    website = clean_text(data.get("website"), 300)
    key = clean_text(data.get("key"), 40)
    if website and urlsplit(website).scheme not in ("http", "https"):
        website = ""
    place = data.get("dest") if isinstance(data.get("dest"), dict) else {}
    start = clean_date(data.get("start"))
    end = clean_date(data.get("end"))
    if end <= start:
        raise ValueError("fechas no válidas")
    return {
        "name": clean_text(data.get("name"), 160, True),
        "key": key if PRICE_KEY.match(key) else "",
        "lodging": clean_text(data.get("lodging"), 40),
        "stars": clean_int(data.get("stars"), 0, 5, 0),
        "address": clean_text(data.get("address"), 200),
        "website": website,
        "dest": {
            "code": clean_text(place.get("code"), 3),
            "city": clean_text(place.get("city"), 80, True),
            "country": clean_text(place.get("country"), 80),
            "airport": "",
        },
        "start": start,
        "end": end,
        "pax": clean_pax(data.get("pax")),
    }


def item_key(kind, data):
    if kind == "flight":
        parts = (data["origin"]["code"], data["dest"]["code"], data["start"], data["end"] or "", int(data["direct"]))
    else:
        parts = (data["name"].casefold(), data["dest"]["city"].casefold(), data["start"], data["end"])
    return "|".join(map(str, (kind, *parts)))


def saved_out(row):
    return {
        "id": row["id"],
        "kind": row["kind"],
        "key": row["item_key"],
        "data": json.loads(unseal(row["data"])),
        "lastPrice": row["last_price"],
        "checkedAt": row["checked_at"],
    }


def api_saved(_query, ctx):
    db = connect()
    try:
        rows = db.execute("SELECT * FROM saved WHERE user_id = ? ORDER BY created_at DESC, id DESC", (ctx.user_id,)).fetchall()
    finally:
        db.close()
    return 200, {"saved": [saved_out(r) for r in rows]}


def has_price_source(kind, data):
    """Vuelos en turista y alojamientos con código de precio: de lo demás no hay datos."""
    if kind == "flight":
        return data["pax"].get("cabin", "economy") == "economy"
    return bool(data.get("key"))


def record_price(db, route, price, day=None):
    """Un precio por día y viaje. Se guarda sin relación con ninguna persona."""
    db.execute(
        "INSERT OR REPLACE INTO price_history (route, day, price) VALUES (?, ?, ?)",
        (route, day or date.today().isoformat(), round(float(price), 2)),
    )


def analyse_prices(points, start, today=None, cheaper_day=None):
    """Resume la evolución y da una orientación. Las reglas son simples a propósito: se pueden explicar."""
    today = today or date.today()
    start_day = date.fromisoformat(start)
    days_left = (start_day - today).days
    result = {"points": points, "daysLeft": days_left, "cheaperDay": cheaper_day}
    if not points:
        result["advice"] = {"kind": "collect", "title": "Aún sin datos", "reason": "Todavía no hay ningún precio de este viaje. Se revisa cada pocas horas."}
        return result

    prices = [p for _, p in points]
    first_day, last_day = date.fromisoformat(points[0][0]), date.fromisoformat(points[-1][0])
    span = (last_day - first_day).days
    last, low, high = prices[-1], min(prices), max(prices)
    average = sum(prices) / len(prices)
    week_ago = next((p for d, p in reversed(points) if (last_day - date.fromisoformat(d)).days >= 7), prices[0])
    week_change = (last - week_ago) / week_ago * 100 if week_ago else 0
    total_change = (last - prices[0]) / prices[0] * 100 if prices[0] else 0
    result["stats"] = {
        "last": last, "low": low, "high": high, "average": round(average, 2),
        "totalChange": round(total_change, 1), "weekChange": round(week_change, 1), "days": span,
    }

    # Hasta cuándo tiene sentido esperar: se deja un mes de margen antes del viaje.
    limit = start_day - timedelta(days=30)
    enough = len(points) >= 5 and span >= 7
    if days_left <= 14:
        advice = ("buy", "Comprar pronto", "Queda poco para el viaje, y tan cerca de la fecha los precios no suelen bajar.", None)
    elif not enough:
        advice = ("collect", "Reuniendo datos", f"Hay precios de {span + 1} día{'s' if span else ''}. Con una semana de datos ya se podrá ver la tendencia.", None)
    elif last <= low * 1.02 and high >= low * 1.05:
        advice = ("buy", "Buen momento para comprar", "Es el precio más bajo visto desde que se guardó.", None)
    elif week_change >= 5:
        advice = ("buy", "Comprar pronto", f"Ha subido un {week_change:.0f} % en la última semana.", None)
    elif days_left > 30 and week_change <= -5:
        advice = ("wait", "Se puede esperar", f"Ha bajado un {abs(week_change):.0f} % en la última semana y aún queda margen.", min(today + timedelta(days=7), limit))
    elif days_left > 30 and last >= average * 1.08:
        advice = ("wait", "Se puede esperar", "Ahora está por encima de su precio medio y aún queda margen.", min(today + timedelta(days=7), limit))
    elif days_left > 30:
        advice = ("wait", "Sin prisa", "El precio se mantiene estable.", limit)
    else:
        advice = ("buy", "Conviene decidir ya", "El precio está estable, pero queda menos de un mes para el viaje.", None)
    kind, title, reason, until = advice
    result["advice"] = {"kind": kind, "title": title, "reason": reason, "until": until.isoformat() if until else None}
    return result


def make_history(cheaper_day_of):
    """cheaper_day_of(datos del viaje) devuelve el día más barato cercano, si se conoce."""

    def api_history(query, ctx):
        if not insights_ready():
            return 404, {"error": "No encontrado."}
        item_id = clean_int(query.get("id"), 1, 2**62, 0)
        db = connect()
        try:
            row = db.execute("SELECT * FROM saved WHERE id = ? AND user_id = ?", (item_id, ctx.user_id)).fetchone()
            if not row:
                return 404, {"error": "No encontrado."}
            points = [[r["day"], r["price"]] for r in db.execute(
                "SELECT day, price FROM price_history WHERE route = ? ORDER BY day", (row["item_key"],))]
        finally:
            db.close()
        data = json.loads(unseal(row["data"]))
        try:
            cheaper = cheaper_day_of(data)
        except Exception:
            cheaper = None
        result = analyse_prices(points, data["start"], cheaper_day=cheaper)
        result["hasSource"] = has_price_source(row["kind"], data)
        return 200, result

    return api_history


def make_save(price_of):
    """price_of(datos del vuelo) devuelve el precio actual o None."""

    def api_save(body, ctx):
        kind = body.get("kind")
        data = body.get("data")
        if kind not in ("flight", "stay") or not isinstance(data, dict):
            return 400, {"error": "Datos no válidos."}
        try:
            clean = clean_flight(data) if kind == "flight" else clean_stay(data)
        except (ValueError, TypeError, KeyError):
            return 400, {"error": "Datos no válidos."}
        price = None
        if has_price_source(kind, clean):
            try:
                price = price_of(clean)
            except Exception:
                price = None
        key = fingerprint(item_key(kind, clean))
        now = int(time.time())
        db = connect()
        try:
            existing = db.execute("SELECT * FROM saved WHERE user_id = ? AND item_key = ?", (ctx.user_id, key)).fetchone()
            if existing:
                return 200, {"item": saved_out(existing)}
            count = db.execute("SELECT COUNT(*) AS n FROM saved WHERE user_id = ?", (ctx.user_id,)).fetchone()["n"]
            if count >= MAX_SAVED:
                return 400, {"error": f"Se pueden guardar hasta {MAX_SAVED} elementos."}
            if price is not None:
                record_price(db, key, price)
            cursor = db.execute(
                "INSERT INTO saved (user_id, kind, item_key, data, last_price, checked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (ctx.user_id, kind, key, seal(json.dumps(clean, ensure_ascii=False)), price, now if price is not None else None, now),
            )
            db.commit()
            row = db.execute("SELECT * FROM saved WHERE id = ?", (cursor.lastrowid,)).fetchone()
        finally:
            db.close()
        return 201, {"item": saved_out(row)}

    return api_save


def api_unsave(body, ctx):
    item_id = clean_int(body.get("id"), 1, 2**62, 0)
    db = connect()
    try:
        # El filtro por usuario impide borrar elementos de otra persona.
        db.execute("DELETE FROM saved WHERE id = ? AND user_id = ?", (item_id, ctx.user_id))
        db.commit()
    finally:
        db.close()
    return 200, {"ok": True}


def api_alerts(_query, ctx):
    db = connect()
    try:
        rows = db.execute("SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100", (ctx.user_id,)).fetchall()
    finally:
        db.close()
    return 200, {"alerts": [{
        "id": r["id"],
        "title": unseal(r["title"]),
        "start": r["start_date"],
        "end": r["end_date"],
        "oldPrice": r["old_price"],
        "newPrice": r["new_price"],
        "read": bool(r["is_read"]),
        "createdAt": r["created_at"],
    } for r in rows]}


def api_alerts_read(_body, ctx):
    db = connect()
    try:
        db.execute("UPDATE alerts SET is_read = 1 WHERE user_id = ?", (ctx.user_id,))
        db.commit()
    finally:
        db.close()
    return 200, {"ok": True}


def saved_title(kind, data):
    return f"{data['origin']['city']} → {data['dest']['city']}" if kind == "flight" else data["name"]


def check_prices(price_of, pause=1.0):
    """Revisa lo guardado, apunta el precio del día y crea un aviso si ha cambiado."""
    today = date.today().isoformat()
    db = connect()
    created = 0
    changes = {}
    try:
        rows = db.execute("SELECT * FROM saved").fetchall()
        known = {}
        for row in rows:
            data = json.loads(unseal(row["data"]))
            if data["start"] < today or not has_price_source(row["kind"], data):
                continue
            # La huella es la misma para todo el que guarde el mismo viaje: se consulta una vez.
            route = row["item_key"]
            if route not in known:
                try:
                    known[route] = price_of(data)
                except Exception:
                    known[route] = None
                if pause:
                    time.sleep(pause)
                if known[route] is not None:
                    record_price(db, route, known[route])
            price = known[route]
            if price is None:
                continue  # sin dato no sabemos si ha cambiado
            now = int(time.time())
            old = row["last_price"]
            if old is not None and round(price) != round(old):
                db.execute(
                    "INSERT INTO alerts (user_id, title, start_date, end_date, old_price, new_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (row["user_id"], seal(saved_title(row["kind"], data)), data["start"], data.get("end"), old, price, now),
                )
                created += 1
                when = f"{data['start']} a {data['end']}" if data.get("end") else data["start"]
                changes.setdefault(row["user_id"], []).append(
                    f"- {saved_title(row['kind'], data)} ({when}): de {round(old)} € a {round(price)} €"
                )
            db.execute("UPDATE saved SET last_price = ?, checked_at = ? WHERE id = ?", (price, now, row["id"]))
        db.commit()
        # El historial de viajes ya pasados deja de ser útil pasado un año.
        db.execute("DELETE FROM price_history WHERE day < ?", ((date.today() - timedelta(days=400)).isoformat(),))
        db.commit()
        mail_changes(db, changes)
    finally:
        db.close()
    return created


def start_price_checks(price_of):
    def loop():
        time.sleep(60)
        while True:
            try:
                check_prices(price_of)
            except Exception as error:  # el servidor debe seguir aunque falle una revisión
                print(f"Revisión de precios fallida: {error}", flush=True)
            time.sleep(CHECK_EVERY)

    threading.Thread(target=loop, daemon=True).start()


PUBLIC_POST = {"/api/register": api_register, "/api/login": api_login, "/api/recover": api_recover, "/api/logout": api_logout}
PRIVATE_GET = {"/api/saved": api_saved, "/api/alerts": api_alerts}
PUBLIC_GET = {"/api/me": api_me}
