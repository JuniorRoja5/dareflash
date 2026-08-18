#!/usr/bin/env bash
#
# Aplica las migraciones en PRODUCCIÓN (VPS) de forma REPRODUCIBLE y sin el fallo del "No pending" falso.
#
# POR QUÉ EXISTE ESTE SCRIPT (bug real, agosto 2026):
#   `docker compose run migrate` REUSA la imagen `dareflash-migrate` si ya existe; NO la reconstruye
#   salvo que se pase `--build`. Y `up -d --build` NO reconstruye `migrate` (está en `profiles: [tools]`,
#   fuera de `up`). Resultado: tras el primer deploy la imagen de migrate queda CONGELADA y no contiene
#   las carpetas de migración nuevas -> `migrate deploy` dice "N migrations found ... No pending" en
#   FALSO y `migrate resolve` falla con P3017 ("migration could not be found"), porque la carpeta ni
#   siquiera está en la imagen. El Dockerfile es correcto (el `builder` hace `COPY . .`, recursivo): el
#   fallo era construir de menos, no copiar de menos.
#
# ESTE SCRIPT reconstruye SIEMPRE la imagen `migrate` desde el contexto actual, VERIFICA que ve todas
# las migraciones del repo y sólo entonces aplica. Úsalo en cada despliegue que traiga migraciones.
#
# Uso:  ./scripts/migrate-prod.sh
set -euo pipefail

COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "==> [1/3] Reconstruyendo la imagen 'migrate' desde el contexto actual (evita reusar una vieja)…"
"${COMPOSE[@]}" build migrate

echo "==> [2/3] Verificación: migraciones que la imagen VE (deben ser TODAS las del repo):"
# --no-deps: no arranca mariadb sólo para listar ficheros. Entrypoint a sh para hacer el ls.
"${COMPOSE[@]}" run --rm --no-deps --entrypoint sh migrate -c "ls -1 prisma/migrations"
echo "    (compáralo con: ls -1 prisma/migrations en el repo — deben coincidir)"

echo "==> [3/3] Aplicando migraciones pendientes (prisma migrate deploy)…"
"${COMPOSE[@]}" run --rm migrate

echo "==> Hecho. Estado del esquema:"
"${COMPOSE[@]}" run --rm --no-deps migrate npx prisma migrate status
