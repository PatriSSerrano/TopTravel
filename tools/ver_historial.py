"""Enseña cuántos datos lleva guardados el historial de precios."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import price_collector as pc  # noqa: E402


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not pc.DB_PATH.exists():
        print("Todavía no hay historial.")
        return
    db = pc.connect()
    for table, what in (("flight_prices", "vuelos"), ("hotel_prices", "hoteles")):
        row = db.execute(f"SELECT COUNT(*) AS n, MIN(seen_day) AS first, MAX(seen_day) AS last FROM {table}").fetchone()
        print(f"{what}: {row['n']} precios, del {row['first']} al {row['last']}")
    print(f"tamaño: {pc.DB_PATH.stat().st_size / 1024 / 1024:.1f} MB")
    routes = db.execute("SELECT COUNT(*) AS n FROM world_routes").fetchone()["n"]
    state = db.execute("SELECT position, laps FROM world_state").fetchone()
    if state:
        print(f"mundo: {routes} rutas, posición {state['position']}, {state['laps']} vueltas completas")
    for row in db.execute("SELECT * FROM runs ORDER BY day DESC, job LIMIT 6"):
        state = "terminado" if row["finished"] else "en marcha"
        print(f"{row['day']} {row['job']}: {row['position']}/{row['total']}, {row['new_rows']} cambios, {row['errors']} errores, {state}")
    db.close()


if __name__ == "__main__":
    main()
