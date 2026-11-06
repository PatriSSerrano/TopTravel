"""Completa los hoteles con precio a los que les falta ubicación o ficha.

Primero busca en los datos propios de OpenStreetMap y, si no están, en Nominatim, sin pasar
de una consulta por segundo. Solo acepta un resultado si coincide lo que distingue al hotel,
no la marca ni la ciudad. Se puede repetir: lo ya completado no se toca.
Uso: python tools/completar_hoteles.py [Ciudad ...]
"""
import json
import pathlib
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "tools")]
import ciudades  # noqa: E402
import server  # noqa: E402

PATH = ROOT / "hoteles_destacados.json"
MAX_KM = 30
PAUSE = 1.1
GENERIC = {
    "hotel", "hotels", "hostel", "hostal", "apartments", "apartment", "apartamentos", "suites", "suite", "resort", "spa", "boutique", "inn",
    "the", "and", "by", "del", "des", "der", "las", "los", "collection", "luxury", "city", "center", "centre", "centro", "plaza", "grand", "palace",
    "ihg", "hyatt", "sheraton", "westin", "holiday", "express", "best", "western", "plus", "hampton", "doubletree", "embassy", "courtyard",
    "scandic", "marriott", "hilton", "novotel", "radisson", "travelodge", "mercure", "ibis", "meininger", "motel", "one", "premier", "accor", "autograph", "curio", "tribute",
}


def plain(text):
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def words(text, city_words=frozenset()):
    return set(re.findall(r"[a-z0-9]{3,}", plain(text))) - GENERIC - city_words


def same_hotel(a, b, city_words):
    mine, theirs = words(a, city_words), words(b, city_words)
    if not mine or not theirs:
        return False
    return len(mine & theirs) / min(len(mine), len(theirs)) >= 0.6 and len(mine & theirs) / max(len(mine), len(theirs)) >= 0.5


def nominatim(query):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 3})
    request = urllib.request.Request(url, headers={"User-Agent": server.WIKIDATA_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except (OSError, ValueError):
        return []
    finally:
        time.sleep(PAUSE)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    server._hotels.update(server.load_hotels())
    only = set(sys.argv[1:])
    data = json.loads(PATH.read_text(encoding="utf-8"))
    own_hits = web_hits = none = 0
    for group in data:
        city = group["city"]
        if only and city not in only:
            continue
        place = ciudades.place_of(city)
        city_words = frozenset(words(city) | words(place))
        lodging = (server.own_city_data(place) or {}).get("hotels", [])
        changed = False
        for hotel in group["hotels"]:
            match = next((h for h in lodging if same_hotel(hotel["name"], h["name"], city_words)), None)
            if match:
                for field in ("address", "website", "stars"):
                    if match.get(field) and not hotel.get(field):
                        hotel[field] = match[field]
                        changed = True
                if match.get("kind") and not hotel.get("lodging"):
                    hotel["lodging"] = match["kind"]
                    changed = True
            if hotel.get("lat"):
                continue
            if match and isinstance(match.get("lat"), float):
                hotel["lat"], hotel["lon"] = round(match["lat"], 6), round(match["lon"], 6)
                own_hits += 1
                changed = True
                continue
            short = re.sub(r"\s+-\s+.*$|,.*$", "", hotel["name"]).strip()
            found = False
            for option in dict.fromkeys((hotel["name"], short)):
                for row in nominatim(f"{option}, {city}"):
                    lat, lon = float(row["lat"]), float(row["lon"])
                    label = row.get("name") or row.get("display_name", "").split(",")[0]
                    if row.get("category") in ("tourism", "building", "amenity") and server.distance_km(lat, lon, group["lat"], group["lon"]) <= MAX_KM and same_hotel(hotel["name"], label, city_words):
                        hotel["lat"], hotel["lon"] = round(lat, 6), round(lon, 6)
                        found = changed = True
                        web_hits += 1
                        break
                if found:
                    break
            if not found:
                none += 1
        if changed:
            PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{city}: {sum(1 for h in group['hotels'] if h.get('lat'))} de {len(group['hotels'])} en el mapa", flush=True)
    print(f"terminado: {own_hits} con datos propios, {web_hits} con Nominatim, {none} sin encontrar", flush=True)


if __name__ == "__main__":
    main()
