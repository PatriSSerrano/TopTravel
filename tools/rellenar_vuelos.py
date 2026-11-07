"""Primer relleno de todas las rutas de Europa, desde fuera del alojamiento, que iría demasiado despacio.

Escribe en un archivo aparte y se puede cortar: al repetirlo sigue por donde iba. Al terminar, ese
archivo se sube como data/historial-nuevo.db y la web lo une sola a su historial.
Uso: python tools/rellenar_vuelos.py salida.db
"""
import os
import pathlib
import sqlite3
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
OUT = pathlib.Path(sys.argv[1]).resolve()
os.environ["TOPTRAVEL_HISTORY_DB"] = str(OUT)
import price_collector  # noqa: E402
import server  # noqa: E402

PAUSE = 0.33  # no pasa de las 200 consultas por minuto que se permite la web


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    price_collector.init_db()
    hubs = server.history_hubs()
    db = price_collector.connect()
    known = {row["code"] for row in db.execute("SELECT code FROM world_hubs")}
    missing = [hub for hub in hubs if hub not in known]
    print("orígenes por mirar:", len(missing), "de", len(hubs), flush=True)

    def destinations(code):
        time.sleep(PAUSE)
        return server.history_all_destinations(code)

    price_collector.discover_world_routes(db, destinations, missing, sleep=lambda _: None)
    routes = db.execute("SELECT COUNT(*) FROM world_routes").fetchone()[0]
    print("rutas:", routes, flush=True)
    db.close()

    def route_prices(origin, destination):
        for attempt in range(4):
            try:
                return server.history_route_prices(origin, destination)
            except server.Unavailable as error:
                if str(error) != "busy" and attempt == 3:
                    raise
                time.sleep(20)
        return {}

    last = None
    while True:
        db = price_collector.connect()
        state = db.execute("SELECT position, laps FROM world_state").fetchone()
        rows = db.execute("SELECT COUNT(*) FROM flight_prices").fetchone()[0]
        db.close()
        print(time.strftime("%H:%M"), "posición", state["position"] if state else 0, "de", routes, "filas", rows, flush=True)
        if state and state["laps"]:
            break
        if state and state["position"] == last:
            sys.exit("parado: demasiados fallos seguidos. Al repetirlo otro día, sigue por donde iba.")
        last = state["position"] if state else None
        price_collector.collect_world(destinations, lambda: hubs, route_prices, sleep=lambda _: time.sleep(PAUSE), budget=10 ** 9)
    db = sqlite3.connect(OUT)
    db.execute("PRAGMA journal_mode = DELETE")
    db.close()
    print("terminado", OUT.stat().st_size // 1024 // 1024, "MB", flush=True)


if __name__ == "__main__":
    main()
