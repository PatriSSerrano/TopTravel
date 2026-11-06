"""Ciudades con datos propios: su país, y de qué extracto de OpenStreetMap salen.

«bbbike:Nombre» es un recorte de esa ciudad; el resto, una ruta de download.geofabrik.de.
"""

CITIES = {
    "Madrid": ("España", "bbbike:Madrid"), "Barcelona": ("España", "bbbike:Barcelona"), "Palma de Mallorca": ("España", "bbbike:Palma"),
    "Sevilla": ("España", "europe/spain/andalucia"), "Málaga": ("España", "europe/spain/andalucia"), "Granada": ("España", "europe/spain/andalucia"),
    "Valencia": ("España", "europe/spain/valencia"), "Bilbao": ("España", "europe/spain/pais-vasco"), "San Sebastián": ("España", "europe/spain/pais-vasco"),
    "París": ("Francia", "bbbike:Paris"), "Lyon": ("Francia", "bbbike:Lyon"), "Marsella": ("Francia", "bbbike:Marseille"), "Burdeos": ("Francia", "bbbike:Bordeaux"),
    "Niza": ("Francia", "europe/france/provence-alpes-cote-d-azur"), "Montecarlo": ("Mónaco", "europe/monaco"),
    "Roma": ("Italia", "europe/italy/centro"), "Florencia": ("Italia", "europe/italy/centro"), "San Marino": ("San Marino", "europe/italy/centro"),
    "Milán": ("Italia", "europe/italy/nord-ovest"), "Turín": ("Italia", "bbbike:Turin"),
    "Venecia": ("Italia", "europe/italy/nord-est"), "Bolonia": ("Italia", "europe/italy/nord-est"), "Nápoles": ("Italia", "europe/italy/sud"),
    "Lisboa": ("Portugal", "bbbike:Lisbon"), "Oporto": ("Portugal", "bbbike:Porto"),
    "Londres": ("Reino Unido", "bbbike:London"), "Edimburgo": ("Reino Unido", "bbbike:Edinburgh"), "Mánchester": ("Reino Unido", "bbbike:Manchester"), "Glasgow": ("Reino Unido", "bbbike:Glasgow"),
    "Dublín": ("Irlanda", "bbbike:Dublin"), "Ámsterdam": ("Países Bajos", "bbbike:Amsterdam"),
    "Bruselas": ("Bélgica", "bbbike:Bruessel"), "Brujas": ("Bélgica", "bbbike:Bruegge"), "Luxemburgo": ("Luxemburgo", "bbbike:Luxemburg"),
    "Berlín": ("Alemania", "bbbike:Berlin"), "Múnich": ("Alemania", "bbbike:Muenchen"), "Hamburgo": ("Alemania", "bbbike:Hamburg"), "Fráncfort": ("Alemania", "bbbike:Frankfurt"), "Colonia": ("Alemania", "bbbike:Koeln"),
    "Zúrich": ("Suiza", "bbbike:Zuerich"), "Ginebra": ("Suiza", "bbbike:Genf"), "Viena": ("Austria", "bbbike:Wien"), "Salzburgo": ("Austria", "bbbike:Salzburg"),
    "Praga": ("República Checa", "bbbike:Prag"), "Budapest": ("Hungría", "bbbike:Budapest"), "Varsovia": ("Polonia", "bbbike:Warsaw"), "Cracovia": ("Polonia", "bbbike:Cracow"), "Gdansk": ("Polonia", "bbbike:Gdansk"),
    "Copenhague": ("Dinamarca", "bbbike:Copenhagen"), "Estocolmo": ("Suecia", "bbbike:Stockholm"), "Oslo": ("Noruega", "bbbike:Oslo"), "Helsinki": ("Finlandia", "bbbike:Helsinki"), "Reikiavik": ("Islandia", "europe/iceland"),
    "Tallin": ("Estonia", "bbbike:Tallinn"), "Riga": ("Letonia", "bbbike:Riga"), "Vilna": ("Lituania", "europe/lithuania"),
    "Bratislava": ("Eslovaquia", "europe/slovakia"), "Liubliana": ("Eslovenia", "bbbike:Ljubljana"), "Zagreb": ("Croacia", "bbbike:Zagreb"), "Dubrovnik": ("Croacia", "europe/croatia"), "Split": ("Croacia", "europe/croatia"),
    "Belgrado": ("Serbia", "europe/serbia"), "Sarajevo": ("Bosnia y Herzegovina", "bbbike:Sarajewo"), "Podgorica": ("Montenegro", "europe/montenegro"), "Tirana": ("Albania", "europe/albania"),
    "Skopie": ("Macedonia del Norte", "europe/macedonia"), "Pristina": ("Kosovo", "europe/kosovo"), "Sofía": ("Bulgaria", "bbbike:Sofia"), "Bucarest": ("Rumanía", "europe/romania"), "Chisináu": ("Moldavia", "europe/moldova"),
    "Kiev": ("Ucrania", "bbbike:Kiew"), "Atenas": ("Grecia", "europe/greece"), "Salónica": ("Grecia", "europe/greece"), "Santorini": ("Grecia", "europe/greece"),
    "Estambul": ("Turquía", "bbbike:Istanbul"), "Lárnaca": ("Chipre", "europe/cyprus"), "Nicosia": ("Chipre", "europe/cyprus"), "La Valeta": ("Malta", "europe/malta"), "Andorra la Vella": ("Andorra", "europe/andorra"),
    "Nueva York": ("Estados Unidos", "bbbike:NewYork"), "Los Ángeles": ("Estados Unidos", "bbbike:LosAngeles"), "San Francisco": ("Estados Unidos", "bbbike:SanFrancisco"),
    "Las Vegas": ("Estados Unidos", "north-america/us/nevada"), "Miami": ("Estados Unidos", "bbbike:Miami"), "Chicago": ("Estados Unidos", "bbbike:Chicago"), "Orlando": ("Estados Unidos", "bbbike:Orlando"),
    "Boston": ("Estados Unidos", "north-america/us/massachusetts"), "Washington D. C.": ("Estados Unidos", "bbbike:WashingtonDC"), "Seattle": ("Estados Unidos", "bbbike:Seattle"),
    "Nueva Orleans": ("Estados Unidos", "bbbike:NewOrleans"), "Honolulu": ("Estados Unidos", "north-america/us/hawaii"), "San Diego": ("Estados Unidos", "north-america/us/california/socal"),
    "Toronto": ("Canadá", "bbbike:Toronto"), "Vancouver": ("Canadá", "bbbike:Vancouver"), "Montreal": ("Canadá", "bbbike:Montreal"),
    "Ciudad de México": ("México", "bbbike:MexicoCity"), "Cancún": ("México", "north-america/mexico"), "Playa del Carmen": ("México", "north-america/mexico"), "Puerto Vallarta": ("México", "north-america/mexico"),
    "Tokio": ("Japón", "bbbike:Tokyo"), "Bangkok": ("Tailandia", "bbbike:Bangkok"), "Dubái": ("Emiratos Árabes Unidos", "asia/gcc-states"),
}

