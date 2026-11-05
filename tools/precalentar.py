"""Prepara con antelación los alojamientos y mapas de las ciudades más buscadas.

Así nadie espera en la primera búsqueda. Va de una en una para no saturar los
servicios gratuitos. Uso, con la web en marcha: python tools/precalentar.py [dirección]
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CITIES = [
    "París, Francia", "Roma, Italia", "Lisboa, Portugal", "Londres, Reino Unido",
    "Nueva York, Estados Unidos", "Tokio, Japón", "Cancún, México", "Ámsterdam, Países Bajos",
    "Madrid, España", "Barcelona, España", "Sevilla, España", "Valencia, España", "Málaga, España",
    "Berlín, Alemania", "Praga, República Checa", "Viena, Austria", "Milán, Italia", "Venecia, Italia",
    "Florencia, Italia", "Dublín, Irlanda", "Budapest, Hungría", "Atenas, Grecia", "Estambul, Turquía",
    "Dubái, Emiratos Árabes Unidos", "Bangkok, Tailandia", "Oporto, Portugal",
]
PAUSE_SECONDS = 20
BUSY_PAUSE_SECONDS = 150  # si un servicio pide esperar, se le deja respirar


def get(base, path, **params):
    url = f"{base}{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "TopTravel/1.0"})
    for _ in range(2):
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            time.sleep(65)  # límite de peticiones por minuto de la propia web
    raise RuntimeError("demasiadas peticiones")


def attempt(base, path, place, field):
    """Cada mapa se intenta por separado: que falle uno no impide preparar el otro."""
    for tries in range(3):
        try:
            data = get(base, path, **place)
            return f"{len(data.get(field, []))}{' (incompleto)' if data.get('partial') else ''}"
        except urllib.error.HTTPError as error:
            if error.code != 503 or tries == 2:
                return f"error {error.code}"
            time.sleep(BUSY_PAUSE_SECONDS)
    return "error"


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
    for city in CITIES:
        started = time.time()
        try:
            data = get(base, "/api/hotels", place=city)
            center = data.get("center")
            hotels = len(data.get("hotels", []))
            if not center:
                print(f"{city}: sin ubicación", flush=True)
                continue
            place = {"lat": center["lat"], "lon": center["lon"]}
            monuments = attempt(base, "/api/monuments", place, "monuments")
            lines = attempt(base, "/api/transit", place, "lines")
            print(f"{city}: {hotels} alojamientos, {monuments} monumentos, {lines} líneas, {time.time() - started:.0f} s", flush=True)
        except Exception as error:
            print(f"{city}: ha fallado ({type(error).__name__})", flush=True)
        time.sleep(PAUSE_SECONDS)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
