#!/usr/bin/env bash
# EL CRON MENSUAL DEL FICHERO DE IP. Es la línea que va en el crontab del servidor:
#
#   cd <directorio del repositorio> && ./scripts/geoip-mensual.sh
#
# Ejecuta el servicio `geoip` del compose (scripts/actualizar-geoip.sh dentro de su imagen) con la imagen
# de la VERSIÓN EN MARCHA, y no depende de que exista la etiqueta local `desplegada`: si su imagen falta
# (p.ej. tras un `docker image prune -a`, que la borra porque `geoip` no tiene contenedor), la descarga
# del registro. Cómo se sabe qué versión está en marcha: ver `sha_en_marcha` en imagenes-comun.sh.
#
# Si algo falla sale con código distinto de cero, y el guion de dentro no toca el fichero vivo (deja su
# registro en /srv/geoip/actualizar-geoip.log, dentro del volumen).
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=imagenes-comun.sh
source scripts/imagenes-comun.sh

SHA=$(sha_en_marcha)
asegurar_imagen geoip "$SHA"
echo "==> geoip con la imagen de $SHA"
IMAGE_TAG="$SHA" "${COMPOSE[@]}" run --rm -T geoip