# Nombres en español que GeoNames no siempre incluye.
ALIASES = {
    "nueva york": "new york city", "washington d. c.": "washington", "montecarlo": "monte carlo", "skopie": "skopje",
    "san sebastian": "donostia", "chisinau": "chisinau", "kiev": "kyiv", "la valeta": "valletta", "reikiavik": "reykjavik",
    "denpasar (bali)": "denpasar", "ciudad ho chi minh": "ho chi minh city", "nueva delhi": "delhi", "bombay": "mumbai", "busan": "busan", "cebu": "cebu city",
    "shanghai": "shanghai", "pekin": "beijing", "hanoi": "hanoi", "seul": "seoul", "taipei": "taipei", "nom pen": "phnom penh", "kioto": "kyoto", "yakarta": "jakarta", "malaca": "malacca", "penang": "george town", "pattaya": "pattaya", "macao": "macau", "katmandu": "kathmandu",
    "liubliana": "ljubljana", "salonica": "thessaloniki", "lárnaca": "larnaca", "santorini": "fira", "andorra la vella": "andorra la vella",
}

# Ciudades de Asia con hoteles de la lista de Xotelo: su zona y su país. Todavía sin mapa propio.
ASIA_ZONES = {
    "Singapur": ("Singapur", "g294265"), "Kuala Lumpur": ("Malasia", "g298570"), "Penang": ("Malasia", "g298303"), "Malaca": ("Malasia", "g306997"),
    "Langkawi": ("Malasia", "g298283"), "Phuket": ("Tailandia", "g293920"), "Chiang Mai": ("Tailandia", "g293917"), "Pattaya": ("Tailandia", "g293919"),
    "Denpasar (Bali)": ("Indonesia", "g294226"), "Yakarta": ("Indonesia", "g294229"), "Yogyakarta": ("Indonesia", "g294230"),
    "Ciudad Ho Chi Minh": ("Vietnam", "g293925"), "Hanói": ("Vietnam", "g293924"), "Da Nang": ("Vietnam", "g298085"),
    "Manila": ("Filipinas", "g298573"), "Cebú": ("Filipinas", "g298460"), "Hong Kong": ("Hong Kong", "g294217"), "Macao": ("Macao", "g664891"),
    "Taipéi": ("Taiwán", "g293913"), "Osaka": ("Japón", "g298566"), "Kioto": ("Japón", "g298564"), "Sapporo": ("Japón", "g298560"), "Fukuoka": ("Japón", "g298207"),
    "Seúl": ("Corea del Sur", "g294197"), "Busán": ("Corea del Sur", "g297884"), "Shanghái": ("República Popular China", "g308272"), "Pekín": ("República Popular China", "g294212"),
    "Nueva Delhi": ("India", "g304551"), "Bombay": ("India", "g304554"), "Colombo": ("Sri Lanka", "g293962"), "Katmandú": ("Nepal", "g293890"),
    "Nom Pen": ("Camboya", "g293940"), "Siem Reap": ("Camboya", "g297390"),
}
for _city, (_country, _zone) in ASIA_ZONES.items():
    CITIES[_city] = (_country, None)


def place_of(city):
    return f"{city}, {CITIES[city][0]}"
