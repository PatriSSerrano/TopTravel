"""Genera los datos ligeros que dibuja la portada: el globo y el mapa de Roma.

Uso, con los mapas de Roma ya preparados: python tools/hacer_portada.py
"""
import gzip
import json
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import server  # noqa: E402

CENTER = (41.8933, 12.4829)
GLOBE_TOLERANCE = 0.16  # grados: en un globo pequeño no se nota más detalle
MIN_RING_POINTS = 6
MAX_BACKGROUND_LINES = 110


def simplify(points, tolerance):
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a][:2]
        bx, by = points[b][:2]
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        best, index = 0, None
        for i in range(a + 1, b):
            x, y = points[i][:2]
            t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / length)) if length else 0
            error = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2
            if error > best:
                best, index = error, i
        if index is not None and best > tolerance * tolerance:
            keep[index] = True
            stack += [(a, index), (index, b)]
    return [p for p, k in zip(points, keep) if k]


def build_globe():
    world = json.loads((ROOT / "vendor" / "world.json").read_text(encoding="utf-8"))
    rings = []

    def add(ring):
        mid = len(ring) // 2
        slim = simplify(ring[: mid + 1], GLOBE_TOLERANCE)[:-1] + simplify(ring[mid:], GLOBE_TOLERANCE)
        if len(slim) >= MIN_RING_POINTS:
            rings.append([[round(x, 2), round(y, 2)] for x, y in (p[:2] for p in slim)])

    for feature in world["features"]:
        geometry = feature["geometry"]
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        for polygon in polygons:
            add(polygon[0])
    return rings


def to_km(lat, lon):
    return [
        round(math.radians(lon - CENTER[1]) * math.cos(math.radians(CENTER[0])) * 6371, 2),
        round(math.radians(lat - CENTER[0]) * 6371, 2),
    ]


def read_map(key):
    return json.loads(gzip.decompress(server.map_path(key).read_bytes()))


def path_length(path):
    return sum(math.dist(a, b) for a, b in zip(path, path[1:]))


def build_city():
    lines = read_map("t|41.89|12.48")["lines"]
    rail, background = [], []
    for line in lines:
        paths = [[to_km(lat, lon) for lat, lon in path] for path in line["paths"]]
        paths = [p for p in paths if len(p) > 1]
        if not paths:
            continue
        if line["kind"] == "bus":
            background.append(paths)
        else:
            rail.append({"color": line.get("color") or "", "kind": line["kind"], "ref": line.get("ref") or "", "paths": paths})
    # Los autobuses solo dan textura de calles: basta con una parte.
    background.sort(key=lambda paths: -sum(path_length(p) for p in paths))
    streets = [p for paths in background[:MAX_BACKGROUND_LINES] for p in paths]
    streets = [simplify(p, 0.03) for p in streets]

    wanted = {"Coliseo": "roma", "Fontana di Trevi": "roma2", "basílica de San Pedro": "roma3"}
    monuments = []
    for item in read_map("m|41.89|12.48")["monuments"]:
        entry = {"km": to_km(item["lat"], item["lon"]), "name": item["name"][0].upper() + item["name"][1:]}
        if item["name"] in wanted:
            entry["photo"] = wanted[item["name"]]
        monuments.append(entry)

    curated = json.loads((ROOT / "hoteles_destacados.json").read_text(encoding="utf-8"))
    rome = next(group for group in curated if group["city"] == "Roma")
    hotels = [to_km(h["lat"], h["lon"]) for h in rome["hotels"] if h.get("lat")]
    return {"center": CENTER, "rail": rail, "streets": streets, "monuments": monuments, "hotels": hotels}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    globe = json.dumps(build_globe(), separators=(",", ":"))
    city = json.dumps(build_city(), ensure_ascii=False, separators=(",", ":"))
    (ROOT / "vendor" / "globo.json").write_text(globe, encoding="utf-8")
    (ROOT / "vendor" / "roma.json").write_text(city, encoding="utf-8")
    for name, text in (("globo", globe), ("roma", city)):
        print(name, len(text) // 1024, "KB,", len(gzip.compress(text.encode())) // 1024, "KB comprimido")
    data = json.loads(city)
    print("metro y tranvía:", [l["ref"] for l in data["rail"]], "hoteles:", len(data["hotels"]), "fotos:", [m["name"] for m in data["monuments"] if "photo" in m])


if __name__ == "__main__":
    main()
