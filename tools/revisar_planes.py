"""Quita de los planes los sitios cerrados, comparándolos con Overture Maps (datos abiertos y gratuitos).

OpenStreetMap tarda en reflejar los cierres. Overture indica si cada lugar sigue abierto y con
qué fiabilidad. Los negocios deben estar confirmados. Museos, teatros y similares solo se quitan
si constan cerrados. Monumentos, parques y miradores no se tocan: no cierran como un negocio, y
Overture puede darlos por cerrados aunque sigan ahí.
Lo quitado se apunta en data/planes-quitados.json. Se puede repetir: lo revisado se salta.
Uso: python tools/revisar_planes.py [Ciudad ...]
"""
import collections
import json
import math
import pathlib
import re
import sys
import time
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "tools")]
import duckdb  # noqa: E402

import ciudades  # noqa: E402
import server  # noqa: E402

RELEASE = "2026-10-21.0"
SOURCE = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"
BUSINESS = {"bar", "discoteca", "restaurante", "cafeteria", "ocio"}
LANDMARKS = {"monumento", "naturaleza", "sitio", "arte", "mirador", "playa"}
MIN_CONFIDENCE = 0.5
MATCH_KM = 0.25
CELL = 0.003
FOREVER = 10 * 365 * 86400
REMOVED_FILE = ROOT / "data" / "planes-quitados.json"
GENERIC = {"bar", "cafe", "cafeteria", "restaurante", "restaurant", "the", "la", "el", "los", "las", "de", "del", "y", "and", "club", "pub", "museo", "museum", "parque", "park"}
# Solo cuando el nombre lo avisa de forma expresa: «Cerrado de Calderón» es un parque.
CLOSED_NAME = re.compile(r"\((cerrado|closed|geschlossen|fermé|ferme)\)|permanently closed|cerrado permanentemente", re.I)


def plain(text):
    return re.sub(r"[^a-z0-9 ]", " ", unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower())


def words(text):
    return {w for w in plain(text).split() if len(w) > 1 and w not in GENERIC}


def places_near(db, lat, lon):
    km = server.MAP_RADIUS_KM + 1.5
    dlat, dlon = km / 110.574, km / (111.32 * math.cos(math.radians(lat)))
    rows = db.execute(f"""
        SELECT names.primary, confidence, operating_status, (bbox.ymin + bbox.ymax) / 2, (bbox.xmin + bbox.xmax) / 2
        FROM read_parquet('{SOURCE}', hive_partitioning = 1)
        WHERE bbox.xmin BETWEEN {lon - dlon} AND {lon + dlon} AND bbox.ymin BETWEEN {lat - dlat} AND {lat + dlat}
    """).fetchall()
    cells = collections.defaultdict(list)
    for row in rows:
        cells[(int(row[3] / CELL), int(row[4] / CELL))].append(row)
    return cells, len(rows)


def find(cells, item):
    mine, full = words(item["name"]), plain(item["name"]).strip()
    best = None
    a, b = int(item["lat"] / CELL), int(item["lon"] / CELL)
    for i in range(a - 1, a + 2):
        for j in range(b - 1, b + 2):
            for row in cells.get((i, j), ()):
                distance = server.distance_km(item["lat"], item["lon"], row[3], row[4])
                if distance > MATCH_KM:
                    continue
                theirs = words(row[0])
                if (plain(row[0]).strip() == full or (mine and theirs and len(mine & theirs) / min(len(mine), len(theirs)) >= 0.6)) and (best is None or distance < best[0]):
                    best = (distance, row)
    return best[1] if best else None


def verdict(item, match):
    """Devuelve por qué se quita, o None si se queda."""
    if CLOSED_NAME.search(item["name"]):
        return "marcado cerrado en OpenStreetMap"
    if item["kind"] in LANDMARKS:
        return None
    if str(item.get("opening_hours", "")).strip().lower() in ("closed", "off"):
        return "marcado cerrado en OpenStreetMap"
    if match and (match[2] == "permanently_closed" or match[1] == 0):
        # Un museo conocido suele estar en obras, no cerrado para siempre: ante la duda, se queda.
        if item["kind"] not in BUSINESS and (item.get("wikipedia") or item.get("wikidata")):
            return None
        return "cerrado definitivamente"
    if match and match[2] == "temporarily_closed" and item["kind"] in BUSINESS:
        return "cerrado temporalmente"
    if item["kind"] in BUSINESS:
        if not match:
            return "negocio sin confirmar"
        if (match[1] or 0) < MIN_CONFIDENCE:
            return "negocio con poca fiabilidad"
    return None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    only = set(sys.argv[1:])
    removed = json.loads(REMOVED_FILE.read_text(encoding="utf-8")) if REMOVED_FILE.exists() else {}
    db = duckdb.connect()
    db.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    totals = collections.Counter()
    for city, (_, source) in ciudades.CITIES.items():
        if not source or (only and city not in only):
            continue
        lat, lon = server.geocode_local(ciudades.place_of(city))
        key = f"a|{round(lat, 2)}|{round(lon, 2)}"
        data = server.read_map(key)
        if not data or data.get("revisado") == RELEASE:
            continue
        started = time.time()
        for attempt in range(3):
            try:
                cells, seen = places_near(db, lat, lon)
                break
            except duckdb.Error as error:
                print(f"{city}: reintento ({type(error).__name__})", flush=True)
                time.sleep(30)
        else:
            totals["fallos"] += 1
            continue
        if seen < 200:  # si casi no hay datos de esa zona, no se puede juzgar: se deja igual
            print(f"{city}: solo {seen} lugares en Overture, sin tocar", flush=True)
            totals["sin_datos"] += 1
            continue
        kept, gone, reasons = [], [], collections.Counter()
        for item in data["activities"]:
            why = verdict(item, find(cells, item))
            if why:
                gone.append({"name": item["name"], "kind": item["kind"], "why": why})
                reasons[why] += 1
            else:
                kept.append(item)
        server.store_map(key, {"activities": kept, "revisado": RELEASE}, time.time() + FOREVER)
        removed[city] = gone
        REMOVED_FILE.write_text(json.dumps(removed, ensure_ascii=False, indent=0), encoding="utf-8")
        totals["quitados"] += len(gone)
        totals["quedan"] += len(kept)
        print(f"{city}: {len(kept)} quedan, {len(gone)} quitados {dict(reasons)} ({time.time() - started:.0f} s)", flush=True)
    print("terminado:", dict(totals), flush=True)


if __name__ == "__main__":
    main()
