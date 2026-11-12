# syntax=docker/dockerfile:1

# =============================================================================
# DareFlash — imagen de PRODUCCION (VPS). Multi-stage.
# Node 22.23.1 (segun .nvmrc). Salida `standalone` de Next para imagen ligera.
#
# argon2 es un modulo NATIVO: se instala en la etapa `deps` (con build tools por si
# no hay binario precompilado), y su binario + deps de runtime viajan a la imagen final
# via `outputFileTracingIncludes` en next.config (verificado: carga y hashea en la imagen).
# =============================================================================

# ---- Base comun ----
FROM node:22.23.1-slim AS base
# NODE_ENV NO se fija aqui: deps y builder necesitan las devDependencies (Tailwind,
# TypeScript, Prisma CLI...). Se fija a production solo en la etapa final (runner).
# libssl/ca-certificates: TLS a MariaDB/SMTP. tini: init limpio (senales/zombies).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates openssl tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Dependencias (incluye compilar/instalar el binario nativo de argon2) ----
FROM base AS deps
# Herramientas de compilacion, solo en esta etapa (no viajan a la final).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# El postinstall ejecuta `prisma generate` (necesita schema + prisma.config.ts) y el
# script `prepare` corre `scripts/prepare.mjs` (husky; se auto-omite sin .git).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts ./scripts
# `npm ci` corre los scripts de instalacion: argon2 baja/compila su .node, y el
# postinstall genera el cliente Prisma. Cache del store de npm entre builds.
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- Build de la app ----
FROM base AS builder
# Deps ya instaladas (con el binario de argon2 y el cliente Prisma).
COPY --from=deps /app/node_modules ./node_modules
# Codigo fuente (sin lo que excluye .dockerignore: node_modules, .next, src/generated...).
COPY . .
# Regenerar el cliente Prisma sobre el fuente recien copiado y construir.
# `rm -rf .next/cache`: desde Next 16.3, `next build` escribe por defecto la cache de Turbopack
# (~115 MB) en .next/cache. Aqui no sirve de nada: cada build de Docker parte de una capa limpia y
# nunca la reutiliza. `runner` no la copia, pero `worker` y `migrate` heredan de esta etapa y se la
# llevarian (+90 MB de imagen). Va en el MISMO RUN: en uno aparte, la capa del build ya la contendria
# y la imagen pesaria igual.
# `--network=none`: el build NO tiene red, a proposito. Las dependencias ya estan (etapa `deps`) y las
# fuentes van en el repositorio (src/app/fuentes). Antes `next/font/google` las descargaba aqui, y esa
# descarga fallaba a veces y tumbaba el build (los rojos de docker-build del 2026-11-06). Sin red, si
# algo vuelve a querer descargar durante el build, falla SIEMPRE y en el acto, no de vez en cuando.
RUN --network=none npx prisma generate && npm run build && rm -rf .next/cache

# ---- Imagen final (runtime) ----
FROM base AS runner
ENV NODE_ENV=production

# COMMIT del artefacto, para /api/health. `.git` no entra en el contexto de build (.dockerignore),
# asi que el SHA llega como ARGUMENTO desde fuera: en CI, `github.sha` (.github/workflows/imagenes.yml);
# en el plan de emergencia, `git rev-parse HEAD` (scripts/deploy.sh --construir-aqui).
# Sin un SHA valido el build FALLA aqui a proposito: una imagen que no sabe que version es obliga a
# adivinar si "main = desplegado" (y deploy.sh no podria comprobar que el health es el SHA desplegado).
# Falla ANTES de publicar o sustituir nada, asi que la version en marcha sigue sirviendo. Solo esta
# etapa lo exige (`builder` y `worker` no): las otras imagenes no lo necesitan para funcionar.
ARG GIT_SHA
RUN echo "$GIT_SHA" | grep -Eq '^[0-9a-f]{40}$' \
    || { echo "ERROR: falta GIT_SHA o no es un SHA de 40 hex. Construye con GIT_SHA=\$(git rev-parse HEAD)" >&2; exit 1; }
ENV GIT_SHA=$GIT_SHA
# Usuario NO root.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home /app --shell /usr/sbin/nologin nextjs

