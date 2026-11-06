"""Guarda los monumentos de cada ciudad y las fotos de los más conocidos en el propio servidor.

Datos de Wikidata (CC0) y fotos de Wikimedia Commons: cada una conserva el enlace a su autor y
licencia. Uso: python tools/hacer_monumentos.py
"""
import hashlib
import io
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
from PIL import Image  # noqa: E402

import ciudades  # noqa: E402
import server  # noqa: E402

PHOTOS_PER_CITY = 12  # con unos 100 pueblos y ciudades, unos 40 MB en total
PHOTO_WIDTH = 420
QUERY_PAUSE = 12
PHOTO_PAUSE = 1.2
FOREVER = 10 * 365 * 86400
AGENT = {"User-Agent": server.WIKIDATA_AGENT}


def local_photo(url):
    name = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16] + ".jpg"
    path = server.PHOTO_DIR / name
    if not path.exists():
        request = urllib.request.Request(url, headers=AGENT)
        with urllib.request.urlopen(request, timeout=40) as response:
            image = Image.open(io.BytesIO(response.read())).convert("RGB")
        image.thumbnail((PHOTO_WIDTH, PHOTO_WIDTH))
        server.PHOTO_DIR.mkdir(parents=True, exist_ok=True)
        image.save(path, "JPEG", quality=78, optimize=True)
        time.sleep(PHOTO_PAUSE)
    return f"fotos/{name}"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    for city in ciudades.CITIES:
        point = server.geocode_local(ciudades.place_of(city))
        if not point:
            print("sin ubicación:", city, flush=True)
            continue
        center = (round(point[0], 2), round(point[1], 2))
        key = f"m|{center[0]}|{center[1]}"
        path = server.map_path(key)
        if path.exists() and path.stat().st_mtime > time.time() + 86400:
            continue  # ya hecho en una pasada anterior
        for attempt in range(4):
            try:
                data = server.build_monuments(*center)
                break
            except (server.Unavailable, urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
                print(f"{city}: reintento {attempt + 1} ({type(error).__name__})", flush=True)
                data = None
                time.sleep(180)
        if not data or not data["monuments"]:
            print(f"{city}: sin monumentos", flush=True)
            continue
        photos = 0
        for item in data["monuments"][:PHOTOS_PER_CITY]:
            try:
                item["image"] = local_photo(item["image"])
                photos += 1
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
                print(f"  foto no guardada: {type(error).__name__}", flush=True)
        server.store_map(key, data, time.time() + FOREVER)
        print(f"{city}: {len(data['monuments'])} monumentos, {photos} fotos propias", flush=True)
        time.sleep(QUERY_PAUSE)
    print("terminado", flush=True)


if __name__ == "__main__":
    main()
