# DareFlash — Arquitectura y andamiaje — v3

**Rol de este documento:** especificación para el agente que construye el proyecto.
Fase actual: **Fase 0 — andamiaje**. Sigue los pasos **en orden**; cada uno tiene su
criterio de "hecho". **No construyas funcionalidades de producto todavía.**

**Alcance del proyecto: COMPLETO.** No es un MVP recortado. Se construye todo lo que
define el documento de producto (retos, votación, puntos y niveles, rankings, moderación,
Boost, VIP Mythic, monedero y premios, Brand Challenges y 1vs1). Lo que hay es un **orden
de construcción por fases** (sección 9), porque el software se entrega en capas, no de
golpe.

Principio rector: **sólido pero proporcionado.** Plataforma multiusuario con dinero real:
la integridad de datos y la seguridad no se negocian. Un solo desarrollador: nada de
microservicios, Kafka ni sobreingeniería.

> **Cambios v2 → v3:** el entorno de despliegue está **fijado y cerrado**: Hostinger
> Business (hosting compartido con soporte Node.js). Esto elimina PostgreSQL, Redis,
> Docker en producción y el proceso worker permanente. La arquitectura se ha rediseñado
> para funcionar **de forma nativa** en ese entorno, sin depender de terceros proveedores.
> Además, el alcance pasa de MVP a proyecto completo por fases.

---

## 0. Entorno de despliegue (CERRADO — no rediscutir)

**Producción: Hostinger Business (hosting compartido con Node.js).**

Lo que el entorno **sí** permite:

- Aplicaciones **Node.js / Next.js** (Next.js está soportado como framework de frontend
  y de backend). Despliegue por **integración con GitHub** (build automático en cada push).
- **MySQL** como base de datos, **en la misma infraestructura que la app**.
- **Cron jobs** desde hPanel.

Lo que el entorno **no** permite (verificado en la documentación de Hostinger):

- **PostgreSQL**: no disponible en planes Web/Cloud; requiere VPS.
- **Redis**: restringido en planes web y cloud; requiere VPS.
- **Docker en producción.**
- **Procesos permanentes en segundo plano** (un worker BullMQ 24/7).
- **Root / acceso al sistema.**

**Consecuencias arquitectónicas (decisiones tomadas):**

| Necesidad                 | Solución en este entorno                                                         |
| ------------------------- | -------------------------------------------------------------------------------- |
| Base de datos             | **MySQL 8 (InnoDB)** vía Prisma. Está **junto a la app**: latencia mínima.       |
| Sesiones                  | En base de datos (Auth.js con adaptador Prisma). No hace falta Redis.            |
| Rate limiting             | **Tabla en MySQL** con ventana fija. Ver sección 7.                              |
| Caché                     | Caché nativa de Next.js + CDN de Bunny. Sin capa extra al inicio.                |
| Trabajos en segundo plano | **Tabla `Job` en MySQL + cron** que invoca un endpoint protegido. Ver sección 8. |
| Vídeo                     | **Bunny.net**, subida directa cliente→Bunny. No toca nuestro servidor.           |
| Entorno local             | Docker **solo en local** (MySQL), opcional. Producción sin Docker.               |

**Por qué MySQL y no un Postgres externo (Neon/Supabase):** nuestro diseño de ledger hace
transacciones con bloqueo de fila (`SELECT ... FOR UPDATE`). Una base de datos en otro
proveedor obligaría a cruzar internet **dentro de cada transacción**, alargando el tiempo
que se mantiene el bloqueo. El MySQL de Hostinger está junto a la app. **InnoDB soporta
transacciones, `SELECT ... FOR UPDATE` y `SKIP LOCKED` (MySQL 8)**, que es todo lo que el
diseño necesita. Menos proveedores, menos latencia, menos cosas que se rompen.

**A verificar en hPanel antes de la Fase 1** (afecta al diseño, no al andamiaje):

1. **Intervalo mínimo de los cron jobs** (condiciona la precisión de la rotación de Boost).
2. **Límite de conexiones simultáneas de MySQL** (condiciona el pool de Prisma).
3. **Timeout de consultas** y límites de CPU/RAM del plan.
4. **Soporte de WebSockets** (afecta solo a la mensajería VIP, fase tardía; si no hay, se
   resuelve con _polling_).

