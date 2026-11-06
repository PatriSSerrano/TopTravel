"""Crea los datos propios de hoteles y transporte a partir de extractos de OpenStreetMap (ODbL).

Lee un archivo .osm.pbf y guarda, para cada ciudad que contiene, sus alojamientos y líneas.
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
        cities.append({"place": place, "lat": point[0], "lon": point[1], "box": box_of(*point), "lodging": [], "routes": {}})
    if not cities:
        return

    def inside(lat, lon):
        return [c for c in cities if c["box"][0] <= lat <= c["box"][1] and c["box"][2] <= lon <= c["box"][3]]

    started = time.time()
    # Primera pasada: qué líneas existen y qué tramos las forman.
    route_tags, way_routes, lodging_ways = {}, {}, {}
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
    print(f"líneas {len(route_tags)}, {time.time() - started:.0f} s", flush=True)

    # Segunda pasada: la geometría de esos tramos y los alojamientos.
    geometry = {}
    processor = osmium.FileProcessor(path, osmium.osm.NODE | osmium.osm.WAY).with_locations("flex_mem")
    for obj in processor:
        if obj.is_node():
            tags = obj.tags
            if tags.get("tourism") in LODGINGS and tags.get("name") and obj.location.valid():
                lat, lon = obj.location.lat, obj.location.lon
                for city in inside(lat, lon):
                    city["lodging"].append({"tags": dict(tags), "lat": lat, "lon": lon})
            continue
        wanted, lodging = obj.id in way_routes, lodging_ways.get(obj.id)
        if not wanted and not lodging:
            continue
        points = [(n.location.lat, n.location.lon) for n in obj.nodes if n.location.valid()]
        if len(points) < 2:
            continue
        if lodging:
            lat = sum(p[0] for p in points) / len(points)
            lon = sum(p[1] for p in points) / len(points)
            for city in inside(lat, lon):
                city["lodging"].append({"tags": lodging, "center": {"lat": lat, "lon": lon}})
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
        print(f"{city['place']}: {len(hotels['hotels'])} alojamientos, {len(transit['lines'])} líneas, {os.path.getsize(stored) // 1024} KB", flush=True)


def element_point(element):
    center = element.get("center") or element
    return center["lat"], center["lon"]


if __name__ == "__main__":
    main()
