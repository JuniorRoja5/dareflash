#!/usr/bin/env bash
# REVISAR LAS CUATRO IMÁGENES ANTES DE PUBLICARLAS (lo ejecuta .github/workflows/imagenes.yml).
#
# Las imágenes son PÚBLICAS en ghcr.io: cualquier fichero o variable que lleven dentro lo puede leer
# cualquiera. Lo que garantiza que no lleven secretos es que se construyen SIN ninguno (el build no
# recibe variables, `.dockerignore` deja fuera `.env` y `.env.*`, y el runner no tiene el `.env` de
# producción). Esto lo COMPRUEBA en la imagen ya construida, por si algún día cambia algo de eso:
#
#   1. Ningún fichero `.env` / `.env.*` en el sistema de ficheros (salvo `.env.example`, que es público
#      y no tiene valores). `node_modules` se salta: viene de npm, no de este repositorio, y algunos
#      paquetes traen ficheros de ejemplo con ese nombre.
#   2. Solo variables de entorno CONOCIDAS (lista cerrada). Una variable nueva en la imagen tiene que
#      añadirse aquí a propósito, mirándola.
#   3. Ningún `NOMBRE_SECRETO=` en el historial de capas (los ARG de un RUN quedan ahí escritos).
#   4. El SHA: la etiqueta `revision` de las cuatro y el `GIT_SHA` de `web` son el del commit.
#
# Uso:  scripts/ci-revisar-imagenes.sh <registro> <sha>
#       (las imágenes <registro>/dareflash-{web,worker,migrate,geoip}:<sha> tienen que estar en local)
set -euo pipefail

REGISTRO="${1:?Falta el registro, p.ej. ghcr.io/juniorroja5}"
SHA="${2:?Falta el SHA}"
SERVICIOS=(web worker migrate geoip)
# Las del Dockerfile (NODE_ENV, GIT_SHA, PORT, HOSTNAME, GEOIP_FICHERO) y las de la imagen de node.
PERMITIDAS='^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV|GIT_SHA|PORT|HOSTNAME|GEOIP_FICHERO)='
SOSPECHOSAS='(SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|PRIVATE_KEY|DATABASE_URL|SMTP_PASS)[A-Z_]*='

fallos=0
fallo() {
  echo "::error::$*" >&2
  fallos=$((fallos + 1))
}

for s in "${SERVICIOS[@]}"; do
  img="$REGISTRO/dareflash-$s:$SHA"
  echo "==> $img"

  rev=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$img")
  [ "$rev" = "$SHA" ] || fallo "$img: la etiqueta revision es '$rev', no el SHA del commit"

  while IFS= read -r v; do
    [ -z "$v" ] && continue
    [[ "$v" =~ $PERMITIDAS ]] || fallo "$img: variable de entorno no prevista: ${v%%=*}"
  done < <(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$img")

  if docker history --no-trunc --format '{{.CreatedBy}}' "$img" | grep -Eiq "$SOSPECHOSAS"; then
    fallo "$img: el historial de capas lleva algo con nombre de secreto"
  fi

  # `sh -c '...; true'`: `find` sale con error por los directorios que el usuario de la imagen no puede
  # leer (web corre como nextjs), y eso no es un hallazgo.
  encontrados=$(docker run --rm --entrypoint sh "$img" -c \
    'find / -xdev \( -path /proc -o -path /sys -o -name node_modules \) -prune -o \
       \( -name ".env" -o -name ".env.*" \) ! -name ".env.example" -print 2>/dev/null; true')
  [ -z "$encontrados" ] || fallo "$img: ficheros de entorno dentro de la imagen: $encontrados"
done

# GEOIP: lo que su guion necesita CARGA dentro de la imagen (lleva solo `maxmind` y sus dependencias, no
# el node_modules de la app), y la imagen no vuelve a hincharse: llego a pesar ~1,8 GB por copiar el
# node_modules entero para usar un paquete de 54 KB.
GEOIP="$REGISTRO/dareflash-geoip:$SHA"
docker run --rm --entrypoint node "$GEOIP" \
  -e 'import("maxmind").then((m) => { if (typeof m.Reader !== "function") process.exit(1); })' \
  || fallo "$GEOIP: maxmind no carga dentro de la imagen (¿falta una de sus dependencias?)"
TOPE_GEOIP_MB=500
tam=$(docker image inspect --format '{{.Size}}' "$GEOIP")
[ "$tam" -le $((TOPE_GEOIP_MB * 1024 * 1024)) ] \
  || fallo "$GEOIP: pesa $((tam / 1024 / 1024)) MB (tope $TOPE_GEOIP_MB): ¿ha vuelto el node_modules entero?"

gs=$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' \
  "$REGISTRO/dareflash-web:$SHA" | sed -n 's/^GIT_SHA=//p')
[ "$gs" = "$SHA" ] || fallo "web: GIT_SHA es '$gs', no el SHA del commit (el health mentiría)"

if [ "$fallos" -gt 0 ]; then
  echo "REVISIÓN FALLIDA: $fallos problema(s). No se publica nada." >&2
  exit 1
fi
echo "Revisión correcta: las cuatro imágenes, sin secretos y con el SHA $SHA."
