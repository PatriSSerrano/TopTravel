"""Guarda, ciudad por ciudad, la lista de hoteles de Xotelo: código de precio, ubicación, tipo y nota.

Los precios se siguen pidiendo en el momento: aquí solo se guarda quién existe y dónde está.
Va despacio para no cargar el servicio gratuito. Se puede repetir: lo reciente se salta.
Uso: python tools/hacer_xotelo.py [Ciudad ...]
"""
import collections
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "tools")]
import ciudades  # noqa: E402
import server  # noqa: E402

PATH = ROOT / "hoteles_destacados.json"
PAGES = 5
PAGE_SIZE = 100
PAUSE = 2.0
FRESH_DAYS = 25
FOREVER = 10 * 365 * 86400
# Ciudades sin ningún hotel elegido todavía: su código de zona no se puede deducir.
EXTRA_ZONES = {"Kiev": "g294474"}
KINDS = {"Hotel": "Hotel", "Hostel": "Albergue", "Specialty Hotel": "Hotel con encanto", "Bed and Breakfast": "Casa de huéspedes", "B&B": "Casa de huéspedes", "Inn": "Hostal", "Motel": "Motel", "Resort": "Resort", "Apartment": "Apartamento", "Vacation Rental": "Apartamento"}


def fetch_page(zone, offset):
    query = urllib.parse.urlencode({"location_key": zone, "limit": PAGE_SIZE, "offset": offset, "sort": "best_value"})
    request = urllib.request.Request(f"{server.XOTELO_LIST_BASE}/list?{query}", headers={"User-Agent": "TopTravel/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=40) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise ValueError(str(payload["error"])[:100])
    return payload.get("result") or {}


def clean(item, lat, lon):
    geo = item.get("geo") or {}
    plat, plon, key, name = geo.get("latitude"), geo.get("longitude"), item.get("key") or "", item.get("name") or ""
    if not isinstance(plat, (int, float)) or not isinstance(plon, (int, float)) or not name or not server.XOTELO_KEY.fullmatch(key):
        return None
    if server.distance_km(lat, lon, plat, plon) > server.XOTELO_MAX_KM:
        return None
    review = item.get("review_summary") or {}
    url = str(item.get("url") or "")
    row = {"key": key, "name": name[:160], "kind": KINDS.get(item.get("accommodation_type"), "Alojamiento"), "lat": round(plat, 6), "lon": round(plon, 6)}
    if isinstance(review.get("rating"), (int, float)) and review["rating"] > 0:
        row["rating"], row["reviews"] = review["rating"], int(review.get("count") or 0)
    if url.startswith("https://www.tripadvisor.com/Hotel_Review-"):
        row["url"] = url[:300]
    return row


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    only = set(sys.argv[1:])
    data = json.loads(PATH.read_text(encoding="utf-8"))
    groups = {g["city"]: g for g in data}
    total = errors = filled = 0
    for city in ciudades.CITIES:
        if only and city not in only:
            continue
        point = server.geocode_local(ciudades.place_of(city))
        group = groups.get(city, {"hotels": []})
        prefixes = collections.Counter(h["key"].split("-")[0] for h in group["hotels"])
        asia = ciudades.ASIA_ZONES.get(city)
        zone = EXTRA_ZONES.get(city) or (asia[1] if asia else None) or (prefixes.most_common(1)[0][0] if prefixes else None)
        if not point or not zone:
            print(f"{city}: sin zona", flush=True)
            continue
        key = f"x|{round(point[0], 2)}|{round(point[1], 2)}"
        path = server.map_path(key)
        if not only and path.exists() and server.read_map(key) and time.time() - path.stat().st_ctime < FRESH_DAYS * 86400:
            continue
        rows = {}
        try:
            for page in range(PAGES):
                result = fetch_page(zone, page * PAGE_SIZE)
                items = result.get("list") or []
                for item in items:
                    row = clean(item, *point)
                    if row:
                        rows[row["key"]] = row
                time.sleep(PAUSE)
                if len(items) < PAGE_SIZE:
                    break
        except (OSError, ValueError) as error:
            errors += 1
            print(f"{city}: fallo en la lista ({type(error).__name__})", flush=True)
            time.sleep(PAUSE * 5)
            if not rows:
                continue
        server.store_map(key, {"hotels": list(rows.values())}, time.time() + FOREVER)
        # Lo que ya se elegía a mano gana la ubicación exacta que da la lista.
        changed = 0
        for hotel in group["hotels"]:
            row = rows.get(hotel["key"])
            if row and not hotel.get("lat"):
                hotel["lat"], hotel["lon"] = row["lat"], row["lon"]
                changed += 1
        if changed:
            filled += changed
            PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        total += len(rows)
        rated = sum(1 for r in rows.values() if r.get("rating"))
        print(f"{city} ({zone}): {len(rows)} hoteles, {rated} con nota, {changed} ubicados", flush=True)
    print(f"terminado: {total} hoteles, {filled} ubicados, {errors} fallos", flush=True)


if __name__ == "__main__":
    main()
