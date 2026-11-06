"""Vuelve a descargar con más calidad las fotos de monumentos guardadas en el servidor.

Conserva cada foto y su enlace a la licencia: solo cambia la resolución. Se puede lanzar otra
vez si se corta, porque las ya mejoradas se saltan. Uso: python tools/mejorar_fotos.py
"""
import gzip
import hashlib
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from PIL import Image  # noqa: E402

import server  # noqa: E402

WIDTH = 960
QUALITY = 84
PAUSE = 1.2
AGENT = {"User-Agent": server.WIKIDATA_AGENT}
MAX_DISK_MB = 300


def photo_url(credit):
    name = credit.rsplit("/wiki/File:", 1)[1]
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{name}?width={WIDTH}"


def better_photo(credit):
    """Devuelve (nombre, ancho). El nombre es nuevo: así ningún navegador se queda con la foto antigua."""
    name = "h" + hashlib.sha1(credit.encode("utf-8")).hexdigest()[:15] + ".jpg"
    path = server.PHOTO_DIR / name
    if path.exists():
        return name, None
    request = urllib.request.Request(photo_url(credit), headers=AGENT)
    with urllib.request.urlopen(request, timeout=60) as response:
        image = Image.open(io.BytesIO(response.read())).convert("RGB")
    image.thumbnail((WIDTH, WIDTH))
    image.save(path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    time.sleep(PAUSE)
    return name, image.size[0]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    better = small = failed = 0
    for path in sorted(server.MAP_DIR.glob("*.json.gz")):
        try:
            data = json.loads(gzip.decompress(path.read_bytes()))
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict) or "monuments" not in data:
            continue
        changed = False
        for item in data["monuments"]:
            if "width=480" in item.get("image", ""):
                item["image"] = item["image"].replace("width=480", f"width={WIDTH}")
                changed = True
            old = item.get("image", "")
            if not old.startswith("fotos/") or old.startswith("fotos/h"):
                continue
            if sum(f.stat().st_size for f in server.PHOTO_DIR.glob("*.jpg")) > MAX_DISK_MB * 1024 * 1024:
                print("Tope de disco alcanzado", flush=True)
                return
            try:
                name, width = better_photo(item["credit"])
            except (urllib.error.URLError, TimeoutError, OSError, ValueError, IndexError) as error:
                failed += 1
                print(f"sin mejorar: {item['name']} ({type(error).__name__})", flush=True)
                time.sleep(PAUSE * 5)
                continue
            item["image"] = f"fotos/{name}"
            (server.PHOTO_DIR / old.split("/", 1)[1]).unlink(missing_ok=True)
            changed = True
            better += 1
            small += bool(width and width < 640)
        if changed:
            stamp = path.stat().st_mtime
            server.store_map_file(path, data, stamp)
            print(f"{better} fotos mejoradas, {failed} fallos", flush=True)
    total = sum(f.stat().st_size for f in server.PHOTO_DIR.glob("*.jpg")) // 1048576
    print(f"terminado: {better} mejoradas, {small} con original pequeño, {failed} fallos, {total} MB", flush=True)


if __name__ == "__main__":
    main()
