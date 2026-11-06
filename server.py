"""Servidor de TopTravel.

Sirve la web y pide los precios a Travelpayouts sin exponer la clave.
Uso: python server.py [--host 0.0.0.0] [--port 8000] [--behind-proxy]
La clave se lee de .env en cada petición: no hace falta reiniciar al añadirla.
"""
import argparse
import concurrent.futures
import gzip
import hashlib
import html
import json
import math
import os
import re
import socket
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import accounts

ROOT = Path(__file__).resolve().parent
API_BASE = os.environ.get("TP_API_BASE", "https://api.travelpayouts.com")
CACHE_SECONDS = 1800
CACHE_MAX = 500
MAX_TRIP_DAYS = 30
MAP_CACHE_FILE = ROOT / "data" / "mapas.json"  # formato antiguo: se convierte al arrancar
MAP_DIR = ROOT / "data" / "mapas"
MAP_FILES_MAX = 800
GZIP_MIN_BYTES = 1024
# Una ciudad grande puede devolver decenas de MB: con poca memoria se bajan estos valores.
OVERPASS_MAX_BYTES = int(os.environ.get("OVERPASS_MAX_MB", "80")) * 1024 * 1024
OVERPASS_SLOTS = int(os.environ.get("OVERPASS_SLOTS", "2"))
MAP_CACHE_SECONDS = 30 * 86400
MONTHS_AHEAD = 8
MAP_RADIUS_KM = 7
XOTELO_BASE = "https://data.xotelo.com/api"
XOTELO_LIST_BASE = os.environ.get("XOTELO_LIST_BASE", XOTELO_BASE)
XOTELO_LIST_OK_SECONDS = 7 * 86400
XOTELO_LIST_RETRY_SECONDS = 1800
XOTELO_RATES_SECONDS = 3600
XOTELO_MAX_KM = 9
XOTELO_CITY_KM = 40
XOTELO_KEY = re.compile(r"\bg\d+-d\d+\b")

# Solo se sirven estos archivos: .env y server.py nunca salen del ordenador.
STATIC = {
    "/": ("landing.html", "text/html; charset=utf-8"),
    "/buscar": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/landing.css": ("landing.css", "text/css; charset=utf-8"),
    "/landing.js": ("landing.js", "text/javascript; charset=utf-8"),
    "/theme.js": ("theme.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/vendor/leaflet.js": ("vendor/leaflet.js", "text/javascript; charset=utf-8"),
    "/vendor/leaflet.css": ("vendor/leaflet.css", "text/css; charset=utf-8"),
    "/vendor/world.json": ("vendor/world.json", "application/json; charset=utf-8"),
    "/vendor/labels.json": ("vendor/labels.json", "application/json; charset=utf-8"),
    "/vendor/globo.json": ("vendor/globo.json", "application/json; charset=utf-8"),
    "/vendor/roma.json": ("vendor/roma.json", "application/json; charset=utf-8"),
}

IATA = re.compile(r"^[A-Z]{3}$")
MONTH = re.compile(r"^\d{4}-\d{2}$")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

HOTELS_CACHE_SECONDS = 30 * 86400
HOTELS_PARTIAL_SECONDS = 86400
HOTELS_FILE = ROOT / "data" / "hotels.json"
PLACES_FILE = ROOT / "data" / "places.json"
LODGING = {"hotel": "Hotel", "apartment": "Apartamento", "hostel": "Hostal", "guest_house": "Pensión"}

# Web oficial de las aerolíneas más habituales (código IATA).
AIRLINE_SITES = {
    "IB": "iberia.com", "I2": "iberia.com", "UX": "aireuropa.com", "VY": "vueling.com", "FR": "ryanair.com",
    "V7": "volotea.com", "NT": "bintercanarias.com", "U2": "easyjet.com", "EC": "easyjet.com", "W6": "wizzair.com",
    "W4": "wizzair.com", "TP": "flytap.com", "LH": "lufthansa.com", "AF": "airfrance.es", "KL": "klm.es",
    "BA": "britishairways.com", "AZ": "ita-airways.com", "EI": "aerlingus.com", "LX": "swiss.com", "OS": "austrian.com",
    "SN": "brusselsairlines.com", "EW": "eurowings.com", "HV": "transavia.com", "TO": "transavia.com", "DY": "norwegian.com",
    "D8": "norwegian.com", "SK": "flysas.com", "AY": "finnair.com", "A3": "aegeanair.com", "TK": "turkishairlines.com",
    "PC": "flypgs.com", "EK": "emirates.com", "QR": "qatarairways.com", "EY": "etihad.com", "AT": "royalairmaroc.com",
    "DL": "delta.com", "UA": "united.com", "AA": "aa.com", "B6": "jetblue.com", "AC": "aircanada.com",
    "AM": "aeromexico.com", "Y4": "volaris.com", "AV": "avianca.com", "LA": "latamairlines.com", "AR": "aerolineas.com.ar",
    "CM": "copaair.com", "JL": "jal.com", "NH": "ana.co.jp", "TG": "thaiairways.com", "SQ": "singaporeair.com",
}
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
OVERPASS_MAIN_TIMEOUT = 110
OVERPASS_BACKUP_TIMEOUT = 45  # si el principal falla, los de reserva no deben alargar la espera
LEGAL_PAGES = {"/privacidad": "privacidad.html", "/aviso-legal": "aviso-legal.html"}
ASSET = re.compile(r"^/assets/[a-z0-9]+\.jpg$")

_cache = {}
_xotelo_lists = {}
_map_locks = {}
_map_refreshing = set()
_hotel_refreshing = set()
_static_files = {}
_overpass_slots = threading.Semaphore(OVERPASS_SLOTS)
TRUST_PROXY = False
_xotelo_slots = threading.Semaphore(4)
try:
    XOTELO_CITIES = json.loads((ROOT / "xotelo_cities.json").read_text(encoding="utf-8"))
except (OSError, ValueError):
    XOTELO_CITIES = []
try:
    CURATED_HOTELS = json.loads((ROOT / "hoteles_destacados.json").read_text(encoding="utf-8"))
except (OSError, ValueError):
    CURATED_HOTELS = []
_hotels = {}
_lock = threading.Lock()
_geo_lock = threading.Lock()
_last_geocode = 0.0
_airlines = None
_places = None
_places_lock = threading.Lock()


class Unavailable(Exception):
    """Travelpayouts no está configurado o no ha respondido."""


class GzJson(bytes):
    """Respuesta JSON ya comprimida, guardada en disco."""


def settings():
    values = {
        "TRAVELPAYOUTS_TOKEN": os.environ.get("TRAVELPAYOUTS_TOKEN", ""),
        "CONTACT_EMAIL": os.environ.get("CONTACT_EMAIL", ""),
        # Interruptores para dejar de usar un servicio sin tocar el código.
        "HOTEL_PRICES": os.environ.get("HOTEL_PRICES", "on"),
        "NOMINATIM": os.environ.get("NOMINATIM", "on"),
        # Correo para los avisos de precio: sin SMTP_HOST no se envía ninguno.
        "SMTP_HOST": os.environ.get("SMTP_HOST", ""),
        "SMTP_PORT": os.environ.get("SMTP_PORT", ""),
        "SMTP_USER": os.environ.get("SMTP_USER", ""),
        "SMTP_PASSWORD": os.environ.get("SMTP_PASSWORD", ""),
        "MAIL_FROM": os.environ.get("MAIL_FROM", ""),
        "SITE_URL": os.environ.get("SITE_URL", ""),
    }
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() in values:
                values[key.strip()] = value.strip().strip("'\"")
    return values


def fetch_json(url, headers=None, timeout=30):
    request = urllib.request.Request(url, headers={"User-Agent": "TopTravel/1.0", **(headers or {})})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
    return json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw)


