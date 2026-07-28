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
RUN npx prisma generate && npm run build

# ---- Imagen final (runtime) ----
FROM base AS runner
ENV NODE_ENV=production
# Usuario NO root.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home /app --shell /usr/sbin/nologin nextjs

# Salida standalone: server.js + node_modules trazadas.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# argon2 (nativo, con @phc/format y node-gyp-build) llega via el standalone gracias a
# `outputFileTracingIncludes` en next.config. No hace falta copiarlo a mano.

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
