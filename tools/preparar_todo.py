"""Prepara los datos propios de todas las ciudades: descarga, procesa y borra cada extracto.

Uso: python tools/preparar_todo.py carpeta_de_descargas
Las descargas van de una en una. Si se corta, se puede volver a lanzar: lo hecho no se repite.
"""
import pathlib
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
import ciudades  # noqa: E402
import server  # noqa: E402

DONE = ROOT / "data" / "ciudades-hechas.txt"
AGENT = {"User-Agent": "TopTravel/1.0"}


def has_plans(city):
    """Los planes se guardan los últimos: si están, esa ciudad ya está completa."""
    point = server.geocode_local(ciudades.place_of(city))
    return bool(point) and server.map_path(f"a|{round(point[0], 2)}|{round(point[1], 2)}").exists()


def url_of(source):
    if source.startswith("bbbike:"):
        name = source.split(":")[1]
        return f"https://download.bbbike.org/osm/bbbike/{name}/{name}.osm.pbf"
    return f"https://download.geofabrik.de/{source}-latest.osm.pbf"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    folder = pathlib.Path(sys.argv[1])
    folder.mkdir(exist_ok=True)
    sources = {}
    for city, (_, source) in ciudades.CITIES.items():
        if source and not has_plans(city):
            sources.setdefault(source, []).append(city)
    print(f"{len(sources)} extractos para {sum(map(len, sources.values()))} ciudades", flush=True)
    # Primero los pequeños: así la mayoría de ciudades queda lista antes.
    for source, cities in sorted(sources.items(), key=lambda item: item[0].startswith("bbbike:") is False):
        target = folder / (source.replace("/", "_").replace(":", "_") + ".osm.pbf")
        try:
            print(f"--- {source}: {', '.join(cities)}", flush=True)
            with urllib.request.urlopen(urllib.request.Request(url_of(source), headers=AGENT), timeout=120) as response, target.open("wb") as file:
                while chunk := response.read(1024 * 1024):
                    file.write(chunk)
            print(f"descargado {target.stat().st_size // 1024 // 1024} MB", flush=True)
            places = [ciudades.place_of(city) for city in cities]
            result = subprocess.run([sys.executable, str(ROOT / "tools" / "hacer_mapas.py"), str(target), *places], cwd=ROOT, check=False)
            if result.returncode == 0:
                with DONE.open("a", encoding="utf-8") as file:
                    file.write("\n".join(cities) + "\n")
            else:
                print(f"FALLO al procesar {source}", flush=True)
        except OSError as error:
            print(f"FALLO {source}: {type(error).__name__} {error}", flush=True)
        finally:
            target.unlink(missing_ok=True)
    print("terminado", flush=True)


if __name__ == "__main__":
    main()
