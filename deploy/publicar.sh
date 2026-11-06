#!/bin/bash
# Sube TopTravel al alojamiento sin tocar las cuentas de usuarios que ya hay allí.
# Uso:  bash deploy/publicar.sh USUARIO_SSH CUENTA [--con-env]
#   --con-env  sube también .env; solo hace falta la primera vez o si cambian las claves.
set -euo pipefail

SSH_USER="${1:?Falta el usuario SSH}"
ACCOUNT="${2:?Falta el nombre de la cuenta}"
WITH_ENV="${3:-}"
HOST="${SSH_USER}@ssh-${ACCOUNT}.alwaysdata.net"
KEY="${TOPTRAVEL_SSH_KEY:-$HOME/.ssh/toptravel_deploy}"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes)

cd "$(dirname "$0")/.."

# Solo lo que necesita la web. Las cachés se suben para que nadie espere la primera vez;
# data/toptravel.db nunca se incluye, porque sobrescribiría las cuentas reales.
FILES=(server.py accounts.py price_collector.py app.js theme.js landing.html landing.css landing.js index.html styles.css privacidad.html aviso-legal.html
       hoteles_destacados.json xotelo_cities.json assets vendor)
for cache in data/hotels.json data/places.json data/mapas; do
  [ -e "$cache" ] && FILES+=("$cache")
done

tar -czf - "${FILES[@]}" | "${SSH[@]}" "$HOST" 'mkdir -p toptravel && tar -xzf - -C toptravel'

if [ "$WITH_ENV" = "--con-env" ]; then
  # Solo las claves que usa la web; el resto no sale de este ordenador.
  grep -E '^(TRAVELPAYOUTS_TOKEN|CONTACT_EMAIL|SMTP_[A-Z]+|MAIL_FROM|SITE_URL|HOTEL_PRICES|NOMINATIM)=' .env     | "${SSH[@]}" "$HOST" 'umask 077; cat > toptravel/.env'
fi

# La web comprueba este archivo cada 5 segundos y se reinicia sola con el código nuevo.
"${SSH[@]}" "$HOST" 'touch toptravel/data/reiniciar'
echo "Archivos subidos. La web se reinicia sola en unos segundos."
