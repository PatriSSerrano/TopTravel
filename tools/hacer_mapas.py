"""Crea los datos propios de hoteles, transporte y actividades a partir de extractos de OpenStreetMap (ODbL).

Lee un archivo .osm.pbf y guarda, para cada ciudad que contiene, sus alojamientos, líneas y planes.
Después de esto la web no necesita pedirlos a ningún servicio externo.

Uso: python tools/hacer_mapas.py archivo.osm.pbf "Madrid, España" ["Otra, País" ...]
"""
import math
import os
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import osmium  # noqa: E402

import server  # noqa: E402

RADIUS_KM = server.MAP_RADIUS_KM
BOX_MARGIN_KM = 1
LODGINGS = {"hotel", "apartment", "hostel", "guest_house"}
ROUTES = set(server.TRANSIT_KINDS)
FOREVER = 10 * 365 * 86400  # son datos propios: no caducan hasta que se regeneren

# Qué etiqueta de OpenStreetMap corresponde a cada tipo de plan.
ACTIVITY_KINDS = {
    "amenity": {
        "bar": "bar", "pub": "bar", "biergarten": "bar", "nightclub": "discoteca", "cafe": "cafeteria", "restaurant": "restaurante",
        "theatre": "espectaculo", "cinema": "espectaculo", "arts_centre": "cultura", "casino": "ocio", "planetarium": "cultura", "marketplace": "mercado",
    },
    "tourism": {
        "museum": "museo", "gallery": "museo", "attraction": "sitio", "viewpoint": "mirador", "zoo": "familiar", "aquarium": "familiar",
        "theme_park": "familiar", "artwork": "arte",
    },
    "leisure": {
        "park": "naturaleza", "garden": "naturaleza", "nature_reserve": "naturaleza", "water_park": "familiar", "escape_game": "ocio",
        "bowling_alley": "ocio", "amusement_arcade": "ocio", "miniature_golf": "ocio",
    },
    "natural": {"beach": "playa", "peak": "naturaleza"},
    "historic": {"monument": "monumento", "castle": "monumento", "ruins": "monumento", "archaeological_site": "monumento", "memorial": "monumento", "city_gate": "monumento"},
}
# Tope por tipo: una gran ciudad tiene miles de bares y el servidor solo tiene 1 GB de disco.
ACTIVITY_LIMITS = {"restaurante": 120, "bar": 120, "cafeteria": 50, "arte": 40, "monumento": 80, "naturaleza": 60}
ACTIVITY_DEFAULT_LIMIT = 50
ACTIVITY_TAGS = ("fee", "charge", "wheelchair", "website", "contact:website", "opening_hours", "capacity", "wikipedia", "wikidata", "cuisine", "description", "stars")
STOP_CELL = 0.01  # unos 1 km: basta con mirar la celda y las vecinas


def activity_kind(tags):
    for key, kinds in ACTIVITY_KINDS.items():
        kind = kinds.get(tags.get(key))
        if kind:
            return kind
    return None


def is_stop(tags):
    return (
        tags.get("public_transport") in ("station", "stop_position", "platform")
        or tags.get("highway") == "bus_stop"
        or tags.get("railway") in ("station", "halt", "tram_stop", "subway_entrance")
    )


def activity_score(item):
    """Lo mejor documentado primero: así los topes no se quedan con sitios sin apenas datos."""
    return (not item.get("wikidata") and not item.get("wikipedia"), not item.get("website"), not item.get("opening_hours"), item["name"].casefold())


def nearest_stop_m(stops, lat, lon):
    cell_lat, cell_lon = int(lat / STOP_CELL), int(lon / STOP_CELL)
    best = None
    for a in range(cell_lat - 1, cell_lat + 2):
        for b in range(cell_lon - 1, cell_lon + 2):
            for stop_lat, stop_lon in stops.get((a, b), ()):
                km = server.distance_km(lat, lon, stop_lat, stop_lon)
                best = km if best is None or km < best else best
    return round(best * 1000) if best is not None else None


def build_activities(city):
    lat, lon = city["lat"], city["lon"]
    seen, groups = set(), {}
    for item in city["activities"]:
        identity = (item["name"].casefold(), item["kind"])
        km = server.distance_km(lat, lon, item["lat"], item["lon"])
        if identity in seen or km > RADIUS_KM:
            continue
        seen.add(identity)
        item["km"] = round(km, 2)
        item["stop_m"] = nearest_stop_m(city["stops"], item["lat"], item["lon"])
        groups.setdefault(item["kind"], []).append(item)
    kept = []
    for kind, items in groups.items():
        items.sort(key=activity_score)
        kept += items[:ACTIVITY_LIMITS.get(kind, ACTIVITY_DEFAULT_LIMIT)]
    return {"activities": kept}


