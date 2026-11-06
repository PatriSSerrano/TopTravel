"""Crea data/ciudades.db, el buscador propio de ciudades, a partir de GeoNames (CC BY 4.0).

Uso: python tools/hacer_ciudades.py ruta/cities15000.txt
"""
import pathlib
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
import json  # noqa: E402

import ciudades  # noqa: E402
import server  # noqa: E402

COMMON_WORDS_LIMIT = 40  # nombres por ciudad: suficientes para los idiomas habituales


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    source = pathlib.Path(sys.argv[1])
    target = server.CITIES_DB
    target.parent.mkdir(exist_ok=True)
    temp = target.with_suffix(".tmp")
    temp.unlink(missing_ok=True)
    db = sqlite3.connect(temp)
    db.executescript("""
      CREATE TABLE cities (id INTEGER PRIMARY KEY, name TEXT, lat REAL, lon REAL, country TEXT, population INTEGER);
      CREATE TABLE names (name TEXT, city INTEGER);
    """)
    cities = names = 0
    with source.open(encoding="utf-8") as file:
        for line in file:
            parts = line.rstrip("\n").split("\t")
            geo_id, name, ascii_name, alternates = int(parts[0]), parts[1], parts[2], parts[3]
            lat, lon, country, population = float(parts[4]), float(parts[5]), parts[8], int(parts[14] or 0)
            db.execute("INSERT INTO cities VALUES (?, ?, ?, ?, ?, ?)", (geo_id, name, lat, lon, country, population))
            cities += 1
            options = {server.plain_name(name), server.plain_name(ascii_name)}
            # Los nombres en otras escrituras no se buscan aquí: se quedan fuera para ocupar menos.
            for other in alternates.split(",")[:400]:
                clean = server.plain_name(other)
                if clean and clean.isascii() and len(options) < COMMON_WORDS_LIMIT:
                    options.add(clean)
            for option in options:
                if option:
                    db.execute("INSERT INTO names VALUES (?, ?)", (option, geo_id))
                    names += 1
    db.execute("CREATE INDEX names_name ON names (name)")
    # Nombres en español que faltan, y centros más exactos donde ya se conocen.
    for alias, name in ciudades.ALIASES.items():
        row = db.execute("SELECT c.id FROM names n JOIN cities c ON c.id = n.city WHERE n.name = ? ORDER BY c.population DESC LIMIT 1", (server.plain_name(name),)).fetchone()
        if row:
            db.execute("INSERT INTO names VALUES (?, ?)", (server.plain_name(alias), row[0]))
    curated = {g["city"]: g for g in json.loads((ROOT / "hoteles_destacados.json").read_text(encoding="utf-8"))}
    db.commit()
    codes = {server.plain_name(n): c for c, n in server.places()["countries"].items()}
    codes.update(server.COUNTRY_ALIASES)
    missing = []
    for city, (country, _) in ciudades.CITIES.items():
        code = codes.get(server.plain_name(country))
        row = db.execute("SELECT c.id FROM names n JOIN cities c ON c.id = n.city WHERE n.name = ? AND c.country = ? ORDER BY c.population DESC LIMIT 1", (server.plain_name(city), code)).fetchone()
        if not row and city in curated:
            # Lugares pequeños que GeoNames deja fuera de esta lista: se añaden a mano.
            cities += 1
            new_id = 900000000 + cities
            db.execute("INSERT INTO cities VALUES (?, ?, ?, ?, ?, ?)", (new_id, city, curated[city]["lat"], curated[city]["lon"], code, 0))
            db.execute("INSERT INTO names VALUES (?, ?)", (server.plain_name(city), new_id))
        elif not row:
            missing.append(f"{city} ({code})")
        elif city in curated:
            db.execute("UPDATE cities SET lat = ?, lon = ? WHERE id = ?", (curated[city]["lat"], curated[city]["lon"], row[0]))
    print("sin encontrar:", missing)
    db.commit()
    db.execute("VACUUM")
    db.close()
    temp.replace(target)
    print(f"{cities} ciudades, {names} nombres, {target.stat().st_size // 1024 // 1024} MB")


if __name__ == "__main__":
    main()