# Salida standalone: server.js + node_modules trazadas.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# argon2 (nativo, con @phc/format y node-gyp-build) llega via el standalone gracias a
# `outputFileTracingIncludes` en next.config. No hace falta copiarlo a mano.

# Punto de montaje del volumen de AVATARES con el dueño correcto. `web` corre como nextjs (uid 1001)
# y escribe aqui (env.AVATARS_DIR=/srv/avatars); si el volumen se monta sobre un dir de root,
# writeFile da EACCES (500). Creando el dir con este dueño ANTES de montar, un volumen NUEVO hereda
# el dueño -> nextjs escribe; caddy lo lee en solo-lectura. Ver docker-compose.prod.yml.
RUN mkdir -p /srv/avatars && chown nextjs:nodejs /srv/avatars

# Punto de montaje del volumen de PORTADAS con el dueño correcto. Mismo motivo que avatares: `web` corre
# como nextjs (uid 1001) y escribe aqui (env.PORTADAS_DIR=/srv/portadas); si el volumen se monta sobre un
# dir de root, writeFile da EACCES y la portada se pierde. Creando el dir con este dueño ANTES de montar,
# un volumen NUEVO hereda el dueño -> nextjs escribe; caddy lo lee en solo-lectura. Ver docker-compose.prod.yml.
RUN mkdir -p /srv/portadas && chown nextjs:nodejs /srv/portadas

USER nextjs
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000

# tini como PID 1: reenvia senales y cosecha procesos zombie.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]

# ⚠️ ORDEN DE LAS ETAPAS: Docker construye la ULTIMA etapa por defecto (sin `--target`). Por eso
# TODOS los servicios del compose fijan su `target` explicitamente (web->runner, worker->worker,
# migrate->builder): anadir una etapa al final NO debe cambiar lo que construye ningun servicio.
# Ya paso una vez -> `web` construyo `worker` y devolvia 502. Nunca dependas del orden.
#
# ---- Worker permanente de la cola de trabajos ----
# Derivado de `builder` (tiene tsx, el codigo fuente y el cliente Prisma). Corre SIEMPRE (no
# one-off). `--conditions=react-server` permite importar los modulos `server-only` (prisma,
# env, adaptador) en un proceso Node. tini (PID 1) reenvia SIGTERM para el apagado limpio.
FROM builder AS worker
ENV NODE_ENV=production
# node DIRECTO (tsx como loader, no `npx tsx`): asi el proceso Node es el hijo directo de
# tini y recibe SIGTERM en su handler -> apagado limpio (con npx en medio, la senal no llega
# a node y el contenedor moria con 143).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/worker.ts"]

# ---- geoip: actualiza el fichero de IP (one-off, servicio `geoip` del compose) ----
# El guion mensual (scripts/actualizar-geoip.sh) necesita curl, gunzip, node y `maxmind` (el paso de
# control abre el fichero nuevo y resuelve IP conocidas). Va en la imagen para que el host no tenga que
# instalar NADA ni saber donde vive el volumen: `docker compose -f docker-compose.prod.yml run --rm
# geoip` (la imagen la construye CI y deploy.sh la deja como `desplegada`).
#
# Deriva de `base` y NO de `builder` a proposito: asi no depende del codigo de la app (y, si alguna vez
# se construye en el servidor, nunca dispara un `next build`: en 1 vCPU, minutos de CPU). El COPY de
# node_modules es el MISMO que el primer paso de `builder` sobre la misma `base`: BuildKit reutiliza esa
# capa, no ocupa disco de mas. curl va DESPUES del COPY por eso mismo (antes, la capa ya no coincidiria).
# gzip, date (GNU) y stat ya vienen en la imagen slim de Debian. Corre como root: escribe en el volumen,
# y deja el fichero 644 para que `web` (nextjs) lo lea.
FROM base AS geoip
COPY --from=deps /app/node_modules ./node_modules
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/actualizar-geoip.sh scripts/geoip-comprobar.mjs ./scripts/
ENV GEOIP_FICHERO=/srv/geoip/dbip-city-lite.mmdb
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "scripts/actualizar-geoip.sh"]