---

## 1. Decisiones de arquitectura (no rediscutir)

- **Una sola app Next.js full-stack** (App Router) que sirve la web **y** la API
  (route handlers / server actions). **No** crear un Express/Nest aparte.
- **MySQL 8 (InnoDB)** con **Prisma** (`provider = "mysql"`).
- **Auth.js (NextAuth v5)** con adaptador Prisma, **sesiones en base de datos**
  (revocables), contraseñas con **Argon2id**, login Google + email. RBAC.
- **Zod** para validar **toda** entrada externa **y** las variables de entorno.
- **Bunny.net** para vídeo: el cliente sube **directo** a Bunny con token de corta duración
  generado en servidor. La app guarda solo `bunnyVideoId` + metadatos.
  **Nunca** pasar bytes de vídeo por el servidor de la app.
- **Stripe**: webhooks verificados por firma, procesamiento **idempotente**. Nunca confiar
  en el cliente para el estado de un pago.
- **Dinero y puntos = ledgers de solo-inserción.** Ver sección 6.
- **Cola de trabajos propia en base de datos**, disparada por cron. Ver sección 8.
- **Todo en UTC** en base de datos y lógica. La zona horaria solo al presentar.
  (Crítico: deadlines de retos, reinicio mensual del ranking, racha de 7 días, ventanas 1vs1.)
- **Una sola moneda** mientras no se decida otra cosa. El campo `currency` existe desde el
  día 1, pero no se mezclan monedas.

---

## 2. Estructura de carpetas objetivo

```
dareflash/
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/        # landing y páginas públicas
│  │  ├─ (auth)/             # login, registro, recuperar contraseña
│  │  ├─ (main)/             # zona logueada: feed, retos, ranking, perfil
│  │  ├─ admin/              # panel de moderación/administración
│  │  └─ api/
│  │     ├─ webhooks/        # stripe, bunny
│  │     └─ cron/            # disparadores de la cola (protegidos)
│  ├─ components/            # UI (mobile-first)
│  ├─ server/                # lógica de servidor (NO importable desde cliente)
│  │  ├─ services/           # dominio: challenges, voting, points, wallet, boost...
│  │  ├─ db/                 # cliente Prisma + repositorios
│  │  ├─ auth/               # Auth.js, RBAC
│  │  ├─ jobs/               # definición y ejecución de jobs
│  │  └─ security/           # rate-limit, headers, validación
│  ├─ lib/                   # utilidades + esquemas Zod compartidos
│  └─ config/                # env.ts (validado), constants.ts
├─ prisma/
│  ├─ schema.prisma
│  ├─ seed.ts
│  └─ migrations/
├─ tests/
├─ public/
├─ docker-compose.dev.yml    # SOLO local: mysql (opcional)
├─ .github/workflows/ci.yml
├─ .env.example
├─ .gitignore
├─ tsconfig.json
├─ README.md
└─ ARCHITECTURE.md           # copia de este documento
```

**Regla de oro de capas:** nada bajo `src/server/**` se importa desde componentes de
cliente. La lógica de dominio vive en `services/`, **no** en los route handlers (que solo
validan → llaman al servicio → formatean respuesta). Así es testeable y reutilizable
desde los jobs.

---

## 3. Stack

- **Base:** Node.js LTS, TypeScript `strict`, Next.js (App Router).
- **UI:** Tailwind CSS (mobile-first), componentes propios. Sin librerías pesadas al inicio.
- **Datos:** Prisma + MySQL 8.
- **Auth:** next-auth v5, @auth/prisma-adapter, argon2.
- **Validación:** zod.
- **Pagos/vídeo:** stripe (SDK oficial), cliente HTTP propio para la API de Bunny.
- **Observabilidad:** pino (logs estructurados), @sentry/nextjs.
- **Calidad:** eslint, prettier, husky, lint-staged, vitest.

**Prohibido en producción:** cualquier librería que asuma Redis, un proceso permanente,
acceso a disco persistente o Docker.

---

## 4. Pasos del andamiaje (Fase 0 — en orden)