def prices_for_dates(params):
    query = {"currency": "eur", "market": "es", "sorting": "price", "limit": 1000, **params}
    return tp_request("/aviasales/v3/prices_for_dates", query) or []


def tp_request(path, query):
    token = settings()["TRAVELPAYOUTS_TOKEN"]
    if not token:
        raise Unavailable("no_token")

    key = f"{path}?{urllib.parse.urlencode(sorted(query.items()))}"
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]

    url = f"{API_BASE}{key}"
    try:
        payload = fetch_json(url, {"X-Access-Token": token})
    except urllib.error.HTTPError as error:
        raise Unavailable("bad_token" if error.code in (401, 403) else "upstream") from error
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        raise Unavailable("upstream") from error
    if not payload.get("success"):
        raise Unavailable("upstream")

    rows = payload.get("data")
    with _lock:
        if len(_cache) >= CACHE_MAX:
            _cache.clear()
        _cache[key] = (now + CACHE_SECONDS, rows)
    return rows


# La fuente deja algunos nombres sin traducir o mal puestos ("Buda" por Budapest).
CITY_NAMES = {
    "ACE": "Lanzarote", "AER": "Sochi", "ALA": "Almaty", "BDS": "Brindisi", "BIO": "Bilbao", "BUD": "Budapest",
    "COR": "Córdoba (Argentina)", "EAS": "San Sebastián", "FLW": "Isla de Flores", "GZP": "Gazipaşa",
    "IGU": "Foz de Iguazú", "JTR": "Santorini", "LCG": "La Coruña", "LIR": "Liberia (Costa Rica)",
    "LPA": "Las Palmas de Gran Canaria", "MAA": "Chennai", "MAH": "Menorca", "MED": "Medina", "OKA": "Okinawa",
    "PEN": "Penang", "PLZ": "Port Elizabeth", "PRN": "Pristina", "PTP": "Pointe-à-Pitre", "QRO": "Querétaro",
    "RHO": "Rodas", "SEZ": "Seychelles", "SJC": "San José (California)", "SJO": "San José (Costa Rica)",
    "SRZ": "Santa Cruz de la Sierra", "SVQ": "Sevilla", "TER": "Isla Terceira", "TQO": "Tulum", "TUC": "Tucumán",
    "TUN": "Túnez", "VIL": "Dajla", "VLN": "Valencia (Venezuela)",
}


