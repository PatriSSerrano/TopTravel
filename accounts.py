"""Cuentas, vuelos y alojamientos guardados y avisos de precio (SQLite)."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

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

EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
IATA = re.compile(r"^[A-Z]{3}$")
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CABINS = {"economy", "premium", "business", "first"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  salt BLOB NOT NULL,
  password BLOB NOT NULL,
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
CREATE INDEX IF NOT EXISTS alerts_user ON alerts (user_id, is_read);
"""

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


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    db = connect()
    try:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
        db.commit()
    finally:
        db.close()


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


def read_credentials(body):
    email = str(body.get("email") or "").strip().lower()
    password = body.get("password")
    return email, password if isinstance(password, str) else ""


def api_register(body, ctx):
    email, password = read_credentials(body)
    if not EMAIL.match(email) or len(email) > 200:
        return 400, {"error": "Escribe un correo válido."}
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        return 400, {"error": f"La contraseña debe tener al menos {PASSWORD_MIN} caracteres."}
    if too_many_fails(f"reg:{ctx.ip}"):
        return 429, {"error": "Demasiados intentos. Prueba dentro de unos minutos."}
    salt = secrets.token_bytes(16)
    digest = hash_password(password, salt)
    db = connect()
    try:
        try:
            cursor = db.execute(
                "INSERT INTO users (email, salt, password, created_at) VALUES (?, ?, ?, ?)",
                (email, salt, digest, int(time.time())),
            )
        except sqlite3.IntegrityError:
            note_fail(f"reg:{ctx.ip}")
            return 409, {"error": "Ya existe una cuenta con ese correo."}
        start_session(db, cursor.lastrowid, ctx)
        db.commit()
    finally:
        db.close()
    return 201, {"user": {"email": email}}


def api_login(body, ctx):
    email, password = read_credentials(body)
    key = f"login:{ctx.ip}:{email}"
    if too_many_fails(key):
        return 429, {"error": "Demasiados intentos. Prueba dentro de unos minutos."}
    db = connect()
    try:
        row = db.execute("SELECT id, salt, password FROM users WHERE email = ?", (email,)).fetchone()
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
        return 429, {"error": "Demasiados intentos. Prueba dentro de unos minutos."}
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


def api_me(_query, ctx):
    if not ctx.user_id:
        return 200, {"user": None, "unread": 0}
    db = connect()
    try:
        user = db.execute("SELECT email FROM users WHERE id = ?", (ctx.user_id,)).fetchone()
        unread = db.execute("SELECT COUNT(*) AS n FROM alerts WHERE user_id = ? AND is_read = 0", (ctx.user_id,)).fetchone()
    finally:
        db.close()
    return 200, {"user": {"email": user["email"]} if user else None, "unread": unread["n"]}


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
    if website and urlsplit(website).scheme not in ("http", "https"):
        website = ""
    place = data.get("dest") if isinstance(data.get("dest"), dict) else {}
    start = clean_date(data.get("start"))
    end = clean_date(data.get("end"))
    if end <= start:
        raise ValueError("fechas no válidas")
    return {
        "name": clean_text(data.get("name"), 160, True),
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
        "data": json.loads(row["data"]),
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
        if kind == "flight" and clean["pax"]["cabin"] == "economy":
            try:
                price = price_of(clean)
            except Exception:
                price = None
        key = item_key(kind, clean)
        now = int(time.time())
        db = connect()
        try:
            existing = db.execute("SELECT * FROM saved WHERE user_id = ? AND item_key = ?", (ctx.user_id, key)).fetchone()
            if existing:
                return 200, {"item": saved_out(existing)}
            count = db.execute("SELECT COUNT(*) AS n FROM saved WHERE user_id = ?", (ctx.user_id,)).fetchone()["n"]
            if count >= MAX_SAVED:
                return 400, {"error": f"Puedes guardar hasta {MAX_SAVED} elementos."}
            cursor = db.execute(
                "INSERT INTO saved (user_id, kind, item_key, data, last_price, checked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (ctx.user_id, kind, key, json.dumps(clean, ensure_ascii=False), price, now if price is not None else None, now),
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
        "title": r["title"],
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


def check_prices(price_of, pause=1.0):
    """Revisa los vuelos guardados y crea un aviso si cambia el precio."""
    today = date.today().isoformat()
    db = connect()
    created = 0
    try:
        rows = db.execute("SELECT * FROM saved WHERE kind = 'flight'").fetchall()
        known = {}
        for row in rows:
            data = json.loads(row["data"])
            if data["start"] < today or data["pax"].get("cabin", "economy") != "economy":
                continue
            route = (data["origin"]["code"], data["dest"]["code"], data["start"], data.get("end"), data.get("direct"))
            if route not in known:
                try:
                    known[route] = price_of(data)
                except Exception:
                    known[route] = None
                if pause:
                    time.sleep(pause)
            price = known[route]
            if price is None:
                continue  # sin dato no sabemos si ha cambiado
            now = int(time.time())
            old = row["last_price"]
            if old is not None and round(price) != round(old):
                db.execute(
                    "INSERT INTO alerts (user_id, title, start_date, end_date, old_price, new_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (row["user_id"], f"{data['origin']['city']} → {data['dest']['city']}", data["start"], data.get("end"), old, price, now),
                )
                created += 1
            db.execute("UPDATE saved SET last_price = ?, checked_at = ? WHERE id = ?", (price, now, row["id"]))
        db.commit()
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


PUBLIC_POST = {"/api/register": api_register, "/api/login": api_login, "/api/logout": api_logout}
PRIVATE_GET = {"/api/saved": api_saved, "/api/alerts": api_alerts}
PUBLIC_GET = {"/api/me": api_me}