### Paso 1 — Repositorio y app base

- `create-next-app`: TypeScript, App Router, ESLint, Tailwind, carpeta `src/`, alias `@/*`.
- Git inicializado. Rama `main`; trabajo en `feat/...`, `fix/...`.
- **Hecho cuando:** arranca en local y hay primer commit.

### Paso 2 — Higiene y calidad

- `.gitignore`: excluye `.env*` (salvo `.env.example`), `node_modules`, `.next`, builds.
- `.env.example` con TODAS las variables, **sin valores**. Ver sección 10.
- Prettier + ESLint configurados y de acuerdo entre sí.
- Husky + lint-staged: pre-commit ejecuta lint + format sobre lo staged.
- `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`.
- Conventional Commits (`feat:`, `fix:`, `chore:`).
- **Hecho cuando:** un commit con error de lint/tipos es rechazado por el hook.

### Paso 3 — Validación de entorno (fail-fast)

- `src/config/env.ts`: valida `process.env` con Zod, exporta objeto **tipado**.
  Si falta una variable obligatoria, la app **no arranca**.
- Nadie lee `process.env` directamente fuera de ese archivo.
- **Hecho cuando:** borrar una variable obligatoria impide el arranque con error claro.

### Paso 4 — Base de datos y esquema núcleo

- Prisma con `provider = "mysql"`. Configura `DATABASE_URL`.
- **Pool de conexiones pequeño y explícito** en la URL (`connection_limit`), acorde al
  límite del plan compartido. Nunca dejar el pool por defecto.
- Modelos (ver secciones 6, 7 y 8): User, Account, Session, VerificationToken, Video,
  Challenge, Submission, Vote, PointsLedger, WalletLedger, BoostPurchase, Report,
  AuditLog, Job, RateLimit.
- **Primera migración.**
- `prisma/seed.ts`: datos mínimos de desarrollo.
- **Hecho cuando:** la migración aplica limpia y `prisma studio` muestra las tablas.

### Paso 5 — Entorno local

- `docker-compose.dev.yml` con **solo MySQL** (opcional; alternativa: MySQL instalado
  en local). Producción **no** usa Docker.
- **Hecho cuando:** el proyecto arranca en local contra MySQL y `/health` responde.

### Paso 6 — Autenticación y autorización

- Auth.js + adaptador Prisma, **sesiones en base de datos**.
- **Argon2id** para contraseñas. Email/contraseña + Google OAuth.
- **Verificación de email obligatoria** antes de cualquier acción con efectos.
- Roles: `USER`, `MODERATOR`, `ADMIN`. Helper `requireRole()` server-side.
- **Edad mínima 16**: `birthDate` obligatorio en registro; bloquear menores de 16.
- **Bootstrap del primer admin**: por script CLI o semilla. **Nunca** por endpoint público
  ni por una variable que auto-promocione en cada arranque.
- Cookies de sesión: `httpOnly`, `secure`, `sameSite=lax`.
- **Toda** ruta protegida verifica **autenticación Y autorización**.
- **Hecho cuando:** un `USER` no puede entrar a `/admin` ni a sus endpoints (probado).

### Paso 7 — Línea base de seguridad

- **Cabeceras** en middleware: CSP, HSTS, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy, X-Frame-Options.
- **Rate limiting en MySQL** (sección 7), helper listo para: registro, login, recuperación
  de contraseña, voto y subida.
- **Validación Zod en cada boundary.**
- **Convención de errores de API**: forma única `{ error: { code, message } }`.
  Nunca stack traces, SQL ni detalles internos al cliente. Los errores completos van al log.
- **Logger pino** con `requestId` por petición. **Nunca** loguear contraseñas, tokens,
  cookies ni cabeceras de autorización.
- Endpoint `/health` (estado de la base de datos).
- **Hecho cuando:** las cabeceras salen en las respuestas y el rate-limit corta tras N intentos.

### Paso 8 — Cola de trabajos (tabla + cron)

- Implementa la cola descrita en la sección 8: tabla `Job`, `claimJobs()` con
  `FOR UPDATE SKIP LOCKED`, reintentos con backoff, y el endpoint
  `POST /api/cron/run` protegido por `CRON_SECRET`.