def places():
    """Ciudades, países y aeropuertos: se guardan en disco tras la primera descarga."""
    global _places
    with _places_lock:
        if _places is None:
            try:
                _places = json.loads(PLACES_FILE.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                try:
                    cities = fetch_json(f"{API_BASE}/data/es/cities.json")
                    countries = fetch_json(f"{API_BASE}/data/es/countries.json")
                    airports = fetch_json(f"{API_BASE}/data/en/airports.json")
                except (urllib.error.URLError, TimeoutError, ValueError) as error:
                    raise Unavailable("upstream") from error
                _places = {
                    "cities": {
                        c["code"]: [c.get("name") or c["code"], c["coordinates"]["lat"], c["coordinates"]["lon"], c.get("country_code")]
                        for c in cities if c.get("code") and c.get("coordinates")
                    },
                    "countries": {c["code"]: c.get("name") or c["code"] for c in countries if c.get("code")},
                    "airports": {a["code"]: a["city_code"] for a in airports if a.get("code") and a.get("city_code")},
                }
                PLACES_FILE.parent.mkdir(exist_ok=True)
                PLACES_FILE.write_text(json.dumps(_places, ensure_ascii=False), encoding="utf-8")
            for code, name in CITY_NAMES.items():
                if code in _places["cities"]:
                    _places["cities"][code][0] = name
    return _places


def airline_name(code):
    global _airlines
    if _airlines is None:
        try:
            rows = fetch_json(f"{API_BASE}/data/en/airlines.json")
            _airlines = {r["code"]: r.get("name") or r["code"] for r in rows if r.get("code")}
        except Exception:
            _airlines = {}
    return _airlines.get(code, code)


def offer(row):
    code = row.get("airline") or ""
    site = AIRLINE_SITES.get(code)
    return {
        "price": row.get("price"),
        "airline": code,
        "airlineName": airline_name(code),
        "flightNumber": row.get("flight_number"),
        "origin": row.get("origin_airport") or row.get("origin"),
        "destination": row.get("destination_airport") or row.get("destination"),
        "departureAt": row.get("departure_at"),
        "returnAt": row.get("return_at"),
        "transfers": row.get("transfers"),
        "returnTransfers": row.get("return_transfers"),
        "durationTo": row.get("duration_to") or row.get("duration"),
        "durationBack": row.get("duration_back"),
        "url": f"https://www.{site}" if site else "",
    }


def search_limit():
    """Último día que se puede buscar: el final del octavo mes a partir del actual."""
    today = date.today()
    months = today.month - 1 + MONTHS_AHEAD + 1
    return date(today.year + months // 12, months % 12 + 1, 1) - timedelta(days=1)


def valid_date(text):
    if not DATE.match(text):
        return False
    try:
        return date.fromisoformat(text) <= search_limit()
    except ValueError:
        return False


def api_calendar(q):
    origin, dest, month = q.get("origin", ""), q.get("dest", ""), q.get("month", "")
    if not (IATA.match(origin) and IATA.match(dest) and MONTH.match(month)) or month > search_limit().isoformat()[:7]:
        return 400, {"error": "bad_request"}
    rows = prices_for_dates({
        "origin": origin,
        "destination": dest,
        "departure_at": month,
        "one_way": "true",
        "direct": "true" if q.get("direct") == "1" else "false",
    })
    days = {}
    for row in rows:
        date = (row.get("departure_at") or "")[:10]
        price = row.get("price")
        if date.startswith(month) and isinstance(price, (int, float)):
            days[date] = min(days.get(date, price), price)
    return 200, {"days": days}


def api_day(q):
    origin, dest, depart, back = q.get("origin", ""), q.get("dest", ""), q.get("depart", ""), q.get("return", "")
    if not (IATA.match(origin) and IATA.match(dest) and valid_date(depart)) or (back and not valid_date(back)):
        return 400, {"error": "bad_request"}
    # Travelpayouts rechaza viajes de más de 30 días: la web mostrará cada tramo aparte.
    if back and (date.fromisoformat(back) - date.fromisoformat(depart)).days > MAX_TRIP_DAYS:
        return 200, {"offers": []}
    params = {
        "origin": origin,
        "destination": dest,
        "departure_at": depart,
        "one_way": "false" if back else "true",
        "direct": "true" if q.get("direct") == "1" else "false",
    }
    if back:
        params["return_at"] = back
    seen = set()
    offers = []
    for row in sorted(prices_for_dates(params), key=lambda r: r.get("price") or 0):
        identity = (row.get("airline"), row.get("flight_number"), row.get("departure_at"), row.get("return_at"))
        if identity in seen or not isinstance(row.get("price"), (int, float)):
            continue
        seen.add(identity)
        offers.append(offer(row))
        if len(offers) == 30:
            break
    return 200, {"offers": offers}


def geocode(place):
    global _last_geocode
    if settings()["NOMINATIM"] == "off":
        raise Unavailable("upstream")
    # Nominatim pide un máximo de una petición por segundo.
    with _geo_lock:
        wait = 1.1 - (time.time() - _last_geocode)
        if wait > 0:
            time.sleep(wait)
        _last_geocode = time.time()
        query = urllib.parse.urlencode({"q": place, "format": "jsonv2", "limit": 1, "accept-language": "es"})
        rows = fetch_json(f"https://nominatim.openstreetmap.org/search?{query}")
    return (float(rows[0]["lat"]), float(rows[0]["lon"])) if rows else None


def overpass(lat, lon):
    query = (
        '[out:json][timeout:12];nwr["tourism"~"^(hotel|apartment|hostel|guest_house)$"]["name"]'
        f"(around:7000,{lat:.5f},{lon:.5f});out center tags 400;"
    )
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")

    def ask(url):
        request = urllib.request.Request(url, data=body, headers={"User-Agent": "TopTravel/1.0"})
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.load(response)
        if payload.get("remark") and not payload.get("elements"):
            raise ValueError(payload["remark"])
        return payload.get("elements", [])

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=len(OVERPASS_URLS))
    futures = [pool.submit(ask, url) for url in OVERPASS_URLS]
    last_error = None
    try:
        for future in concurrent.futures.as_completed(futures, timeout=14):
            try:
                return future.result()
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
                last_error = error
    except TimeoutError as error:
        last_error = error
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    raise Unavailable("upstream") from last_error


def nominatim_lodging(lat, lon):
    # Vía alternativa cuando Overpass está saturado: da menos resultados.
    if settings()["NOMINATIM"] == "off":
        raise Unavailable("upstream")
    box = f"{lon - 0.08:.5f},{lat + 0.06:.5f},{lon + 0.08:.5f},{lat - 0.06:.5f}"
    elements = []
    for term in ("hotel", "hostel", "apartment"):
        with _geo_lock:
            time.sleep(1.1)
            query = urllib.parse.urlencode({
                "q": term, "format": "jsonv2", "limit": 40, "extratags": 1, "addressdetails": 1,
                "accept-language": "es", "viewbox": box, "bounded": 1,
            })
            rows = fetch_json(f"https://nominatim.openstreetmap.org/search?{query}")
        for row in rows:
            if row.get("category") != "tourism" or not row.get("name"):
                continue
            address = row.get("address") or {}
            elements.append({"lat": row.get("lat"), "lon": row.get("lon"), "tags": {
                **(row.get("extratags") or {}),
                "name": row["name"],
                "tourism": row.get("type"),
                "addr:street": address.get("road"),
                "addr:housenumber": address.get("house_number"),
            }})
    return elements


def hotel_from(element):
    tags = element.get("tags", {})
    website = (tags.get("website") or tags.get("contact:website") or "").strip()
    if website.startswith("www."):
        website = f"https://{website}"
    if not website.startswith(("https://", "http://")):
        website = ""
    stars = re.match(r"^([1-5])(?:\.\d)?", tags.get("stars") or "")
    street = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")]))
    center = element.get("center") or {}
    lat, lon = element.get("lat", center.get("lat")), element.get("lon", center.get("lon"))
    linked = " ".join(str(tags.get(name) or "") for name in ("contact:tripadvisor", "tripadvisor", "website"))
    found = XOTELO_KEY.search(linked)
    return {
        "key": found.group(0) if found else "",
        "lat": float(lat) if lat is not None else None,
        "lon": float(lon) if lon is not None else None,
        "name": tags.get("name", ""),
        "kind": LODGING.get(tags.get("tourism"), "Alojamiento"),
        "stars": int(stars.group(1)) if stars else 0,
        "address": street,
        "website": website,
    }


def load_hotels():
    try:
        return json.loads(HOTELS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_hotels():
    HOTELS_FILE.parent.mkdir(exist_ok=True)
    temp = HOTELS_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(_hotels, ensure_ascii=False), encoding="utf-8")
    temp.replace(HOTELS_FILE)


def find_lodging(place):
    point = geocode(place)
    if not point:
        return [], True, None
    try:
        return overpass(*point), True, point
    except Unavailable:
        return nominatim_lodging(*point), False, point


def distance_km(lat1, lon1, lat2, lon2):
    x = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    y = math.radians(lat2 - lat1)
    return 6371 * math.hypot(x, y)


def xotelo_get(base, path, params):
    query = urllib.parse.urlencode(params)
    with _xotelo_slots:
        payload = fetch_json(f"{base}/{path}?{query}", {"Accept": "application/json"})
    if payload.get("error"):
        raise ValueError("xotelo")
    return payload.get("result") or {}


def xotelo_list(center):
    """Hoteles con código para esa ciudad; si el servicio falla, lista vacía."""
    near = min(XOTELO_CITIES, key=lambda c: distance_km(center["lat"], center["lon"], c[1], c[2]), default=None)
    if not near or distance_km(center["lat"], center["lon"], near[1], near[2]) > XOTELO_CITY_KM:
        return []
    now = time.time()
    with _lock:
        hit = _xotelo_lists.get(near[0])
    if hit and hit[0] > now:
        return hit[1]
    try:
        items = xotelo_get(XOTELO_LIST_BASE, "list", {"location_key": near[0], "limit": 100, "sort": "best_value"}).get("list") or []
        ttl = XOTELO_LIST_OK_SECONDS
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        items = hit[1] if hit else []
        ttl = XOTELO_LIST_RETRY_SECONDS
    with _lock:
        _xotelo_lists[near[0]] = (now + ttl, items)
    return items


CURATED_MATCH_KM = 0.5


def same_name(a, b):
    clean = lambda text: re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower())
    a, b = clean(a), clean(b)
    return bool(a) and (a == b or (len(a) > 7 and len(b) > 7 and (a in b or b in a)))


