#!/usr/bin/env bash
#
# Aplica las migraciones en PRODUCCIÓN con la imagen `migrate` YA DESCARGADA. No construye nada: la
# imagen la construye CI y la descarga scripts/deploy.sh, que es quien llama a este script.
#
# POR QUÉ COMPARA ANTES DE APLICAR (bug real, agosto 2026):
#   `migrate deploy` con una imagen VIEJA no ve las carpetas de migración nuevas y dice
#   "N migrations found ... No pending" en FALSO (y `migrate resolve` falla con P3017). Entonces la
#   causa era que `docker compose run` reutilizaba una imagen construida en un despliegue anterior.
#   Con imágenes etiquetadas por SHA eso ya no puede pasar sin querer, pero la comprobación es barata
#   y ahora es AUTOMÁTICA: la lista de la imagen tiene que ser EXACTAMENTE la del commit que la imagen
#   dice ser (su etiqueta `revision`). Antes había que compararla a ojo.
#
# Uso normal: lo llama deploy.sh.
# A mano:     IMAGE_TAG=<sha> ./scripts/migrate-prod.sh      (sin IMAGE_TAG: la de la versión en marcha)
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=imagenes-comun.sh
source scripts/imagenes-comun.sh

# Sin IMAGE_TAG (a mano): la versión EN MARCHA, no la etiqueta local `desplegada`, que un `prune` puede
# haber borrado (le pasa a `migrate`, que nunca tiene contenedor). Si su imagen falta, se descarga.
if [ -z "${IMAGE_TAG:-}" ]; then
  IMAGE_TAG=$(sha_en_marcha)
  asegurar_imagen migrate "$IMAGE_TAG"
fi
export IMAGE_TAG
IMAGEN="$REGISTRO/dareflash-migrate:$IMAGE_TAG"

morir() {
  echo "ERROR: $*" >&2
  exit 1
}

REV=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
  "$IMAGEN" 2>/dev/null) || morir "no está la imagen $IMAGEN en este servidor. Despliega con ./scripts/deploy.sh."
[[ "$REV" =~ ^[0-9a-f]{40}$ ]] || morir "la imagen $IMAGEN no dice de qué commit es (revision='$REV')."

echo "==> [1/3] Migraciones que VE la imagen, frente a las del commit ${REV:0:12}…"
# Solo nombres de carpeta (migration_lock.toml no es una migración). `-T`: sin TTY, sin \r en la salida.
EN_IMAGEN=$("${COMPOSE[@]}" run --rm -T --no-deps --entrypoint sh migrate -c "ls -1 prisma/migrations" \
  | tr -d '\r' | grep -v '^migration_lock\.toml$' | sort)
EN_COMMIT=$(git ls-tree --name-only "$REV" prisma/migrations/ \
  | sed 's#^prisma/migrations/##' | grep -v '^migration_lock\.toml$' | sort)
if [ "$EN_IMAGEN" != "$EN_COMMIT" ]; then
  echo "La imagen y el commit NO ven las mismas migraciones:" >&2
  diff <(echo "$EN_COMMIT") <(echo "$EN_IMAGEN") >&2 || true
  morir "no se aplica nada (una imagen que no ve todas las migraciones da un 'No pending' FALSO)."
fi
echo "    $(echo "$EN_IMAGEN" | grep -c .) migraciones, las mismas en la imagen y en el commit."

echo "==> [2/3] Aplicando las pendientes (prisma migrate deploy)…"
"${COMPOSE[@]}" run --rm -T migrate

echo "==> [3/3] Estado del esquema:"
"${COMPOSE[@]}" run --rm -T --no-deps migrate npx prisma migrate status