def box_of(lat, lon):
    km = RADIUS_KM + BOX_MARGIN_KM
    d_lat = km / 110.574
    d_lon = km / (111.32 * math.cos(math.radians(lat)))
    return lat - d_lat, lat + d_lat, lon - d_lon, lon + d_lon


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    path, places = sys.argv[1], sys.argv[2:]
    cities = []
    for place in places:
        point = server.geocode_local(place)
        if not point:
            print("sin ubicación:", place, flush=True)
            continue
        cities.append({"place": place, "lat": point[0], "lon": point[1], "box": box_of(*point), "lodging": [], "routes": {}, "activities": [], "stops": {}})
    if not cities:
        return

    def inside(lat, lon):
        return [c for c in cities if c["box"][0] <= lat <= c["box"][1] and c["box"][2] <= lon <= c["box"][3]]

    started = time.time()
    # Primera pasada: qué líneas existen y qué tramos las forman.
    route_tags, way_routes, lodging_ways, activity_ways = {}, {}, {}, {}

    def note_activity(tags, kind, lat, lon):
        # El nombre en español o inglés, si lo hay: en Bangkok o Tokio el local no se puede leer.
        item = {"name": (tags.get("name:es") or tags.get("name:en") or tags["name"])[:120], "kind": kind, "lat": round(lat, 5), "lon": round(lon, 5)}
        for key in ACTIVITY_TAGS:
            if tags.get(key):
                item[key.replace("contact:", "")] = tags[key][:200]
        for city in inside(lat, lon):
            city["activities"].append(dict(item))

    for obj in osmium.FileProcessor(path, osmium.osm.RELATION | osmium.osm.WAY):
        tags = obj.tags
        if obj.is_relation():
            if tags.get("type") == "route" and tags.get("route") in ROUTES:
                members = [m.ref for m in obj.members if m.type == "w"]
                route_tags[obj.id] = (dict(tags), members)
                for ref in members:
                    way_routes.setdefault(ref, []).append(obj.id)
        elif tags.get("tourism") in LODGINGS and tags.get("name"):
            lodging_ways[obj.id] = dict(tags)
        elif tags.get("name"):
            kind = activity_kind(tags)
            if kind:
                activity_ways[obj.id] = (dict(tags), kind)
    print(f"líneas {len(route_tags)}, {time.time() - started:.0f} s", flush=True)

    # Segunda pasada: la geometría de esos tramos y los alojamientos.
    geometry = {}
    processor = osmium.FileProcessor(path, osmium.osm.NODE | osmium.osm.WAY).with_locations("flex_mem")
    for obj in processor:
        if obj.is_node():
            tags = obj.tags
            if not len(tags) or not obj.location.valid():
                continue
            lat, lon = obj.location.lat, obj.location.lon
            if tags.get("tourism") in LODGINGS and tags.get("name"):
                for city in inside(lat, lon):
                    city["lodging"].append({"tags": dict(tags), "lat": lat, "lon": lon})
            elif tags.get("name") and activity_kind(tags):
                note_activity(dict(tags), activity_kind(tags), lat, lon)
            if is_stop(tags):
                for city in inside(lat, lon):
                    city["stops"].setdefault((int(lat / STOP_CELL), int(lon / STOP_CELL)), []).append((lat, lon))
            continue
        wanted, lodging, activity = obj.id in way_routes, lodging_ways.get(obj.id), activity_ways.get(obj.id)
        if not wanted and not lodging and not activity:
            continue
        points = [(n.location.lat, n.location.lon) for n in obj.nodes if n.location.valid()]
        if len(points) < 2:
            continue
        if lodging:
            lat = sum(p[0] for p in points) / len(points)
            lon = sum(p[1] for p in points) / len(points)
            for city in inside(lat, lon):
                city["lodging"].append({"tags": lodging, "center": {"lat": lat, "lon": lon}})
        if activity:
            note_activity(activity[0], activity[1], sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points))
        if wanted and any(inside(*p) for p in points):
            geometry[obj.id] = points
    print(f"tramos {len(geometry)}, {time.time() - started:.0f} s", flush=True)

    for city in cities:
        lat, lon = city["lat"], city["lon"]
        south, north, west, east = city["box"]
        elements = []
        for tags, members in route_tags.values():
            parts, near = [], False
            for ref in members:
                points = geometry.get(ref)
                if not points:
                    continue
                kept = [p for p in points if south <= p[0] <= north and west <= p[1] <= east]
                if len(kept) >= 2:
                    parts.append({"type": "way", "geometry": [{"lat": a, "lon": b} for a, b in kept]})
                    near = near or any(server.distance_km(lat, lon, a, b) <= RADIUS_KM for a, b in kept)
            if near:
                elements.append({"tags": tags, "members": parts})
        lodging = [e for e in city["lodging"] if server.distance_km(lat, lon, *element_point(e)) <= RADIUS_KM]
        hotels = server.lodging_from_elements(lodging, (lat, lon))
        transit = server.transit_from_elements(elements)
        center = (round(lat, 2), round(lon, 2))
        server.store_own_city(center, hotels)
        stored = server.store_map(f"t|{center[0]}|{center[1]}", transit, time.time() + FOREVER)
        plans = build_activities(city)
        plans_file = server.store_map(f"a|{center[0]}|{center[1]}", plans, time.time() + FOREVER)
        print(f"{city['place']}: {len(hotels['hotels'])} alojamientos, {len(transit['lines'])} líneas, {len(plans['activities'])} planes, {(os.path.getsize(stored) + os.path.getsize(plans_file)) // 1024} KB", flush=True)


def element_point(element):
    center = element.get("center") or element
    return center["lat"], center["lon"]


if __name__ == "__main__":
    main()