def same_curated_hotel(hotel, item):
    """Evita dar a un edificio el precio de otro de su cadena ("APA Hotel" y "APA Hotel Shinjuku")."""
    if not same_name(hotel["name"], item["name"]):
        return False
    if None not in (hotel.get("lat"), hotel.get("lon"), item.get("lat"), item.get("lon")):
        return distance_km(hotel["lat"], hotel["lon"], item["lat"], item["lon"]) <= CURATED_MATCH_KM
    clean = lambda text: re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower())
    # Sin ubicación que comparar, los nombres tienen que coincidir casi enteros.
    a, b = sorted((clean(hotel["name"]), clean(item["name"])), key=len)
    return len(a) / max(len(b), 1) >= 0.6


def add_price_keys(data):
    """Une nuestros alojamientos con su código de precios, sin tocar lo guardado."""
    if settings()["HOTEL_PRICES"] == "off":
        return data
    center = data.get("center")
    hotels = [dict(h) for h in data["hotels"]]
    if center:
        # Hoteles elegidos a mano: su código no depende de la lista de Xotelo.
        for group in CURATED_HOTELS:
            if distance_km(center["lat"], center["lon"], group["lat"], group["lon"]) > XOTELO_CITY_KM:
                continue
            for item in group["hotels"]:
                match = next((h for h in hotels if same_curated_hotel(h, item)), None)
                if match:
                    match["key"] = item["key"]
                else:
                    hotels.append({"key": item["key"], "name": item["name"], "kind": "Hotel", "stars": 0, "address": "", "website": "", "lat": item.get("lat"), "lon": item.get("lon")})
        for item in xotelo_list(center):
            geo = item.get("geo") or {}
            lat, lon, key, name = geo.get("latitude"), geo.get("longitude"), item.get("key") or "", item.get("name") or ""
            if lat is None or lon is None or not XOTELO_KEY.fullmatch(key) or not name:
                continue
            if distance_km(center["lat"], center["lon"], lat, lon) > XOTELO_MAX_KM:
                continue
            match = next((h for h in hotels if h.get("lat") is not None and distance_km(h["lat"], h["lon"], lat, lon) <= 0.25 and same_name(h["name"], name)), None)
            if match:
                match["key"] = key
            else:
                hotels.append({"key": key, "name": name, "kind": "Hotel", "stars": 0, "address": "", "website": "", "lat": lat, "lon": lon})
    return {**data, "hotels": hotels}


def api_hotels(q):
    status, data = lodging_list(q)
    return (status, add_price_keys(data)) if status == 200 else (status, data)


def read_center(q):
    try:
        lat, lon = float(q.get("lat", "")), float(q.get("lon", ""))
    except ValueError:
        return None
    return (round(lat, 2), round(lon, 2)) if -85 <= lat <= 85 and -180 <= lon <= 180 else None


def map_path(key):
    return MAP_DIR / f"{hashlib.sha1(key.encode('utf-8')).hexdigest()[:20]}.json.gz"


def store_map(key, data, stamp=None):
    MAP_DIR.mkdir(parents=True, exist_ok=True)
    path = map_path(key)
    temp = path.with_suffix(f".{threading.get_ident()}.tmp")
    temp.write_bytes(gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9))
    temp.replace(path)
    if stamp:
        os.utime(path, (stamp, stamp))
    files = sorted(MAP_DIR.glob("*.json.gz"), key=lambda f: f.stat().st_mtime)
    for old in files[:-MAP_FILES_MAX]:
        old.unlink(missing_ok=True)
    return path


