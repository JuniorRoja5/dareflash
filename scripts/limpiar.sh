#!/usr/bin/env bash
# LIBERAR DISCO EN EL SERVIDOR. Es la ÚNICA forma de limpiar imágenes en producción.
#
#   ./scripts/limpiar.sh          (deploy.sh lo ejecuta solo al final de cada despliegue)
#
# NUNCA `docker image prune -a` ni `docker system prune -a` a ciegas: borran toda imagen que no tenga un
# contenedor en marcha, y `geoip` y `migrate` NUNCA lo tienen (son de un solo uso). El 2026-11-12 eso
# borró sus imágenes y la etiqueta `desplegada`, y el cron de geoip habría fallado en diciembre.
#
# Qué hace:
#  1. CONSERVA las cuatro imágenes (web, worker, migrate, geoip) de la versión EN MARCHA —la del
#     contenedor `web`, ver `sha_en_marcha`— y las de la ANTERIOR, para volver atrás sin descargar.
#     Si alguna de las dos versiones tiene una imagen que falta, la DESCARGA (es lo que se quiere tener).
#  2. BORRA el resto de imágenes de DareFlash: otras versiones del registro y las viejas construidas en
#     el servidor (`dareflash-*` sin registro delante). Las de terceros (mariadb, redis, caddy) no las
#     toca: tienen contenedor y no son nuestras.
#  3. Vacía las imágenes colgantes (sin etiqueta) y la CACHÉ DE BUILD (el servidor ya no construye; el
#     plan de emergencia volvería a construir desde cero, que es lo que es).
#
# La ANTERIOR sale del historial que escribe deploy.sh (una línea por despliegue con éxito): es lo único
# que no se puede preguntar a Docker. Sin historial, solo se conserva la versión en marcha.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=imagenes-comun.sh
source scripts/imagenes-comun.sh

HISTORIAL="${DEPLOY_HISTORIAL:-.despliegues}"

ACTUAL=$(sha_en_marcha)
ANTERIOR=""
if [ -f "$HISTORIAL" ]; then
  ANTERIOR=$(grep -E '^[0-9a-f]{40}$' "$HISTORIAL" | grep -vx "$ACTUAL" | tail -1 || true)
fi

echo "==> Se conservan: $ACTUAL (en marcha)${ANTERIOR:+ y $ANTERIOR (anterior)}"
for s in "${SERVICIOS[@]}"; do
  asegurar_imagen "$s" "$ACTUAL"
  if [ -n "$ANTERIOR" ] && ! docker image inspect "$REGISTRO/dareflash-$s:$ANTERIOR" >/dev/null 2>&1; then
    docker pull --quiet "$REGISTRO/dareflash-$s:$ANTERIOR" >/dev/null ||
      echo "    No se pudo descargar $s:$ANTERIOR (volver atrás la descargará entonces)." >&2
  fi
done

borradas=0
while IFS= read -r img; do
  [ -z "$img" ] && continue
  repo="${img%:*}"
  etiqueta="${img##*:}"
  if [ "$repo" != "${repo#"$REGISTRO"/dareflash-}" ]; then
    case "$etiqueta" in
      desplegada | "$ACTUAL" | "${ANTERIOR:-ninguna}") continue ;;
    esac
  elif [[ ! "$repo" =~ ^dareflash[-_] ]]; then
    continue # de terceros: no es nuestra
  fi
  if docker rmi "$img" >/dev/null 2>&1; then
    borradas=$((borradas + 1))
  fi
done < <(docker images --format '{{.Repository}}:{{.Tag}}')

docker image prune -f >/dev/null 2>&1 || true
docker builder prune -a -f >/dev/null 2>&1 || true
echo "==> Limpieza hecha: $borradas imágenes borradas, más las colgantes y la caché de build."
