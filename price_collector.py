"""Historial propio de precios: cada día apunta los de vuelos y hoteles, sin datos de personas.

Ninguna fuente gratuita da precios pasados, así que se van guardando desde que la web
está publicada. Solo se escribe una fila cuando un precio cambia: entre dos filas, el
precio se mantuvo. Para ver el estado: python tools/ver_historial.py
"""
import calendar
import os
import sqlite3
import threading
import time
from datetime import date
from pathlib import Path

DB_PATH = Path(os.environ.get("TOPTRAVEL_HISTORY_DB", Path(__file__).resolve().parent / "data" / "historial.db"))

ORIGINS = ("MAD", "BCN")
MAX_DESTINATIONS = 120
MONTHS_AHEAD = 8
HOTEL_MONTHS_AHEAD = (1, 3)  # dos fechas de entrada de referencia por hotel
HOTEL_NIGHTS = 2
FLIGHT_PAUSE = 1.5
HOTEL_PAUSE = 4.0  # Xotelo es gratuito y también lo usa la web: mejor ir despacio
MAX_ERRORS_IN_A_ROW = 15
START_DELAY = 300
CHECK_EVERY = 3600

SCHEMA = """
CREATE TABLE IF NOT EXISTS flight_prices (
  origin TEXT NOT NULL, destination TEXT NOT NULL, travel_day TEXT NOT NULL,
  seen_day TEXT NOT NULL, price REAL NOT NULL,
  PRIMARY KEY (origin, destination, travel_day, seen_day)
);
CREATE TABLE IF NOT EXISTS hotel_prices (
  hotel TEXT NOT NULL, check_in TEXT NOT NULL,
  seen_day TEXT NOT NULL, price REAL NOT NULL,
  PRIMARY KEY (hotel, check_in, seen_day)
);
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


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    db = connect()
    try:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
        db.commit()
    finally:
        db.close()


def add_months(day, months):
    total = day.year * 12 + day.month - 1 + months
    return total // 12, total % 12 + 1


def flight_months(today):
    return [f"{y}-{m:02d}" for y, m in (add_months(today, i) for i in range(MONTHS_AHEAD + 1))]


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


def collect_flights(destinations_of, month_prices, today=None, sleep=time.sleep):
    """month_prices(origen, destino, mes) devuelve {día: precio} de la ida."""
    today = today or date.today()
    months = flight_months(today)
    tasks = [(origin, destination, month) for origin in ORIGINS for destination in destinations_of(origin) for month in months]

    def handle(db, task, day):
        origin, destination, month = task
        return sum(
            save_flight(db, origin, destination, travel_day, price, day)
            for travel_day, price in month_prices(origin, destination, month).items()
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


def start(destinations_of, month_prices, hotel_keys, stay_price):
    """Hilo aparte: si la web se reinicia, sigue por donde iba."""

    def loop():
        time.sleep(START_DELAY)
        while True:
            for job, args in ((collect_flights, (destinations_of, month_prices)), (collect_hotels, (hotel_keys(), stay_price))):
                try:
                    job(*args)
                except Exception as error:  # el historial nunca debe tirar la web
                    print(f"Historial: {job.__name__} ha fallado: {type(error).__name__}", flush=True)
            time.sleep(CHECK_EVERY)

    init_db()
    threading.Thread(target=loop, daemon=True).start()