def migrate_map_cache():
    """Pasa el archivo único antiguo a un archivo por ciudad, que no ocupa memoria."""
    try:
        old = json.loads(MAP_CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    for key, (expires, data) in old.items():
        store_map(key, data, expires - MAP_CACHE_SECONDS)
    MAP_CACHE_FILE.unlink(missing_ok=True)


def build_map(key, build):
    """Evita pedir lo mismo dos veces a la vez a un servicio externo."""
    with _lock:
        lock = _map_locks.setdefault(key, threading.Lock())
    with lock:
        path = map_path(key)
        if path.exists() and time.time() - path.stat().st_mtime < MAP_CACHE_SECONDS:
            return GzJson(path.read_bytes())
        data = build()
        # Un resultado vacío o incompleto no se guarda: se volverá a intentar.
        if not any(data.values()) or data.get("partial"):
            return data
        return GzJson(store_map(key, data).read_bytes())


def refresh_map(key, build):
    try:
        build_map(key, build)
    except Exception as error:
        print(f"No se ha podido renovar un mapa: {type(error).__name__}", flush=True)
    finally:
        with _lock:
            _map_refreshing.discard(key)


def cached_map_data(key, build):
    """Monumentos y transporte cambian poco: lo guardado sale al momento y se renueva aparte."""
    path = map_path(key)
    try:
        raw, age = path.read_bytes(), time.time() - path.stat().st_mtime
    except OSError:
        raw, age = None, 0
    if raw:
        if age >= MAP_CACHE_SECONDS:
            with _lock:
                start = key not in _map_refreshing
                _map_refreshing.add(key)
            if start:
                threading.Thread(target=refresh_map, args=(key, build), daemon=True).start()
        return GzJson(raw)
    try:
        return build_map(key, build)
    except (Unavailable, urllib.error.URLError, TimeoutError, ValueError, KeyError, OSError) as error:
        raise Unavailable("upstream") from error


# Tipos de lugar que interesan a un visitante. Se comparan directamente, sin recorrer
# subtipos: esa parte era la más lenta de la consulta y agotaba el cupo de Wikidata.
MONUMENT_CLASSES = " ".join(f"wd:Q{n}" for n in (
    570116, 4989906, 33506, 207694, 839954, 16970, 2977, 163687, 108325, 23413, 16560, 53060, 174782, 12518, 12280,
    44539, 32815, 34627, 483453, 22698, 11303, 2319498, 24354, 153562, 483110, 179700, 1081138, 1329623, 1785071,
    5003624, 57821, 1370598, 811979, 41176, 200023, 751876, 1307276, 15243209, 3947, 7075,
))
WIKIDATA_AGENT = "TopTravel/1.0 (https://github.com/PatriSSerrano/TopTravel)"
_wikidata_slot = threading.Lock()
_wikidata_until = 0.0


def wikidata_rows(sparql):
    """Una consulta cada vez, y sin insistir si Wikidata pide esperar."""
    global _wikidata_until
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": sparql, "format": "json"})
    with _wikidata_slot:
        if time.time() < _wikidata_until:
            raise Unavailable("busy")
        try:
            return fetch_json(url, {"Accept": "application/sparql-results+json", "User-Agent": WIKIDATA_AGENT}, timeout=65)["results"]["bindings"]
        except urllib.error.HTTPError as error:
            if error.code == 429:
                wait = error.headers.get("Retry-After") or ""
                _wikidata_until = time.time() + (int(wait) if wait.isdigit() else 120)
            raise


def build_monuments(lat, lon):
    sparql = f"""
SELECT ?item ?itemLabel (SAMPLE(?img) AS ?image) (SAMPLE(?c) AS ?coord) (MAX(?links) AS ?popular) WHERE {{
  SERVICE wikibase:around {{ ?item wdt:P625 ?c . bd:serviceParam wikibase:center "Point({lon} {lat})"^^geo:wktLiteral ; wikibase:radius "{MAP_RADIUS_KM}" . }}
  ?item wdt:P18 ?img ; wikibase:sitelinks ?links .
  FILTER(?links >= 8)
  ?item wdt:P31 ?class .
  VALUES ?class {{ {MONUMENT_CLASSES} }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "es,en". }}
}} GROUP BY ?item ?itemLabel ORDER BY DESC(?popular) LIMIT 40
"""
    rows = wikidata_rows(sparql)
    monuments = []
    for row in rows:
        name = row["itemLabel"]["value"]
        point = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", row["coord"]["value"])
        if not point or re.fullmatch(r"Q\d+", name):
            continue
        file_name = urllib.parse.unquote(row["image"]["value"].rsplit("/", 1)[-1])
        quoted = urllib.parse.quote(file_name.replace(" ", "_"))
        monuments.append({
            "name": name[:120],
            "lat": float(point.group(2)),
            "lon": float(point.group(1)),
            "image": f"https://commons.wikimedia.org/wiki/Special:FilePath/{quoted}?width=480",
            "credit": f"https://commons.wikimedia.org/wiki/File:{quoted}",
        })
    return {"monuments": monuments}


def api_monuments(q):
    center = read_center(q)
    if not center:
        return 400, {"error": "bad_request"}
    return 200, cached_map_data(f"m|{center[0]}|{center[1]}", lambda: build_monuments(*center))


TRANSIT_KINDS = {"subway": "metro", "light_rail": "metro", "monorail": "metro", "tram": "tram", "bus": "bus", "trolleybus": "bus"}


def overpass_slow(query):
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_error = None
    for url in OVERPASS_URLS:
        try:
            request = urllib.request.Request(url, data=body, headers={"User-Agent": "TopTravel/1.0"})
            timeout = OVERPASS_MAIN_TIMEOUT if url == OVERPASS_URLS[0] else OVERPASS_BACKUP_TIMEOUT
            with _overpass_slots, urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read(OVERPASS_MAX_BYTES + 1)
                if len(raw) > OVERPASS_MAX_BYTES:
                    raise Unavailable("too_big")  # sin reintentar: el otro servidor daría lo mismo
                payload = json.loads(raw)
                del raw
            # Overpass avisa de sus errores con un texto en una respuesta "correcta".
            if payload.get("remark") and not payload.get("elements"):
                raise ValueError(payload["remark"])
            return payload.get("elements", [])
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
            last_error = error
    raise Unavailable("upstream") from last_error


def build_transit(lat, lon, part=None):
    # El recorrido se recorta a la zona del mapa: si no, una ciudad pesa decenas de MB.
    margin_lat = (MAP_RADIUS_KM + 1) / 110.574
    margin_lon = (MAP_RADIUS_KM + 1) / (111.32 * math.cos(math.radians(lat)))
    box = f"{lat - margin_lat:.4f},{lon - margin_lon:.4f},{lat + margin_lat:.4f},{lon + margin_lon:.4f}"

    def routes(kinds):
        return overpass_slow(
            f'[out:json][timeout:90];rel["type"="route"]["route"~"^({kinds})$"]'
            f"(around:{MAP_RADIUS_KM * 1000},{lat},{lon});out geom({box});"
        )

    # Metro y tranvía pesan poco; los autobuses son lo lento y se pueden pedir aparte.
    elements = routes("subway|light_rail|monorail|tram") if part != "bus" else []
    partial = False
    try:
        if part != "rail":
            elements = elements + routes("bus|trolleybus")
    except Unavailable:
        partial = True  # sin autobuses de momento: el metro y el tranvía sí se muestran
    best = {}
    for element in elements:
        tags = element.get("tags", {})
        kind = TRANSIT_KINDS.get(tags.get("route"))
        ref = str(tags.get("ref") or tags.get("name") or "")[:30]
        if not kind or not ref:
            continue
        step, digits = (5, 4) if kind == "bus" else (2, 5)
        paths = []
        for member in element.get("members", []):
            # Los puntos fuera de la zona llegan vacíos.
            points = [p for p in member.get("geometry") or [] if p]
            if member.get("type") != "way" or len(points) < 2:
                continue
            kept = points[::step]
            if kept[-1] is not points[-1]:
                kept.append(points[-1])
            paths.append([[round(p["lat"], digits), round(p["lon"], digits)] for p in kept])
        if not paths:
            continue
        colour = str(tags.get("colour") or "")
        line = {
            "kind": kind,
            "ref": ref,
            "name": str(tags.get("name") or "")[:90],
            "color": colour if re.fullmatch(r"#[0-9a-fA-F]{6}", colour) else "",
            "paths": paths,
        }
        identity = (kind, ref)
        if identity not in best or sum(map(len, paths)) > sum(map(len, best[identity]["paths"])):
            best[identity] = line
    result = {"lines": list(best.values())}
    if partial:
        result["partial"] = True
    return result


def api_transit(q):
    center = read_center(q)
    if not center:
        return 400, {"error": "bad_request"}
    key = f"t|{center[0]}|{center[1]}"
    part = q.get("part") if q.get("part") in ("rail", "bus") else None
    # Si la ciudad ya está preparada entera, sale todo de una vez.
    if not part or map_path(key).exists():
        return 200, cached_map_data(key, lambda: build_transit(*center))
    return 200, cached_map_data(f"{key}|{part}", lambda: build_transit(*center, part))


def api_rates(q):
    if settings()["HOTEL_PRICES"] == "off":
        return 200, {"rates": []}
    key, start, end = q.get("key", ""), q.get("in", ""), q.get("out", "")
    if not XOTELO_KEY.fullmatch(key) or not valid_date(start) or not valid_date(end) or end <= start:
        return 400, {"error": "bad_request"}
    adults = max(1, min(32, int(q["adults"]) if q.get("adults", "").isdigit() else 1))
    rooms = max(1, min(8, int(q["rooms"]) if q.get("rooms", "").isdigit() else 1))
    cache_key = f"xotelo|{key}|{start}|{end}|{adults}|{rooms}"
    now = time.time()
    with _lock:
        hit = _cache.get(cache_key)
    if hit and hit[0] > now:
        return 200, hit[1]
    try:
        result = xotelo_get(XOTELO_BASE, "rates", {"hotel_key": key, "chk_in": start, "chk_out": end, "currency": "EUR", "adults": adults, "rooms": rooms})
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
        raise Unavailable("upstream") from error
    rates = sorted(
        (
            # Los vendedores "SSC_" son la web oficial; su nombre llega traducido a otros idiomas.
            {"name": "Web oficial" if str(r.get("code") or "").startswith("SSC_") else str(r.get("name") or ""), "rate": r["rate"]}
            for r in result.get("rates") or [] if isinstance(r.get("rate"), (int, float))
        ),
        key=lambda r: r["rate"],
    )
    data = {"rates": rates}
    with _lock:
        if len(_cache) >= CACHE_MAX:
            _cache.clear()
        _cache[cache_key] = (now + XOTELO_RATES_SECONDS, data)
    return 200, data


def refresh_lodging(place, key):
    try:
        lodging_list({"place": place}, force=True)
    except Exception as error:
        print(f"No se ha podido renovar una lista: {type(error).__name__}", flush=True)
    finally:
        with _lock:
            _hotel_refreshing.discard(key)


def lodging_list(q, force=False):
    place = " ".join(q.get("place", "").split())
    if not 2 <= len(place) <= 80:
        return 400, {"error": "bad_request"}
    key = place.casefold()
    now = time.time()
    with _lock:
        hit = _hotels.get(key)
    # Las listas antiguas sin coordenadas se renuevan, pero sirven de respaldo.
    has_coords = hit and "center" in hit[1] and all("lat" in h for h in hit[1]["hotels"][:1])
    if hit and has_coords and not force:
        if hit[0] <= now:
            with _lock:
                start = key not in _hotel_refreshing
                _hotel_refreshing.add(key)
            if start:
                threading.Thread(target=refresh_lodging, args=(place, key), daemon=True).start()
        return 200, hit[1]
    try:
        elements, complete, point = find_lodging(place)
    except (Unavailable, urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError) as error:
        # Sin servicio: mejor una lista antigua que ninguna.
        if hit:
            return 200, hit[1]
        raise Unavailable("upstream") from error
    seen = set()
    hotels = []
    for element in elements:
        hotel = hotel_from(element)
        if hotel["name"] and hotel["name"].casefold() not in seen:
            seen.add(hotel["name"].casefold())
            hotels.append(hotel)
    hotels.sort(key=lambda h: (-h["stars"], not h["website"], h["name"].casefold()))
    data = {"hotels": hotels[:150], "center": {"lat": point[0], "lon": point[1]} if point else None}
    if hit and has_coords and len(hit[1]["hotels"]) > len(hotels) and not complete:
        return 200, hit[1]
    with _lock:
        if len(_hotels) >= CACHE_MAX and key not in _hotels:
            oldest = min(_hotels, key=lambda k: _hotels[k][0])
            del _hotels[oldest]
        _hotels[key] = (now + (HOTELS_CACHE_SECONDS if complete else HOTELS_PARTIAL_SECONDS), data)
        save_hotels()
    return 200, data


def api_explore(q):
    origin, month = q.get("origin", ""), q.get("month", "")
    if not IATA.match(origin) or (month and not MONTH.match(month)):
        return 400, {"error": "bad_request"}
    data = places()
    city = data["airports"].get(origin, origin)
    query = {
        "origin": city, "currency": "eur", "limit": 1000, "sorting": "price",
        "show_to_affiliates": "false",
        "period_type": "month" if month else "year",
        "one_way": "true" if month else "false",
    }
    if month:
        query["beginning_of_period"] = f"{month}-01"
    rows = tp_request("/v2/prices/latest", query) or []

    today = date.today().isoformat()
    best = {}
    for row in rows:
        code, price, day = row.get("destination"), row.get("value"), row.get("depart_date") or ""
        if code and code != city and isinstance(price, (int, float)) and day >= today:
            if code not in best or price < best[code]["price"]:
                best[code] = {
                    "code": code,
                    "price": price,
                    "date": day,
                    "returnDate": row.get("return_date") or "",
                    "transfers": row.get("number_of_changes"),
                }
    results = []
    for code, item in best.items():
        place = data["cities"].get(code)
        if place:
            results.append({**item, "city": place[0], "lat": place[1], "lon": place[2], "country": data["countries"].get(place[3], "")})
    home = data["cities"].get(city)
    return 200, {
        "destinations": sorted(results, key=lambda d: d["price"]),
        "origin": {"lat": home[1], "lon": home[2], "city": home[0]} if home else None,
    }


ROUTES = {"/api/calendar": api_calendar, "/api/day": api_day, "/api/hotels": api_hotels, "/api/explore": api_explore, "/api/rates": api_rates, "/api/monuments": api_monuments, "/api/transit": api_transit}


def lowest_price(params):
    prices = [r["price"] for r in prices_for_dates(params) if isinstance(r.get("price"), (int, float))]
    return min(prices) if prices else None


def flight_price(data):
    """Precio más bajo conocido de un viaje; None si no hay datos."""
    origin, dest = data["origin"]["code"], data["dest"]["code"]
    direct = "true" if data.get("direct") else "false"
    start, end = data["start"], data.get("end")
    leg = lambda a, b, day: lowest_price({"origin": a, "destination": b, "departure_at": day, "one_way": "true", "direct": direct})
    if not end:
        return leg(origin, dest, start)
    if (date.fromisoformat(end) - date.fromisoformat(start)).days <= MAX_TRIP_DAYS:
        price = lowest_price({"origin": origin, "destination": dest, "departure_at": start, "return_at": end, "one_way": "false", "direct": direct})
        if price is not None:
            return price
    outbound, inbound = leg(origin, dest, start), leg(dest, origin, end)
    return outbound + inbound if outbound is not None and inbound is not None else None


ACCOUNT_POST = {
    **accounts.PUBLIC_POST,
}
PRIVATE_POST = {
    "/api/saved": accounts.make_save(flight_price),
    "/api/saved/delete": accounts.api_unsave,
    "/api/alerts/read": accounts.api_alerts_read,
    "/api/account/delete": accounts.api_delete_account,
    "/api/account/recovery-code": accounts.api_new_recovery_code,
    "/api/account/email-alerts": accounts.api_email_alerts,
}
MAX_BODY = 16 * 1024

# Peticiones por minuto y por visitante en lo que llama a servicios externos.
RATE_LIMITS = {"/api/register": 10, "/api/login": 20, "/api/recover": 10, "/api/calendar": 120, "/api/day": 120, "/api/explore": 60, "/api/hotels": 20, "/api/rates": 90, "/api/monuments": 20, "/api/transit": 20}
_hits = {}
_hits_lock = threading.Lock()

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https://tile.openstreetmap.org https://*.wikimedia.org; connect-src 'self'; "
        "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    ),
}


