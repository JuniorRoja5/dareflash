# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Idioma

El código, los comentarios, los nombres de fichero y los identificadores están **en
castellano** (`participacion.ts`, `retos-publico.ts`, `esCuentaAtrasCritica`). Los comentarios
explican el _por qué_ y suelen documentar un fallo real que ya ocurrió — léelos antes de
"simplificar" algo que parece redundante. Escribe el código nuevo igual.

## Comandos

```bash
npm run dev                  # servidor de desarrollo (http://localhost:3000)
npm run build / npm start    # build de producción / arranque
npm run worker               # runner de la cola Job (proceso permanente; en prod es el servicio `worker`)
npm run typecheck            # tsc --noEmit  +  tsc --noEmit -p tsconfig.test.json (los tests van aparte)
npm run lint / npm run format
npm test                     # vitest run
npm run test:build-sin-env   # build SIN variables de entorno (así construye Docker) — corre en pre-push
```

Un solo test: `npx vitest run tests/vote.test.ts` — o `npx vitest run -t "nombre del caso"`.

**Los tests necesitan MariaDB levantada**: `docker compose -f docker-compose.dev.yml up -d`
(puerto **3307** en el host). El `globalSetup` crea y migra `dareflash_test` +
`dareflash_test_1..4`: **una BD por worker de vitest**. `NUM_WORKER_DBS` en
[tests/helpers/workers.ts](tests/helpers/workers.ts) y `maxWorkers` en
[vitest.config.ts](vitest.config.ts) **deben coincidir** — si no, un worker se queda sin BD.

Base de datos en local: `npx prisma migrate dev`, `npx prisma db seed`. `postinstall` ejecuta
`prisma generate` (el cliente vive en `src/generated/`, gitignoreado). Producción y despliegue
(VPS + Docker Compose + Caddy, migraciones, SMTP) están documentados en [README.md](README.md);
consúltalo antes de tocar nada de infraestructura.

Hooks de husky: **pre-commit** = lint-staged + `typecheck`; **pre-push** = `test:build-sin-env`;
**commit-msg** = Conventional Commits (commitlint).

## Reglas que rompen el despliegue

Producción (y CI, y Docker) ejecutan **`next build` sin ninguna variable de entorno**. Dos
consecuencias no negociables:

1. **Nadie lee `process.env` fuera de [src/config/env.ts](src/config/env.ts)**. Se importa el
   objeto `env` tipado (validado con Zod).
2. **`env` valida de forma perezosa, al leer una propiedad.** Se puede leer desde código que corre
   _por petición_ (route handlers, server actions, `src/server/**`). Está **prohibido** leerlo en
   ámbito de módulo de cualquier cosa bajo `src/app/**`, o en componentes/layouts que se
   prerendericen: se evaluaría durante el build → excepción → despliegue caído.

`prisma` ([src/server/db/client.ts](src/server/db/client.ts)) sigue el mismo patrón: singleton en
`globalThis`, construido perezosamente en el primer acceso a una propiedad. Por defensa en capas,
las rutas lo cargan con **import dinámico dentro del handler** (`depsRuta()`, o inyectado por
`mutatingRoute`), nunca con import estático en ámbito de módulo.

`npm run test:build-sin-env` vigila esa propiedad; el workflow
[docker-build.yml](.github/workflows/docker-build.yml) construye la imagen real (la que respeta
`.dockerignore`) en cada push.

Promover una variable a **obligatoria** en `env.ts` obliga a añadirla al `.env` del servidor **en
el mismo paso**: si falta, el proceso muere al arrancar (fail-fast deliberado, ver
[src/config/startup.ts](src/config/startup.ts)).

## Arquitectura

Next 16 (App Router, `output: "standalone"`) + React 19 + Prisma 7 sobre **MariaDB 11.8**
(`@prisma/adapter-mariadb`, queryCompiler en WASM: sin motor nativo en runtime). Redis está
montado pero sin usar para nada crítico: **MariaDB es la fuente de verdad** de sesiones,
rate-limit y cola de trabajos.

- **[src/config/](src/config/)** — `env.ts` (única puerta a `process.env`), `constants.ts` (todos
  los umbrales, cadencias, límites y catálogos de producto), `startup.ts`.
- **[src/lib/](src/lib/)** — lógica **pura**, sin React ni servidor; se testea directamente.
- **[src/server/](src/server/)** — todo lo que toca BD/red, marcado con `server-only`. Los
  servicios reciben el `PrismaClient` **por parámetro** (inyección de dependencia) en vez de
  importar el singleton: así son testeables desde Vitest y reutilizables desde los jobs.
- **[src/app/](src/app/)** — `(app)/(shell)/` es la app de usuario (feed, retos, perfil, buscar,
  ranking); `panel/` es el admin, protegido en bloque por `protegerPanel()` en su layout;
  `api/**/route.ts` son los endpoints.
- **[src/proxy.ts](src/proxy.ts)** — el antiguo `middleware` (renombrado en Next 16). Solo hace
  UX: enruta `/` por dispositivo (móvil → `/feed`, resto → `/inicio`) y manda a los anónimos de
  rutas protegidas a `/entrar?siguiente=…`. La seguridad real la aplica siempre el servidor.

### Mutaciones: `mutatingRoute` es obligatorio

