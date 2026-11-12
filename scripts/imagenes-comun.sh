#!/usr/bin/env bash
# LO COMÚN A LOS SCRIPTS DEL SERVIDOR QUE USAN LAS IMÁGENES (deploy.sh, geoip-mensual.sh, limpiar.sh,
# migrate-prod.sh). Se carga con `source`; no se ejecuta solo.
#
# ┌─ QUÉ VERSIÓN ESTÁ DESPLEGADA: LA DEL CONTENEDOR `web` EN MARCHA ──────────────────────────────────┐
# │ No una etiqueta local ni un fichero. La etiqueta `desplegada` es solo local (no existe en el       │
# │ registro), y un `docker image prune -a` la borra en cuanto su imagen no tiene contenedor: les pasa │
# │ SIEMPRE a `geoip` y a `migrate`, que son de un solo uso. Pasó el 2026-11-12 y el cron de geoip     │
# │ habría fallado en diciembre. Un fichero escrito por deploy.sh se podría quedar viejo (un `up -d`   │
# │ a mano en una emergencia) y repite algo que Docker ya sabe.                                         │
# │                                                                                                     │
# │ El contenedor `web` en marcha es la verdad: es lo que sirve, su imagen lleva la etiqueta            │
# │ `org.opencontainers.image.revision` con el SHA (la pone CI y la revisa `ci-revisar-imagenes.sh`),  │
# │ y una imagen con contenedor en marcha no la borra ningún `prune`.                                   │
# └─────────────────────────────────────────────────────────────────────────────────────────────────────┘

REGISTRO="ghcr.io/juniorroja5"
SERVICIOS=(web worker migrate geoip)
COMPOSE=(docker compose -f docker-compose.prod.yml)

# El SHA de lo que sirve ahora mismo. Falla (con su mensaje) si `web` no está en marcha.
sha_en_marcha() {
  local id rev
  id=$("${COMPOSE[@]}" ps -q web 2>/dev/null | head -1)
  if [ -z "$id" ]; then
    echo "ERROR: el contenedor web no está en marcha: no se sabe qué versión está desplegada." >&2
    return 1
  fi
  rev=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
    "$id" 2>/dev/null | tr -d '\r')
  if [[ ! "$rev" =~ ^[0-9a-f]{40}$ ]]; then
    echo "ERROR: la imagen de web no dice de qué commit es (revision='$rev')." >&2
    return 1
  fi
  echo "$rev"
}

# Que la imagen de un servicio para un SHA esté en este servidor (la descarga si falta) y que la
# etiqueta local `desplegada` apunte a ella. Las imágenes del registro son públicas: no hace falta login.
asegurar_imagen() {
  local servicio="$1" sha="$2" img
  img="$REGISTRO/dareflash-$servicio:$sha"
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "    Falta $img en el servidor: se descarga." >&2
    docker pull --quiet "$img" >/dev/null
  fi
  docker tag "$img" "$REGISTRO/dareflash-$servicio:desplegada"
}
