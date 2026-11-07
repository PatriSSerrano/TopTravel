"""Comprueba en la web publicada todas las ciudades, una a una, y apunta lo que falle.

Revisa todos los hoteles y planes de cada ciudad (datos, ubicación, duplicados), y prueba precios
reales de 3 hoteles y vuelos reales. No consulta el precio de cada hotel: serían decenas de miles
de consultas a un servicio gratuito. Uso: python tools/comprobar_ciudades.py salida.json
"""
import gzip
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "tools")]
import ciudades  # noqa: E402
import server  # noqa: E402

BASE = "https://toptravel.alwaysdata.net"
PAUSE = 3.3  # los límites son de 20 búsquedas de hoteles o transporte por minuto
MAX_KM = server.XOTELO_MAX_KM + 2
KEY = re.compile(r"^g\d+-d\d+$")


def get(path, retry=True):
    request = urllib.request.Request(BASE + path, headers={"User-Agent": "TopTravel-comprobacion", "Accept-Encoding": "gzip"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
        return 200, json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw)
    except urllib.error.HTTPError as error:
        if error.code == 429 and retry:
            time.sleep(65)
            return get(path, False)
        return error.code, None
    except Exception as error:
        return type(error).__name__, None


def next_month(months):
    day = date.today().replace(day=1)
    for _ in range(months):
        day = (day + timedelta(days=32)).replace(day=1)
    return day


def check_city(city, airports, month):
    problems, r = [], {"ciudad": city}
    place = ciudades.place_of(city)
    q = urllib.parse.quote(place)
    point = server.geocode_local(place)
    status, body = get(f"/api/hotels?place={q}")
    if status != 200:
        problems.append(f"hoteles: error {status}")
        hotels = []
    else:
        hotels = body.get("hotels", [])
        center = body.get("center") or {"lat": point[0], "lon": point[1]}
        keyed = [h for h in hotels if h.get("key")]
        r.update(hoteles=len(hotels), con_precio=len(keyed), con_nota=sum(1 for h in hotels if h.get("rating")))
        r["sin_mapa"] = sum(1 for h in hotels if not isinstance(h.get("lat"), float))
        far = [h["name"] for h in hotels if isinstance(h.get("lat"), float) and server.distance_km(center["lat"], center["lon"], h["lat"], h["lon"]) > MAX_KM]
        bad_key = [h["name"] for h in keyed if not KEY.match(h["key"])]
        no_name = sum(1 for h in hotels if not (h.get("name") or "").strip())
        bad_rate = [h["name"] for h in hotels if h.get("rating") is not None and not 0 < h["rating"] <= 5]
        keys = [h["key"] for h in keyed]
        r["lejos"] = len(far)
        if far:
            problems.append(f"{len(far)} hoteles a más de {MAX_KM} km: {far[:3]}")
        if bad_key or no_name or bad_rate:
            problems.append(f"datos de hotel mal: claves {len(bad_key)}, sin nombre {no_name}, notas {len(bad_rate)}")
        if len(keys) != len(set(keys)):
            problems.append(f"{len(keys) - len(set(keys))} hoteles repetidos")
        if len(keyed) < 20:
            problems.append(f"solo {len(keyed)} hoteles con precio")
    time.sleep(PAUSE)

    source = ciudades.CITIES[city][1]
    status, body = get(f"/api/activities?place={q}")
    if status != 200:
        problems.append(f"planes: error {status}")
    else:
        items = body.get("activities", [])
        r["planes"] = len(items)
        r["negocios"] = sum(1 for a in items if a["kind"] in ("bar", "restaurante", "cafeteria", "discoteca"))
        if source:
            far = [a["name"] for a in items if server.distance_km(point[0], point[1], a["lat"], a["lon"]) > MAX_KM]
            names = [(a["name"], a["kind"]) for a in items]
            if far:
                problems.append(f"{len(far)} planes lejos: {far[:3]}")
            if len(names) != len(set(names)):
                problems.append(f"{len(names) - len(set(names))} planes repetidos")
            if len(items) < 100:
                problems.append(f"solo {len(items)} planes")
    if point:
        status, body = get(f"/api/monuments?lat={point[0]}&lon={point[1]}") if source else (None, None)
        if status == 200:
            r["monumentos"] = len(body.get("monuments", []))
        elif source:
            r["monumentos"] = f"error {status}"
        status, body = get(f"/api/transit?lat={point[0]}&lon={point[1]}&part=rail") if source else (None, None)
        if status == 200:
            r["lineas"] = len(body.get("lines", []))
        elif source:
            r["lineas"] = f"error {status}"
    time.sleep(PAUSE)

    # Precios reales de 3 hoteles, para fechas dentro de dos meses.
    start = next_month(2) + timedelta(days=14)
    end = start + timedelta(days=2)
    priced = tried = 0
    for hotel in [h for h in hotels if h.get("key")][:3]:
        tried += 1
        query = urllib.parse.urlencode({"key": hotel["key"], "in": start, "out": end, "adults": 2, "rooms": 1})
        status, body = get(f"/api/rates?{query}")
        if status == 200 and body.get("rates"):
            priced += 1
        time.sleep(1.2)
    r["precios"] = f"{priced}/{tried}"
    if tried and not priced:
        problems.append("ningún precio de hotel en la prueba")

    # Vuelos reales: el calendario de un mes.
    code = airports.get((city, ciudades.CITIES[city][0]))
    if code:
        origin = "BCN" if code == "MAD" else "MAD"
        status, body = get(f"/api/calendar?origin={origin}&dest={code}&month={month}")
        r["dias_con_vuelo"] = len(body.get("days", {})) if status == 200 else f"error {status}"
        if status != 200:
            problems.append(f"vuelos: error {status}")
        elif not body.get("days"):
            problems.append(f"sin vuelos {origin}-{code} en {month}")
    else:
        r["dias_con_vuelo"] = "sin aeropuerto"
    r["problemas"] = problems
    return r


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    out = pathlib.Path(sys.argv[1])
    rows = json.loads((ROOT / "vendor" / "aeropuertos.json").read_text(encoding="utf-8"))
    airports = {}
    for code, city, country, _ in rows:
        airports.setdefault((city, country), code)
    fixed = re.findall(r"\['([A-Z]{3})', '([^']+)', '([^']+)',", (ROOT / "app.js").read_text(encoding="utf-8"))
    for code, city, country in fixed:
        airports[(city, country)] = code
    month = next_month(2).strftime("%Y-%m")
    done = json.loads(out.read_text(encoding="utf-8")) if out.exists() else []
    seen = {r["ciudad"] for r in done}
    for city in ciudades.CITIES:
        if city in seen:
            continue
        result = check_city(city, airports, month)
        done.append(result)
        out.write_text(json.dumps(done, ensure_ascii=False, indent=0), encoding="utf-8")
        print(city, {k: v for k, v in result.items() if k not in ("ciudad", "problemas")}, "PROBLEMAS: " + "; ".join(result["problemas"]) if result["problemas"] else "ok", flush=True)
    print(f"terminado: {len(done)} ciudades, {sum(1 for r in done if r['problemas'])} con problemas", flush=True)


if __name__ == "__main__":
    main()
