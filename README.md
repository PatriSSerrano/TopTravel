# TopTravel

Comparador gratuito de vuelos y alojamientos. Reúne en una sola web lo que normalmente hay que mirar en varias: el precio de los vuelos día a día, los alojamientos de cada ciudad en un mapa y el enlace para comprar donde corresponda.

Nadie gana dinero con esta web: no tiene publicidad, comisiones ni enlaces de afiliado.

## Qué hace

**Vuelos**
- Calendario con el precio de cada día del mes.
- Lista de vuelos con aerolínea, escalas y duración, y enlace a la web de la aerolínea.
- Mapa del mundo con el precio de volar a cada destino.

**Alojamientos**
- Búsqueda de hoteles y apartamentos en cualquier ciudad.
- Tres mapas de cada ciudad, todos con anillos de distancia al centro: verde hasta 1 km, amarillo hasta 3 km y rojo a más de 3 km.
  - **Precios:** el precio por noche y por persona de cada alojamiento, sobre el mapa.
  - **Monumentos:** los lugares más conocidos, con su nombre y su foto.
  - **Transporte:** las líneas de metro, tranvía y autobús, con los monumentos marcados.

**Cuentas**
- Registro e inicio de sesión para guardar vuelos y alojamientos.
- Avisos dentro de la web cuando baja o sube el precio de un vuelo guardado.

Funciona en ordenador, tableta y móvil.

## Cómo ponerla en marcha

Solo necesitas [Python 3](https://www.python.org/downloads/). No hay nada más que instalar.

1. Descarga el proyecto:

   ```bash
   git clone https://github.com/PatriSSerrano/TopTravel.git
   cd TopTravel
   ```

2. Copia `.env.example` como `.env` y añade tu clave gratuita de [Travelpayouts](https://www.travelpayouts.com/):

   ```
   TRAVELPAYOUTS_TOKEN=tu_clave
   ```

   Sin esa clave la web arranca, pero los vuelos no muestran precios.

3. Arranca el servidor:

   ```bash
   python server.py
   ```

4. Abre <http://localhost:8000>.

Para probarla desde otro dispositivo de la misma wifi, abre `http://IP-DE-TU-ORDENADOR:8000`. Para cambiar el puerto, usa `python server.py --port 9000`.

## De dónde salen los datos

| Dato | Fuente |
| --- | --- |
| Precios de vuelos | [Travelpayouts](https://www.travelpayouts.com/) (Data API) |
| Precios de hoteles | [Xotelo](https://xotelo.com/) |
| Alojamientos y líneas de transporte | [OpenStreetMap](https://www.openstreetmap.org/copyright), mediante Overpass y Nominatim |
| Monumentos y sus fotos | [Wikidata](https://www.wikidata.org/) y [Wikimedia Commons](https://commons.wikimedia.org/) |
| Fotos de los destinos | [Pexels](https://www.pexels.com/license/) |
| Mapa del mundo | [Natural Earth](https://www.naturalearthdata.com/) |
| Mapas de ciudades | [Leaflet](https://leafletjs.com/) con los mapas de OpenStreetMap |

## Limitaciones

- **Los precios de vuelos son orientativos.** Proceden de búsquedas recientes guardadas, no de una consulta en directo a cada aerolínea, así que pueden haber cambiado al ir a comprar.
- **No todos los hoteles tienen precio.** OpenStreetMap ofrece muchos alojamientos, pero Xotelo solo da precio a los que tienen un código de TripAdvisor. La lista de esos códigos está en `hoteles_destacados.json` y cubre 45 hoteles de 8 ciudades.
- **Xotelo no es un servicio oficial** y puede dejar de funcionar.
- **La primera búsqueda de una ciudad puede tardar.** Los monumentos tardan cerca de un minuto y el transporte, un par de minutos. Después quedan guardados 30 días y salen al momento.
- **Los avisos solo se ven dentro de la web.** Todavía no se envían por correo, y tampoco se puede recuperar una contraseña olvidada.

## Publicarla en internet

El alojamiento tiene que poder ejecutar Python y conservar la carpeta `data/`, porque ahí están las cuentas de los usuarios. En un servicio sin disco permanente, las cuentas se borrarían en cada reinicio.

## Estructura

```
server.py                 Servidor y conexión con las fuentes de datos
accounts.py               Cuentas, guardados y avisos de precio (SQLite)
app.js, index.html, styles.css   La web
hoteles_destacados.json   Hoteles con código de precio
xotelo_cities.json        Ciudades con hoteles en Xotelo
assets/                   Fotos de los destinos
vendor/                   Leaflet y datos del mapa del mundo
data/                     Cachés y base de datos (se crea sola, no se sube)
```

## Seguridad

- Las claves van en `.env`, que no se sube a GitHub ni lo sirve la web. No las pongas en ningún otro archivo.
- Las contraseñas no se guardan tal cual, sino como un hash scrypt, y las sesiones van en cookies `HttpOnly`.

## Autora

Creada por **Patricia Sanchez Serrano** · [LinkedIn](https://www.linkedin.com/in/patrischz/)
