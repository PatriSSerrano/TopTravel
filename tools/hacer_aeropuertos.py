"""Crea vendor/aeropuertos.json: todos los aeropuertos con vuelos, para el buscador.

Sale de los datos públicos de Travelpayouts, con los nombres de ciudad y país en español.
Uso: python tools/hacer_aeropuertos.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import server  # noqa: E402

TARGET = ROOT / "vendor" / "aeropuertos.json"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    data = server.places()
    airports = server.fetch_json(f"{server.API_BASE}/data/es/airports.json")
    rows = []
    for item in airports:
        if not item.get("flightable") or item.get("iata_type") != "airport" or not item.get("code"):
            continue
        city = data["cities"].get(item.get("city_code") or "")
        country = data["countries"].get(item.get("country_code") or "")
        if not city or not country:
            continue
        rows.append([item["code"], city[0], country, item.get("name") or ""])
    rows.sort(key=lambda r: (r[1], r[0]))
    TARGET.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(rows)} aeropuertos, {TARGET.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