- Registra un **job de ejemplo** (p. ej. `noop` o `sendEmail`).
- **Hecho cuando:** encolar el job de ejemplo y llamar al endpoint lo procesa; llamarlo
  con secreto inválido devuelve 401; dos llamadas simultáneas **no** procesan el mismo job.

### Paso 9 — Stubs de Bunny y Stripe

- **Bunny:** servicio server-side que genera token/URL de subida de corta duración.
  Guardar solo `bunnyVideoId` + metadatos. Validar tipo y **duración máxima** del vídeo
  **en servidor** al recibir la confirmación (nunca fiarse del cliente).
- **Stripe:** webhook que **verifica la firma** y registra `event.id` procesado
  (idempotencia). Sin lógica de negocio aún, solo el esqueleto seguro.
  Ojo: el webhook necesita el **cuerpo crudo** de la petición para validar la firma.
- **Hecho cuando:** el webhook rechaza firma inválida y acepta válida (modo test).

### Paso 10 — Pruebas mínimas

- Vitest configurado.
- **Al menos dos tests reales del ledger**: (a) operaciones concurrentes sobre el mismo
  usuario no descuadran el saldo; (b) la misma `idempotencyKey` no duplica el movimiento.
- **Un test de la cola**: dos ejecuciones simultáneas no cogen el mismo job.
- **Hecho cuando:** `npm test` pasa y los tests fallan si se rompe el bloqueo.

### Paso 11 — Integración continua

- GitHub Actions: en cada push/PR → `typecheck`, `lint`, `test`, `build`.
- **Hecho cuando:** un PR que rompe tipos o lint sale en rojo automáticamente.

### Paso 12 — Despliegue y documentación

- Conectar el repositorio a Hostinger (integración GitHub, build automático).
- Variables de entorno de producción configuradas en hPanel, **nunca** en el repo.
- **Migraciones: paso manual y explícito** (`prisma migrate deploy`). **Nunca** automáticas
  en el arranque de la app.
- Cron en hPanel llamando a `POST /api/cron/run` con la cabecera `CRON_SECRET`.
- `README.md`: requisitos, `.env`, arranque local, migraciones, despliegue.
- `ARCHITECTURE.md`: copia de este documento.
- **Hecho cuando:** un push a `main` despliega y `/health` responde en producción.

---

## 5. Cumplimiento y datos personales (no es opcional)

- **Edad mínima 16** (o la legal del país). Guardar `birthDate`, validar en registro.
- **Borrado de cuenta**: **soft delete** + anonimización. Los ledgers **no se borran**
  (son registro contable): se desvinculan del usuario.
- **Exportación de datos** (RGPD): el modelo debe permitirla.
- **IPs y datos de antifraude son datos personales**: guardar solo lo necesario, con
  **política de retención** (p. ej. 90 días) y un job de purga.
- **Consentimiento de cookies** previsto desde el diseño.
- **Copias de seguridad**: verificar qué incluye el plan y **exportar la base de datos
  fuera de Hostinger de forma periódica**. Hay dinero de por medio: una única copia en el
  mismo proveedor no es una copia de seguridad.

---

## 6. Integridad de datos: dinero y puntos (CRÍTICO)

**No** uses una columna `saldo` actualizada con `UPDATE` (condiciones de carrera + sin
auditoría). Usa **libros mayores de solo-inserción**:

- **Dinero**: **enteros (céntimos)** + `currency char(3)`. **Nunca** coma flotante.
  Encaja con Stripe, que también trabaja en céntimos.
- **Puntos**: entero.
- Cada cambio = **una fila nueva**. Nunca se edita ni se borra.
- El saldo se actualiza en la fila del usuario **dentro de la misma transacción** que la
  inserción, bloqueando con `SELECT ... FOR UPDATE`. Un job periódico reconcilia
  `saldo == suma(ledger)` y alerta si no cuadra.
- Toda operación de dinero/puntos lleva **clave de idempotencia** única.
- **Puntos y dinero son ledgers separados y no se convierten entre sí.** Decisión de
  producto y de exposición legal: los puntos no son dinero. **Esto se respeta también en
  los retos 1vs1: se apuestan puntos, nunca dinero.**

