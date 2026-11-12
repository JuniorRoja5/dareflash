#!/usr/bin/env bash
# ACTUALIZA EL FICHERO DE IP (DB-IP Lite City, MMDB, CC BY 4.0) — Fase 9 · P5, §4.1 del plan.
#
# Pensado para el cron MENSUAL del host, que lo ejecuta DENTRO del servicio `geoip` del compose (la
# imagen trae curl, gunzip, node y maxmind, y monta el volumen en escritura):
#   docker compose -f docker-compose.prod.yml run --rm geoip
# (con la imagen `desplegada`, que construye CI y deja en el servidor scripts/deploy.sh)
# Vive en el repositorio porque no lleva credenciales ni nada secreto (DB-IP Lite se descarga sin
# cuenta ni clave).
#
# Ocho pasos, ninguno de adorno:
#   1. Descarga a un fichero TEMPORAL en el MISMO volumen (el rename solo es atómico dentro del mismo
#      sistema de ficheros).
#   2. Comprueba que no es una página de error y que su tamaño está en un margen razonable del anterior:
#      una descarga truncada es el fallo típico y el que más se parece a un éxito.
#   3. Lo ABRE y resuelve IP de control de países conocidos. Es el paso que de verdad vale: un fichero
#      bien formado que no resuelve nada pasa cualquier suma de verificación.
#   4. rename() sobre la ruta viva: atómico, ningún lector ve medio fichero (la app lo reabre sola).
#   5. Guarda el anterior como .anterior durante un ciclo: volver atrás es otro rename.
#   6. No borra el viejo hasta que el nuevo pasó el paso 3.
#   7. Deja una línea de registro: fecha, tamaño y resultado de las IP de control.
#   8. Si algo falla, NO TOCA NADA y sale con código distinto de cero.
#
# Uso directo (fuera de Docker, p.ej. para probarlo en local):
#       GEOIP_FICHERO=/ruta/dbip-city-lite.mmdb scripts/actualizar-geoip.sh
# Variables opcionales:
#   GEOIP_MES         AAAA-MM a descargar (por defecto, el mes actual; si aún no está, el anterior).
#   GEOIP_COMPROBAR   comando que comprueba un .mmdb (recibe la ruta); por defecto el de este repo con
#                     Node: node scripts/geoip-comprobar.mjs <fichero>.
#   GEOIP_REGISTRO    fichero de registro (por defecto, <dir del fichero>/actualizar-geoip.log).
set -euo pipefail

FICHERO="${GEOIP_FICHERO:?Falta GEOIP_FICHERO: la ruta viva del .mmdb dentro del volumen}"
DIR="$(dirname "$FICHERO")"
AQUI="$(cd "$(dirname "$0")" && pwd)"
COMPROBAR="${GEOIP_COMPROBAR:-node $AQUI/geoip-comprobar.mjs}"
REGISTRO="${GEOIP_REGISTRO:-$DIR/actualizar-geoip.log}"
TEMPORAL="$DIR/.descarga-$$.mmdb"

registrar() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$REGISTRO"; }
# Paso 8: pase lo que pase, el temporal no se queda; la ruta viva no se ha tocado salvo en el paso 4.
trap 'rm -f "$TEMPORAL" "$TEMPORAL.gz"' EXIT

descargar() {
  local mes="$1"
  curl -fsSL --max-time 600 -o "$TEMPORAL.gz" \
    "https://download.db-ip.com/free/dbip-city-lite-${mes}.mmdb.gz"
}

# --- 1. Descarga al mismo volumen -------------------------------------------------------------------
MES="${GEOIP_MES:-$(date -u +%Y-%m)}"
if ! descargar "$MES"; then
  # A primeros de mes el fichero nuevo puede no estar publicado todavía.
  MES="$(date -u -d "$(date -u +%Y-%m-15) -1 month" +%Y-%m)"
  descargar "$MES" || { registrar "FALLO descarga (mes $MES): no se toca nada"; exit 1; }
fi
gunzip -c "$TEMPORAL.gz" > "$TEMPORAL" || { registrar "FALLO gunzip: no se toca nada"; exit 1; }

# --- 2. No es una página de error, y su tamaño es razonable ----------------------------------------
TAM_NUEVO=$(stat -c %s "$TEMPORAL")
if [ "$TAM_NUEVO" -lt 10000000 ]; then
  registrar "FALLO tamaño: ${TAM_NUEVO} bytes (menos de 10 MB: página de error o descarga truncada)"
  exit 1
fi
if [ -f "$FICHERO" ]; then
  TAM_VIEJO=$(stat -c %s "$FICHERO")
  # Margen: entre la mitad y el doble del anterior. Fuera de eso, algo raro ha pasado.
  if [ "$TAM_NUEVO" -lt $((TAM_VIEJO / 2)) ] || [ "$TAM_NUEVO" -gt $((TAM_VIEJO * 2)) ]; then
    registrar "FALLO tamaño: ${TAM_NUEVO} bytes frente a ${TAM_VIEJO} del anterior (fuera de margen)"
    exit 1
  fi
fi

# --- 3. Lo abre y resuelve IP de control ------------------------------------------------------------
if ! CONTROL=$($COMPROBAR "$TEMPORAL" 2>&1); then
  registrar "FALLO control: $CONTROL"
  exit 1
fi

# --- 5 y 6. El anterior pasa a .anterior (solo ahora: el nuevo ya pasó el paso 3) -------------------
if [ -f "$FICHERO" ]; then
  cp -p "$FICHERO" "$FICHERO.anterior"
fi

# --- 4. rename atómico sobre la ruta viva -----------------------------------------------------------
mv -f "$TEMPORAL" "$FICHERO"

# --- 7. Una línea de registro -----------------------------------------------------------------------
registrar "OK mes=$MES tamaño=${TAM_NUEVO} control: $CONTROL"