def within_rate(ip, path):
    limit = RATE_LIMITS.get(path)
    if not limit:
        return True
    now = time.time()
    with _hits_lock:
        if len(_hits) > 5000:
            _hits.clear()
        recent = [t for t in _hits.get((ip, path), []) if now - t < 60]
        allowed = len(recent) < limit
        if allowed:
            recent.append(now)
        _hits[(ip, path)] = recent
    return allowed


class Handler(BaseHTTPRequestHandler):
    server_version = "TopTravel"
    sys_version = ""
    # Reutiliza la conexión entre peticiones, que es bastante más rápido.
    protocol_version = "HTTP/1.1"
    disable_nagle_algorithm = True
    timeout = 30

    def accepts_gzip(self):
        return "gzip" in (self.headers.get("Accept-Encoding") or "")

    def send_body(self, status, body, content_type, cache=None, encoding=None, etag=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache or ("no-store" if content_type.startswith("application/json") else "no-cache"))
        self.send_header("Vary", "Accept-Encoding")
        if encoding:
            self.send_header("Content-Encoding", encoding)
        if etag:
            self.send_header("ETag", etag)
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        if TRUST_PROXY:
            # Publicada, el navegador solo debe entrar por HTTPS, incluso si alguien intenta desviarlo.
            self.send_header("Strict-Transport-Security", "max-age=31536000")
        cookie = getattr(self, "_set_cookie", None)
        if cookie:
            self.send_header("Set-Cookie", cookie)
            self._set_cookie = None
        try:
            self.end_headers()
            if not getattr(self, "_head_only", False):
                self.wfile.write(body)
        except (ConnectionError, TimeoutError):
            self.close_connection = True  # el navegador cerró la conexión

    def send_json(self, status, data):
        kind = "application/json; charset=utf-8"
        if isinstance(data, GzJson):
            # Mapas de una ciudad: cambian poco y el navegador puede guardarlos.
            cache = "public, max-age=86400"
            if self.accepts_gzip():
                self.send_body(status, bytes(data), kind, cache, "gzip")
            else:
                self.send_body(status, gzip.decompress(data), kind, cache)
            return
        body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(body) >= GZIP_MIN_BYTES and self.accepts_gzip():
            self.send_body(status, gzip.compress(body, 5), kind, encoding="gzip")
        else:
            self.send_body(status, body, kind)

    def send_static(self, path, content_type, cache=None):
        """Sirve un archivo comprimido y evita volver a enviarlo si el navegador ya lo tiene."""
        stamp = path.stat().st_mtime_ns
        entry = _static_files.get(path)
        if not entry or entry[0] != stamp:
            raw = path.read_bytes()
            packed = gzip.compress(raw, 9) if not content_type.startswith("image/") else None
            entry = (stamp, raw, packed, f'"{hashlib.sha1(raw).hexdigest()[:16]}"')
            _static_files[path] = entry
        _, raw, packed, etag = entry
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", cache or "no-cache")
            self.send_header("Vary", "Accept-Encoding")
            try:
                self.end_headers()
            except (ConnectionError, TimeoutError):
                self.close_connection = True
            return
        if packed and self.accepts_gzip():
            self.send_body(200, packed, content_type, cache, "gzip", etag)
        else:
            self.send_body(200, raw, content_type, cache, None, etag)

    def send_legal(self, name):
        page = (ROOT / name).read_text(encoding="utf-8")
        email = settings()["CONTACT_EMAIL"]
        contact = (
            f'<a href="mailto:{html.escape(email, quote=True)}">{html.escape(email)}</a>'
            if email else '<a href="https://www.linkedin.com/in/patrischz/" rel="noopener">mensaje por LinkedIn</a>'
        )
        self.send_body(200, page.replace("{{CONTACTO}}", contact).encode("utf-8"), "text/html; charset=utf-8")

    def client_ip(self):
        # El proxy de alwaysdata escribe X-Real-IP; X-Forwarded-For lo deja pasar y se puede falsificar.
        real = self.headers.get("X-Real-IP")
        return real.strip() if TRUST_PROXY and real else self.client_address[0]

    def context(self):
        raw = self.headers.get("Cookie") or ""
        token = None
        try:
            morsel = SimpleCookie(raw).get(accounts.COOKIE)
            token = morsel.value if morsel else None
        except Exception:
            token = None
        ctx = accounts.Context(accounts.user_from_token(token), self.client_ip(), token)
        ctx.secure = TRUST_PROXY and self.headers.get("X-Forwarded-Proto") == "https"
        return ctx

    def same_origin(self):
        # Impide que otra web use la sesión de quien la visita.
        origin = self.headers.get("Origin")
        if not origin:
            return True
        return urllib.parse.urlsplit(origin).netloc == self.headers.get("Host")

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        public, private = ACCOUNT_POST.get(path), PRIVATE_POST.get(path)
        if not public and not private:
            self.close_connection = True
            self.send_json(404, {"error": "No encontrado."})
            return
        if not self.same_origin() or "application/json" not in (self.headers.get("Content-Type") or ""):
            self.close_connection = True
            self.send_json(403, {"error": "Petición no permitida."})
            return
        if not within_rate(self.client_ip(), path):
            self.close_connection = True
            self.send_json(429, {"error": "Demasiados intentos. Se puede volver a intentar dentro de unos minutos."})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if not 0 <= length <= MAX_BODY:
            self.close_connection = True
            self.send_json(413, {"error": "Datos demasiado grandes."})
            return
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self.send_json(400, {"error": "Datos no válidos."})
            return
        if not isinstance(body, dict):
            self.send_json(400, {"error": "Datos no válidos."})
            return
        ctx = self.context()
        if private and not ctx.user_id:
            self.send_json(401, {"error": "Hay que iniciar sesión para continuar."})
            return
        try:
            status, data = (public or private)(body, ctx)
        except Exception as error:
            print(f"Error en {path}: {type(error).__name__}", flush=True)
            self.send_json(500, {"error": "Algo ha fallado. Se puede volver a intentar."})
            return
        self._set_cookie = ctx.set_cookie
        self.send_json(status, data)

    def do_HEAD(self):
        self._head_only = True
        try:
            self.do_GET()
        finally:
            self._head_only = False

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        public, private = accounts.PUBLIC_GET.get(parsed.path), accounts.PRIVATE_GET.get(parsed.path)
        if public or private:
            ctx = self.context()
            if private and not ctx.user_id:
                self.send_json(401, {"error": "Hay que iniciar sesión para continuar."})
                return
            try:
                self.send_json(*(public or private)({}, ctx))
            except Exception as error:
                print(f"Error en {parsed.path}: {type(error).__name__}", flush=True)
                self.send_json(500, {"error": "Algo ha fallado. Se puede volver a intentar."})
            return
        route = ROUTES.get(parsed.path)
        if route:
            if not within_rate(self.client_ip(), parsed.path):
                self.send_json(429, {"error": "too_many_requests"})
                return
            query = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
            try:
                self.send_json(*route(query))
            except Unavailable as error:
                self.send_json(503, {"error": str(error)})
            except Exception as error:
                print(f"Error en {parsed.path}: {type(error).__name__}", flush=True)
                self.send_json(500, {"error": "server_error"})
            return
        if ASSET.match(parsed.path):
            photo = ROOT / parsed.path.lstrip("/")
            if photo.is_file():
                self.send_static(photo, "image/jpeg", "public, max-age=86400")
                return
        if parsed.path in LEGAL_PAGES:
            self.send_legal(LEGAL_PAGES[parsed.path])
            return
        if parsed.path == "/favicon.ico":
            self.send_body(204, b"", "image/x-icon", "public, max-age=86400")
            return
        static = STATIC.get(parsed.path)
        if not static:
            self.send_body(404, b"No encontrado", "text/plain; charset=utf-8")
            return
        cache = "public, max-age=86400" if parsed.path.startswith("/vendor/") else None
        self.send_static(ROOT / static[0], static[1], cache)

    def log_message(self, fmt, *args):
        # La URL interna nunca lleva la clave, pero evitamos ruido en la consola.
        if args and str(args[1] if len(args) > 1 else "").startswith(("4", "5")):
            super().log_message(fmt, *args)