Toda ruta que exporte `POST/PUT/PATCH/DELETE` debe pasar por
[mutatingRoute](src/server/auth/mutating-route.ts), que comprueba **Origin → sesión → CSRF** e
inyecta `{ user, env, prisma }` más el `routeContext` de Next intacto (para los `params`).
[tests/route-csrf.test.ts](tests/route-csrf.test.ts) recorre `src/app/api/**` y falla si alguna se
salta el envoltorio; las exenciones (entradas sin sesión a la que atar el token: login, register,
verify, resend-verification, unlock, forgot-password, reset-password) están listadas ahí y
justificadas una a una. Añadir una ruta mutante sin envolver = test rojo, no revisión olvidada.

Convención de error de la API: `{ error: { code, message } }`, nunca stacks ni SQL
([src/server/http/api.ts](src/server/http/api.ts)). La autorización se hace **por construcción**
(cargar la fila y comparar con `user.userId`), y un recurso ajeno devuelve **404, no 403**, para no
revelar su existencia. La IP del rate-limit se lee **solo de `X-Real-IP`** (la fija Caddy) y se
guarda hasheada con HMAC. Roles y barreras (`requireUser`, `requireVerifiedUser`, `requireRole`) en
[src/server/auth/rbac.ts](src/server/auth/rbac.ts): el email verificado es la barrera antifraude
para cualquier acción con efectos.

### Cola de trabajos

Tabla `Job` + [worker](src/server/jobs/worker.ts) que sondea, reclama un lote con un UPDATE
atómico ([claimJobs](src/server/services/jobs.ts) — portable, sin `SKIP LOCKED`) y despacha al
handler del [registro](src/server/jobs/registry.ts). Cada tipo de job declara, junto a su handler,
su **política de reaper**: `FAIL` (no reencolar; efectos externos que no son idempotentes de
verdad, p.ej. SMTP) o `REQUEUE` (idempotentes de verdad). Los handlers **lanzan** en caso de fallo y
el runner decide backoff o `FAILED`. Todo handler nuevo debe ser idempotente y encolarse con
`idempotencyKey`.

El estado visible se **calcula, no se dispara**: si un reto está cerrado o qué Boost está arriba se
resuelve consultando `expiresAt`; el job solo consolida y limpia. Una ejecución perdida se recupera
sola en la siguiente.

### Dinero y puntos

[src/server/services/ledger.ts](src/server/services/ledger.ts) es el primitivo. Ledgers de **solo
inserción**, importes en **enteros (céntimos)**, `idempotencyKey` única, y el saldo denormalizado
del `User` se ajusta en la **misma transacción**, bloqueando **siempre primero** la fila del `User`
con `SELECT … FOR UPDATE` (orden de bloqueo fijo, para no fabricar deadlocks). Un descuadre de
saldo es un fallo crítico, no un bug menor.

### Vídeo

El vídeo vive **entero en Bunny.net**, nunca en nuestro servidor: subida por TUS con credencial
firmada de vida corta, reproducción con URL firmada, y una cadena de servicios de
confirmación/reconciliación (`video-confirmacion`, `video-reconciliacion`,
`reconciliacion-huerfanos`, `reconciliacion-publicados`) que cierra los huecos entre nuestra fila y
el objeto remoto. El borrado del dueño marca `REMOVED` y **encola** el borrado en Bunny en la misma
transacción (si no, el objeto quedaría huérfano para siempre: el barrido de huérfanos conserva los
`REMOVED` a propósito, son material de moderación).

### UI

Primitivas en [src/components/ui/](src/components/ui/), con la lógica pura extraída a
[logic.ts](src/components/ui/logic.ts) para poder atarla con tests (p.ej. la cuenta atrás pasa a
color de alarma por debajo de 24 h; el oro solo sale en el podio). Los colores se usan **por token
semántico** (`--df-money`, `--df-action`, `--df-time`, `--df-alarm`, `--df-rank`…), definidos en
[src/app/globals.css](src/app/globals.css) y expuestos en `/style-guide`. Mobile-first.

## Tests

Vitest en Node, pool `forks`, ficheros en `tests/*.test.ts`.

Además de los unitarios hay tests **estructurales**: no comprueban un resultado, fijan una DECISIÓN
que se puede deshacer en silencio (borrar un bloque de config, volver a escribir un literal, sacar
una ruta de su envoltorio). Casi todos nacieron de un fallo real en producción, así que **no se
borran para "limpiar"**:

- `route-csrf` — toda ruta mutante pasa por `mutatingRoute`.
- `noindex` — la cabecera `X-Robots-Tag` global de `next.config.ts`.
- `db-client-lazy` — Prisma no se construye al importar.
- `aislamiento-bd` — una BD por worker de vitest.
- `panel-guard` / `panel-reto-vista` — el admin protegido desde el layout, sin comprobar el rol a
  mano, y sin una sola cifra inventada en las tarjetas "próximamente".
- `db-pool` — margen del pool frente a `max_connections` y `acquireTimeout` por debajo del default
  del driver (si no, un pool agotado vuelve a leerse como un cuelgue).
- `caddy-sin-h3` — HTTP/3 sigue desactivado (el default de Caddy lo reactiva solo si se borra el
  bloque, y rompía el hard-refresh).
- `miniatura-nombre` — prohibido volver a fijar `thumbnail.jpg` al construir la URL del póster.
- `detalle-reto-vista` — la vista pública del reto no modera ni muta nada.
- `participaciones-lista` — la paginación no puede volver a `OFFSET`.

Al tocar uno de estos, la comprobación no es que pase en verde: es **romper el invariante a
propósito y confirmar que se pone rojo**.
