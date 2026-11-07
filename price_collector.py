"""Historial propio de precios: cada día apunta los de vuelos y hoteles, sin datos de personas.

Ninguna fuente gratuita da precios pasados, así que se van guardando desde que la web
está publicada. Solo se escribe una fila cuando un precio cambia: entre dos filas, el
precio se mantuvo. Para ver el estado: python tools/ver_historial.py

Tres fuentes: cada día, las rutas desde MAD y BCN y los hoteles de la lista; sin parar,
una rotación por todas las rutas de Europa y de grandes aeropuertos del mundo; y cualquier
precio que salga en una búsqueda de la web. Las rutas de la rotación se guardan por ciudad
(LON, no LHR). Las filas de los primeros días, con el aeropuerto, siguen como estaban.
"""
import calendar
import os
import queue
import sqlite3
import threading
import time
from datetime import date
from pathlib import Path

DB_PATH = Path(os.environ.get("TOPTRAVEL_HISTORY_DB", Path(__file__).resolve().parent / "data" / "historial.db"))

ORIGINS = ("MAD", "BCN")
MAX_DESTINATIONS = 120
HOTEL_MONTHS_AHEAD = (1, 3)  # dos fechas de entrada de referencia por hotel
HOTEL_NIGHTS = 2
FLIGHT_PAUSE = 1.5
HOTEL_PAUSE = 4.0  # Xotelo es gratuito y también lo usa la web: mejor ir despacio
MAX_ERRORS_IN_A_ROW = 15
START_DELAY = 300
CHECK_EVERY = 3600