```prisma
model PointsLedger {
  id             String   @id @default(cuid())
  userId         String
  delta          Int                      // +/- puntos
  reason         String                   // WIN_CHALLENGE, INVITE_FRIEND, TOP20...
  refType        String?
  refId          String?
  idempotencyKey String   @unique
  createdAt      DateTime @default(now())
  @@index([userId])
}

model WalletLedger {
  id             String   @id @default(cuid())
  userId         String
  amountCents    Int                      // +/- en céntimos
  currency       String   @db.Char(3)
  entryType      String                   // CREDIT, DEBIT
  status         String   @default("COMPLETED") // PENDING, APPROVED, PAID...
  idempotencyKey String   @unique
  refType        String?
  refId          String?
  createdAt      DateTime @default(now())
  @@index([userId])
}

model AuditLog {                           // admin, payouts, moderación, ajustes
  id         String   @id @default(cuid())
  actorId    String?
  action     String
  targetType String?
  targetId   String?
  metadata   Json?
  createdAt  DateTime @default(now())
  @@index([actorId])
  @@index([targetType, targetId])
}

model Vote {                               // antifraude estructural
  id           String   @id @default(cuid())
  userId       String
  submissionId String
  createdAt    DateTime @default(now())
  @@unique([userId, submissionId])
  @@index([submissionId])
}
```

**Estados de moderación** (`Video`/`Submission`): `PENDING`, `PUBLISHED`, `REJECTED`,
`REMOVED`. Nunca borrado físico de contenido denunciado (se necesita para auditoría).

**Retiradas de premio:** se crean como `WalletLedger` en `PENDING`/`APPROVED` y un
**admin las aprueba manualmente** antes de pagar. **Sin pagos automáticos al usuario.**

---

## 7. Rate limiting sin Redis

Ventana fija en MySQL. Sencillo, suficiente y sin proveedores extra.

```prisma
model RateLimit {
  id          String   @id @default(cuid())
  key         String                       // "login:ip:<hash>", "vote:user:<id>"
  windowStart DateTime
  count       Int      @default(0)
  @@unique([key, windowStart])
  @@index([windowStart])
}
```

- Se incrementa con un `INSERT ... ON DUPLICATE KEY UPDATE count = count + 1` (atómico).
- La ventana se calcula truncando el tiempo actual al tamaño de ventana.
- Un job periódico purga ventanas antiguas.
- **No** guardar la IP en claro si solo se necesita contar: usar hash (ver sección 5).

---

## 8. Cola de trabajos sin Redis ni worker permanente

**Patrón:** tabla `Job` + cron de hPanel que llama a un endpoint protegido.

```prisma
model Job {
  id             String    @id @default(cuid())
  type           String                     // BOOST_EXPIRY, RANKING_RESET, SEND_EMAIL...
  payload        Json?
  status         String    @default("PENDING")  // PENDING, RUNNING, DONE, FAILED
  runAt          DateTime                   // cuándo debe ejecutarse (UTC)
  attempts       Int       @default(0)
  maxAttempts    Int       @default(5)
  lockedAt       DateTime?
  lastError      String?   @db.Text
  idempotencyKey String?   @unique
  createdAt      DateTime  @default(now())
  @@index([status, runAt])
}
```

Reglas:

- `POST /api/cron/run` protegido por cabecera con `CRON_SECRET`. Devuelve 401 si no cuadra.
- El endpoint coge un lote con
  `SELECT ... WHERE status='PENDING' AND runAt <= NOW() ORDER BY runAt LIMIT n FOR UPDATE SKIP LOCKED`
  y los marca `RUNNING` **en la misma transacción**. `SKIP LOCKED` evita que dos
  ejecuciones simultáneas cojan el mismo job.
- **Todos los handlers deben ser idempotentes**: el cron puede solaparse o repetirse.
- Reintentos con backoff exponencial hasta `maxAttempts`; luego `FAILED` + alerta.
- Jobs recurrentes (reinicio de ranking, purga) se reencolan al terminar.
- **Timeout**: respeta el límite de tiempo del plan. Lotes pequeños y ejecución frecuente
  es mejor que lotes largos.