def watch_restart_flag():
    """Al subir código nuevo, este archivo pide reiniciar: el alojamiento vuelve a arrancar la web."""
    flag = ROOT / "data" / "reiniciar"
    while True:
        time.sleep(5)
        if flag.exists():
            flag.unlink(missing_ok=True)
            os._exit(0)


class Server(ThreadingHTTPServer):
    daemon_threads = True


class ServerV6(Server):
    address_family = socket.AF_INET6


def main():
    global TRUST_PROXY
    _hotels.update(load_hotels())
    migrate_map_cache()
    accounts.mail_settings = settings
    accounts.init_db()
    accounts.start_price_checks(flight_price)
    parser = argparse.ArgumentParser()
    # Los alojamientos web suelen indicar dirección y puerto con las variables IP y PORT.
    parser.add_argument("--host", default=os.environ.get("IP") or "0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT") or 8000))
    parser.add_argument("--behind-proxy", action="store_true", help="confía en las cabeceras X-Forwarded-* del proxy")
    args = parser.parse_args()
    TRUST_PROXY = args.behind_proxy
    if TRUST_PROXY:
        threading.Thread(target=watch_restart_flag, daemon=True).start()
    state = "activados" if settings()["TRAVELPAYOUTS_TOKEN"] else "sin activar (falta la clave en .env)"
    print(f"TopTravel en http://localhost:{args.port} · precios {state}", flush=True)
    (ServerV6 if ":" in args.host else Server)((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