# Rotación por el mundo. El tope diario y el de disco son lo que evita abusar del servicio
# gratuito y llenar el alojamiento: con 1 GB, el historial no pasa de la mitad.
WORLD_HUBS = (
    "LHR", "LGW", "CDG", "AMS", "FRA", "MUC", "FCO", "MXP", "ZRH", "VIE", "LIS", "OPO", "AGP", "PMI", "ATH", "IST",
    "DUB", "CPH", "ARN", "OSL", "HEL", "WAW", "PRG", "BUD", "OTP", "BRU", "GVA", "BER", "HAM", "NCE",
    "JFK", "EWR", "LAX", "SFO", "ORD", "MIA", "ATL", "DFW", "BOS", "SEA", "LAS", "YYZ", "YVR", "YUL", "MEX", "CUN",
    "GRU", "EZE", "BOG", "SCL", "LIM", "DXB", "DOH", "TLV", "CAI", "JNB", "CMN", "DEL", "BOM", "BKK", "SIN", "KUL",
    "HKG", "ICN", "NRT", "HND", "PEK", "PVG", "SYD", "MEL", "AKL",
    "CGK", "DPS", "MNL", "SGN", "HAN", "TPE", "CAN", "SZX", "CTU", "KIX", "FUK", "CTS", "BLR", "MAA", "CCU", "CMB", "KTM", "DAC",
    "ALA", "TAS", "KWI", "RUH", "JED", "AUH", "MCT", "BAH", "AMM",
)
# Rusia y Bielorrusia no: desde el resto de Europa no se puede volar allí directamente.
EUROPE_COUNTRIES = frozenset(
    "AD AL AM AT AZ BA BE BG CH CY CZ DE DK EE ES FI FO FR GB GE GI GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS SE SI SK SM TR UA XK".split()
)
PENDING_IMPORT = DB_PATH.with_name("historial-nuevo.db")
WORLD_REQUESTS_PER_DAY = 20000
WORLD_PAUSE = 2.5
MAX_DB_BYTES = 500 * 1024 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS flight_prices (
  origin TEXT NOT NULL, destination TEXT NOT NULL, travel_day TEXT NOT NULL,
  seen_day TEXT NOT NULL, price REAL NOT NULL,
  PRIMARY KEY (origin, destination, travel_day, seen_day)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS hotel_prices (
  hotel TEXT NOT NULL, check_in TEXT NOT NULL,
  seen_day TEXT NOT NULL, price REAL NOT NULL,
  PRIMARY KEY (hotel, check_in, seen_day)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS world_routes (
  id INTEGER PRIMARY KEY, origin TEXT NOT NULL, destination TEXT NOT NULL, UNIQUE (origin, destination)
);
CREATE TABLE IF NOT EXISTS world_hubs (code TEXT PRIMARY KEY) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS world_state (id INTEGER PRIMARY KEY CHECK (id = 1), position INTEGER NOT NULL, laps INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
  job TEXT NOT NULL, day TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0, new_rows INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (job, day)
);
"""


def connect():
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def compact_old_tables(db):
    """Las primeras tablas guardaban cada clave dos veces: se pasan al formato que ocupa menos."""
    for table, columns in (("flight_prices", "origin, destination, travel_day, seen_day, price"), ("hotel_prices", "hotel, check_in, seen_day, price")):
        row = db.execute("SELECT sql FROM sqlite_master WHERE name = ?", (table,)).fetchone()
        if row and "WITHOUT ROWID" not in row["sql"]:
            db.execute(f"ALTER TABLE {table} RENAME TO {table}_old")
            db.executescript(SCHEMA)
            db.execute(f"INSERT INTO {table} ({columns}) SELECT {columns} FROM {table}_old")
            db.execute(f"DROP TABLE {table}_old")
            db.commit()


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    db = connect()
    try:
        db.execute("PRAGMA journal_mode = WAL")
        compact_old_tables(db)
        db.executescript(SCHEMA)
        db.commit()
    finally:
        db.close()


def add_months(day, months):
    total = day.year * 12 + day.month - 1 + months
    return total // 12, total % 12 + 1


def hotel_stays(today):
    """Siempre el día 15 de cada mes de referencia: así se sigue la misma estancia varios días."""
    stays = []
    for months in HOTEL_MONTHS_AHEAD:
        year, month = add_months(today, months)
        day = min(15, calendar.monthrange(year, month)[1])
        stays.append((date(year, month, day), date(year, month, day + HOTEL_NIGHTS)))
    return stays


def save_flight(db, origin, destination, travel_day, price, seen_day):
    """Devuelve True si había cambio y se ha escrito una fila."""
    last = db.execute(
        "SELECT price FROM flight_prices WHERE origin = ? AND destination = ? AND travel_day = ? ORDER BY seen_day DESC LIMIT 1",
        (origin, destination, travel_day),
    ).fetchone()
    if last and abs(last["price"] - price) < 0.01:
        return False
    db.execute(
        "INSERT OR REPLACE INTO flight_prices (origin, destination, travel_day, seen_day, price) VALUES (?, ?, ?, ?, ?)",
        (origin, destination, travel_day, seen_day, round(price, 2)),
    )
    return True


def save_hotel(db, hotel, check_in, price, seen_day):
    last = db.execute(
        "SELECT price FROM hotel_prices WHERE hotel = ? AND check_in = ? ORDER BY seen_day DESC LIMIT 1",
        (hotel, check_in),
    ).fetchone()
    if last and abs(last["price"] - price) < 0.01:
        return False
    db.execute(
        "INSERT OR REPLACE INTO hotel_prices (hotel, check_in, seen_day, price) VALUES (?, ?, ?, ?)",
        (hotel, check_in, seen_day, round(price, 2)),
    )
    return True


def run_job(job, tasks, handle, pause, today, sleep=time.sleep):
    """Recorre las tareas retomando por donde iba; si un servicio falla seguido, lo deja para mañana."""
    day = today.isoformat()
    db = connect()
    try:
        db.execute("INSERT OR IGNORE INTO runs (job, day, total) VALUES (?, ?, ?)", (job, day, len(tasks)))
        db.execute("UPDATE runs SET total = ? WHERE job = ? AND day = ?", (len(tasks), job, day))
        db.commit()
        state = db.execute("SELECT position, finished FROM runs WHERE job = ? AND day = ?", (job, day)).fetchone()
        if state["finished"]:
            return
        in_a_row = 0
        for position in range(state["position"], len(tasks)):
            new_rows, failed = 0, 0
            try:
                new_rows = handle(db, tasks[position], day)
                in_a_row = 0
            except Exception:
                failed = 1
                in_a_row += 1
            db.execute(
                "UPDATE runs SET position = ?, requests = requests + 1, new_rows = new_rows + ?, errors = errors + ? WHERE job = ? AND day = ?",
                (position + 1, new_rows, failed, job, day),
            )
            db.commit()
            if in_a_row >= MAX_ERRORS_IN_A_ROW:
                print(f"Historial: {job} parado por hoy tras {in_a_row} fallos seguidos", flush=True)
                db.execute("UPDATE runs SET finished = 1 WHERE job = ? AND day = ?", (job, day))
                db.commit()
                return
            sleep(pause)
        db.execute("UPDATE runs SET finished = 1 WHERE job = ? AND day = ?", (job, day))
        db.commit()
    finally:
        db.close()


def collect_flights(destinations_of, route_prices, today=None, sleep=time.sleep):
    """route_prices(origen, destino) devuelve {día: precio} de la ida, de todos los meses a la vez."""
    today = today or date.today()
    tasks = [(origin, destination) for origin in ORIGINS for destination in destinations_of(origin)]

    def handle(db, task, day):
        origin, destination = task
        return sum(
            save_flight(db, origin, destination, travel_day, price, day)
            for travel_day, price in route_prices(origin, destination).items()
        )

    run_job("vuelos", tasks, handle, FLIGHT_PAUSE, today, sleep)


def collect_hotels(hotel_keys, stay_price, today=None, sleep=time.sleep):
    """stay_price(clave, entrada, salida) devuelve el precio por noche más bajo o None."""
    today = today or date.today()
    tasks = [(key, start.isoformat(), end.isoformat()) for key in hotel_keys for start, end in hotel_stays(today)]

    def handle(db, task, day):
        key, start, end = task
        price = stay_price(key, start, end)
        return int(save_hotel(db, key, start, price, day)) if price is not None else 0

    run_job("hoteles", tasks, handle, HOTEL_PAUSE, today, sleep)


def has_room():
    try:
        return DB_PATH.stat().st_size < MAX_DB_BYTES
    except OSError:
        return True


def discover_world_routes(db, destinations_of, hubs, sleep=time.sleep):
    """Apunta las rutas nuevas de cada origen. Las ya conocidas no se tocan: la rotación sigue su orden."""
    for hub in hubs:
        try:
            db.executemany("INSERT OR IGNORE INTO world_routes (origin, destination) VALUES (?, ?)", [(hub, code) for code in destinations_of(hub)])
            db.execute("INSERT OR IGNORE INTO world_hubs (code) VALUES (?)", (hub,))
            db.commit()
        except Exception as error:
            print(f"Historial: sin destinos de {hub}: {type(error).__name__}", flush=True)
        sleep(WORLD_PAUSE)


def collect_world(destinations_of, hubs_of, route_prices, today=None, sleep=time.sleep, budget=WORLD_REQUESTS_PER_DAY):
    """Avanza por todas las rutas hasta gastar el cupo del día; mañana sigue donde quedó."""
    today = today or date.today()
    day = today.isoformat()
    db = connect()
    try:
        db.execute("INSERT OR IGNORE INTO world_state (id, position, laps) VALUES (1, 0, 0)")
        db.execute("INSERT OR IGNORE INTO runs (job, day) VALUES ('mundo', ?)", (day,))
        db.commit()
        hubs = hubs_of()
        # Se apunta cada origen ya mirado: muchos pueblos no tienen vuelos y no hay que preguntar cada hora.
        known = {row["code"] for row in db.execute("SELECT code FROM world_hubs")}
        discover_world_routes(db, destinations_of, [hub for hub in hubs if hub not in known], sleep)
        # Lo que se pedía por aeropuerto (LHR) ya entra por ciudad (LON): no se pregunta dos veces.
        current = set(hubs)
        for origin in [row["origin"] for row in db.execute("SELECT DISTINCT origin FROM world_routes")]:
            if origin not in current:
                db.execute("DELETE FROM world_routes WHERE origin = ?", (origin,))
        db.commit()
        routes = db.execute("SELECT origin, destination FROM world_routes ORDER BY id").fetchall()
        total = len(routes)
        if not total:
            return
        db.execute("UPDATE runs SET total = ? WHERE job = 'mundo' AND day = ?", (total, day))
        in_a_row = 0
        while has_room() and db.execute("SELECT requests FROM runs WHERE job = 'mundo' AND day = ?", (day,)).fetchone()["requests"] < budget:
            position = db.execute("SELECT position FROM world_state").fetchone()["position"] % total
            route = routes[position]
            new_rows, failed = 0, 0
            try:
                new_rows = sum(
                    save_flight(db, route["origin"], route["destination"], travel_day, price, day)
                    for travel_day, price in route_prices(route["origin"], route["destination"]).items()
                )
                in_a_row = 0
            except Exception:
                failed = 1
                in_a_row += 1
            next_position = position + 1
            lap = int(next_position >= total)
            db.execute("UPDATE world_state SET position = ?, laps = laps + ?", (next_position % total, lap))
            db.execute(
                "UPDATE runs SET position = ?, requests = requests + 1, new_rows = new_rows + ?, errors = errors + ? WHERE job = 'mundo' AND day = ?",
                (next_position % total, new_rows, failed, day),
            )
            db.commit()
            if in_a_row >= MAX_ERRORS_IN_A_ROW:
                print(f"Historial: mundo parado por hoy tras {in_a_row} fallos seguidos", flush=True)
                db.execute("UPDATE runs SET requests = ? WHERE job = 'mundo' AND day = ?", (budget, day))
                db.commit()
                return
            if lap:
                discover_world_routes(db, destinations_of, hubs, sleep)  # vuelta completa: se buscan rutas nuevas
                return
            sleep(WORLD_PAUSE)
    finally:
        db.close()


# ---------- Precios que aparecen en las búsquedas de la web ----------
_seen = queue.Queue(maxsize=2000)
_listening = False


def note_flights(origin, destination, days):
    """No bloquea nunca: la búsqueda de una persona no espera a que se escriba el historial."""
    if _listening and days:
        try:
            _seen.put_nowait(("vuelo", origin, destination, dict(days)))
        except queue.Full:
            pass


def note_hotel(key, check_in, price):
    if _listening:
        try:
            _seen.put_nowait(("hotel", key, check_in, price))
        except queue.Full:
            pass


def save_noted(db, item, day):
    if item[0] == "vuelo":
        return sum(save_flight(db, item[1], item[2], travel_day, price, day) for travel_day, price in item[3].items())
    return int(save_hotel(db, item[1], item[2], item[3], day))


def write_noted():
    while True:
        item = _seen.get()
        try:
            if has_room():
                db = connect()
                try:
                    save_noted(db, item, date.today().isoformat())
                    db.commit()
                finally:
                    db.close()
        except Exception as error:
            print(f"Historial: búsqueda sin guardar: {type(error).__name__}", flush=True)


def import_pending():
    """Une el relleno hecho fuera. Lo hace la propia web: es la única que escribe en esta base."""
    if not PENDING_IMPORT.exists():
        return
    db = connect()
    try:
        db.execute("ATTACH DATABASE ? AS nuevo", (str(PENDING_IMPORT),))
        origins = [row[0] for row in db.execute("SELECT DISTINCT origin FROM nuevo.flight_prices")]
        for origin in origins:
            db.execute("INSERT OR IGNORE INTO flight_prices SELECT * FROM nuevo.flight_prices WHERE origin = ?", (origin,))
            db.commit()
        db.execute("INSERT OR IGNORE INTO world_routes (origin, destination) SELECT origin, destination FROM nuevo.world_routes ORDER BY id")
        db.execute("INSERT OR IGNORE INTO world_hubs SELECT code FROM nuevo.world_hubs")
        db.commit()
        db.execute("DETACH DATABASE nuevo")
        print(f"Historial: relleno unido, {len(origins)} orígenes", flush=True)
    finally:
        db.close()
    PENDING_IMPORT.unlink()


def start(destinations_of, all_destinations, hubs_of, route_prices, hotel_keys, stay_price):
    """Hilos aparte: si la web se reinicia, siguen por donde iban.

    Vuelos y hoteles van a la vez porque usan servicios distintos. La rotación del mundo
    comparte servicio con los vuelos, así que va detrás de ellos para no sumar peticiones.
    """
    global _listening

    def import_later():
        time.sleep(START_DELAY)
        try:
            import_pending()
        except Exception as error:
            print(f"Historial: relleno sin unir: {type(error).__name__}", flush=True)

    def loop(*jobs):
        time.sleep(START_DELAY)
        while True:
            for job, args_of in jobs:
                try:
                    job(*args_of())
                except Exception as error:  # el historial nunca debe tirar la web
                    print(f"Historial: {job.__name__} ha fallado: {type(error).__name__}", flush=True)
            time.sleep(CHECK_EVERY)

    flights = (
        (collect_flights, lambda: (destinations_of, route_prices)),
        (collect_world, lambda: (all_destinations, hubs_of, route_prices)),
    )
    hotels = ((collect_hotels, lambda: (hotel_keys(), stay_price)),)
    init_db()
    _listening = True
    threading.Thread(target=write_noted, daemon=True).start()
    threading.Thread(target=import_later, daemon=True).start()
    threading.Thread(target=loop, args=flights, daemon=True).start()
    threading.Thread(target=loop, args=hotels, daemon=True).start()