- Jobs previstos: `BOOST_EXPIRY`, `CHALLENGE_CLOSE`, `RANKING_RESET`, `SEND_EMAIL`,
  `LEDGER_RECONCILE`, `RETENTION_PURGE`, `PAYOUT_PROCESS`.

**Limitación conocida y aceptada:** la precisión de los jobs depende del intervalo mínimo
del cron. Por eso, todo lo sensible al tiempo se diseña **calculado, no disparado**: el
puesto destacado del Boost se determina por consulta (`ORDER BY` sobre boosts activos con
su `expiresAt`) y el cron solo limpia. Así, aunque el cron se retrase, la web siempre
muestra el estado correcto. **Aplica el mismo principio al cierre de retos y al ranking.**

---

## 9. Orden de construcción (proyecto completo)

Todo se construye. Esto es el **orden**, no un recorte.

| Fase   | Contenido                                                                |
| ------ | ------------------------------------------------------------------------ |
| **0**  | Andamiaje (este documento).                                              |
| **1**  | Auth, perfiles, subida de vídeo a Bunny, feed/Explore, búsqueda.         |
| **2**  | Challenges: crear, participar, deadline, categorías.                     |
| **3**  | Votación + antifraude (verificación, límites, detección, consecuencias). |
| **4**  | Puntos y niveles (DareUp) + insignias + TopRanking (mensual y Top 20).   |
| **5**  | Moderación: denuncias, estados, panel de administración.                 |
| **6**  | Pagos con Stripe + **Boost** (rotación, tope diario, paquetes).          |
| **7**  | Monedero, premios y retiradas con aprobación manual.                     |
| **8**  | **VIP Mythic**: suscripción y beneficios.                                |
| **9**  | **Brand Challenges**: panel de empresa, comisión 25%.                    |
| **10** | **Retos 1vs1**: reto, aceptación, bloqueo de puntos, resolución.         |
| **11** | Multiidioma, PWA, pulido de UI/UX, rendimiento.                          |

Reglas de fase:

- Una fase no empieza hasta que la anterior está **probada y desplegada**.
- Cada fase que toque dinero o puntos pasa por los ledgers de la sección 6. Sin excepción.
- Las funciones dependientes de decisiones del propietario (puntos por acción, duración de
  vídeo, categorías, idiomas) leen de `src/config/constants.ts`.

---

## 10. Variables de entorno (`.env.example`)

```bash
# App
NODE_ENV=development
APP_URL=http://localhost:3000

# Base de datos (MySQL)
DATABASE_URL="mysql://user:password@localhost:3306/dareflash?connection_limit=5"

# Auth
AUTH_SECRET=                 # openssl rand -base64 32
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Bunny.net
BUNNY_STREAM_LIBRARY_ID=
BUNNY_STREAM_API_KEY=
BUNNY_CDN_HOSTNAME=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Email (transaccional)
EMAIL_FROM=
EMAIL_API_KEY=

# Cola de trabajos
CRON_SECRET=                 # openssl rand -base64 32

# Observabilidad
SENTRY_DSN=
```

`.env.example` se commitea (sin valores). `.env` **jamás**. En producción, las variables
viven en hPanel. Claves únicas por entorno; rotar si se filtran.

---

## 11. Qué NO hacer

- **Nunca** una librería que requiera Redis, Docker en producción o un proceso permanente.
- **Nunca** dinero en coma flotante.
- **Nunca** un saldo actualizado con `UPDATE` directo.
- **Nunca** confiar en el cliente (duración de vídeo, importes, estado de pago).
- **Nunca** secretos en el repositorio.
- **Nunca** migraciones automáticas al arrancar la app.
- **No inventar reglas de producto** (puntos por acción, duración de vídeo, categorías,
  idiomas): están **pendientes de decisión del propietario**. Van a
  `src/config/constants.ts` con un comentario `// PENDIENTE`, nunca esparcidas por el código.
- No optimizar para escala masiva antes de tiempo. Si el plan compartido se queda corto, la
  vía de salida es migrar a VPS: **por eso nada se ata a algo propietario de Hostinger y el
  entorno local se mantiene en Docker.**
