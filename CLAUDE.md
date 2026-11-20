# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## El producto se llama RevolFlash

Dominio `revolflash.com` (Fase 11 · PM2). Lo que ve una persona sale de
[src/config/marca.ts](src/config/marca.ts). **Los nombres INTERNOS siguen siendo `dareflash`** y no se
renombran: el repositorio, las imágenes de Docker (`dareflash-web`…), la base de datos y sus usuarios,
los volúmenes, `~/dareflash-config` y las reglas de gitleaks. No es un descuido: renombrarlos no lo ve
nadie y rompería el despliegue; el repositorio pasará a privado al terminar la plataforma.

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

### Entorno de desarrollo y tests

**Cero contraseñas escritas en el repositorio, ni de desarrollo** (es público, y un escáner externo no
distingue una clave de juguete). Todas viven en tu `.env` local, que no se versiona; la plantilla es
[.env.example](.env.example):

- `DEV_MARIADB_ROOT_PASSWORD` y `DEV_MARIADB_PASSWORD`: las lee `docker-compose.dev.yml` (si faltan,
  compose se para y dice cuál). MariaDB solo las aplica al CREAR el volumen: con uno existente, pon
  las que tenía.
- `DATABASE_URL`: la de la app, con esa clave.
- `TEST_DATABASE_URL`: la de los tests, **obligatoria y sin valor por defecto**. `vitest.config.ts`
  carga del `.env` **solo** las `TEST_*` (cargarlo entero cambiaría los tests que prueban qué pasa
  cuando falta una variable). Sin ella, los tests de BD fallan con un mensaje que dice qué poner.
  En CI la fija el workflow, contra un MariaDB del runner sin contraseña.

**Ningún valor con forma de credencial se ESCRIBE, tampoco en un test**: la regla es cero alertas,
también de escáneres externos (GitGuardian), y un escáner no sabe que una contraseña es de mentira.
Un test que necesita una contraseña, un secreto, un token o una clave la pide a
[tests/helpers/valores-falsos.ts](tests/helpers/valores-falsos.ts): `falso("etiqueta")` /
`contrasenaFalsa("etiqueta")`, deterministas (misma etiqueta, mismo valor: sirve para registrar y
luego entrar, o firmar y verificar). Prohibidos los prefijos de proveedores (`whsec_`, `sk_test_`…).
Dentro de un `vi.hoisted` o de una factoría de `vi.mock` el helper se carga con `await import(...)`
(corren antes que los imports).

El escáner de secretos ([.gitleaks.toml](.gitleaks.toml), gitleaks v8.30.1 en Docker) corre en el
**pre-commit** sobre lo que se va a confirmar y en **CI antes de los tests** sobre el árbol entero:
`bash scripts/escanear-secretos.sh preparado|arbol`. Sus reglas propias son MÁS estrictas que las de
un escáner genérico (no piden entropía). Un hallazgo para el commit o el CI; la lista blanca es solo
lo que no se puede evitar (material de terceros, hashes de `package-lock`), justificado en el `.toml`.

Base de datos en local: `npx prisma migrate dev`, `npx prisma db seed`. `postinstall` ejecuta
`prisma generate` (el cliente vive en `src/generated/`, gitignoreado).

**La operación no está en el repositorio.** El runbook de producción (despliegue, migraciones en
el servidor, correo, copias, credenciales) vive **fuera**, y ahí se queda mientras el repositorio
sea público: describe cómo entrar y qué hay dentro. Si necesitas un dato de infraestructura para
una tarea, **pídelo** en vez de deducirlo o de volver a escribirlo aquí. Lo mismo con las
auditorías de seguridad: `/security/audits/` está en `.gitignore` a propósito — un hallazgo
abierto documentado en público es un mapa para quien ataque.

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
[imagenes.yml](.github/workflows/imagenes.yml) pasa los tests y construye las imágenes reales (las
que respetan `.dockerignore`) en cada push, y en `main` las publica en ghcr.io. **El servidor no
compila**: [scripts/deploy.sh](scripts/deploy.sh) descarga la imagen del SHA, comprueba que el
health responde con ese commit y que el worker late con él, y valida y recarga el Caddyfile de ese
commit dentro del contenedor de Caddy. Una imagen se publica PÚBLICA: nada secreto puede entrar en el build.

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

**Los agregados se materializan.** `RankingMensual.victorias` y `User.victoriasTotales` son cachés
de `ChallengeResult`, no la verdad. Existen porque un `COUNT` **no se puede paginar por keyset** (el
porqué, largo, está en el docblock de `RankingMensual`). Los dos se escriben con el **valor absoluto
recontado** dentro de la misma transacción que crea los resultados, nunca con `increment`: así
re-ejecutar un cierre converge. Un cache nuevo de este tipo se rellena **en su migración** —uno que
arranca a cero miente sin que nada falle—.

### Concurrencia: el error 1020 no se silencia, se reintenta

MariaDB 11.6 estrenó **`innodb_snapshot_isolation`** y en la **11.8** —la de producción— viene
**activado**. Con él, una transacción en `REPEATABLE READ` que intenta escribir una fila cambiada
**después de su instantánea** ya no lee en silencio una versión vieja: falla con el **error 1020**
("Record has changed since last read") y te dice que reintentes. Es una mejora —antes esa misma
situación era una anomalía silenciosa de las que se descubren con el saldo descuadrado— pero
cambia el contrato: **cualquier escritura concurrente puede devolver 1020**, y la respuesta correcta
es **reintentar la transacción**, nunca tragarse el error ni envolverlo en un mensaje genérico.

Reintentar solo es seguro si la operación es **idempotente** (clave de idempotencia, como todo lo que
toca un ledger) y si la transacción fallida **se deshizo entera**. El ejemplo cableado está en
[activarBoost](src/server/services/boost-activacion.ts): bucle acotado, espera creciente de unos
milisegundos y, si se agotan los intentos, el error **sube** —un fallo que se traga es peor que uno
que se ve—.

Dos trampas relacionadas, las dos descubiertas construyendo el cupo de Boost y las dos capaces de
pasar una revisión de código:

- **Un `SELECT` normal dentro de la transacción devuelve la instantánea**, no el presente. Serializar
  con un cerrojo y después CONTAR con un `findMany` no sirve: la instantánea se fijó antes de esperar
  al cerrojo, así que al entrar lees el mundo de antes de esperar. Un `UPDATE` sí lee la última
  versión confirmada, y por eso un cupo se **ocupa** (`UPDATE … LIMIT 1`, filas afectadas = 0 es el
  lleno) en vez de comprobarse.
- **Una lectura bloqueante de un rango tampoco salva**: si esas filas cambiaron tras la instantánea,
  devuelve 1020 en vez de esperar.

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

[MARCA.md](MARCA.md) traduce la marca a reglas comprobables: qué trabajo tiene cada token, los cuatro
ficheros donde un hex está duplicado **porque el token no llega** (correo, favicon, `theme-color`,
guía de estilo) y los mínimos medidos —contraste WCAG y ΔE— que cualquier paleta tiene que cumplir
para entrar. Un color no se revisa a ojo y un comentario nombra el token, nunca el color ("el botón
de `--df-action`", no "el botón magenta": lo segundo caduca con el siguiente repintado).

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
- `paginacion-pila` — cómo se va HACIA ATRÁS en un keyset sin inventar un `OFFSET`: la pila de
  cursores ya vistos viaja en la URL ([src/lib/paginacion-pila.ts](src/lib/paginacion-pila.ts),
  pura y reutilizable). Volver cuesta lo mismo que ir. Si otra lista necesita "Anterior", es ahí.
- `navegacion-dura` — login y logout navegan en DURO (`navegarDuro`), nunca con `router.push`: el
  router de cliente guarda lo pre-cargado como invitado y devolvía al logueado al login.
- `proxy-gate` — con cookie, `/crear` pasa; sin ella, a `/entrar?siguiente=`; y `/entrar` nunca pasa
  por el proxy (el redirect del login tiene que terminar).
- `cta-principal` — "Crear reto" es solo del admin: el CTA sale de `ctaPrincipal` y nadie fuera del
  panel escribe el literal ni enlaza a `/crear` a mano.
- `panel-roles` / `panel-guard-paginas` — cada página del panel exige el rol de SU sección, y cada
  guard se ejecuta de verdad (un `requireSeccion` sin `await` renderiza igual: el texto no lo ve).
- `panel-usuarios-vista` — hay UN solo buscador de usuarios (el del panel es el mismo motor con un
  parámetro); el email no se pinta en la lista y su única puerta es la que escribe el `AuditLog`; el
  moderador no ve ni el ajuste de puntos ni el ledger; y los índices de los órdenes siguen ahí.
- `paleta-oscura` / `paleta-clara` / `paleta-niveles` — la paleta MEDIDA (contraste WCAG + ΔE), tema
  por tema: un valor que junta dos significados no entra. El par del CTA sólido se lee de
  `botonTokens`, no se supone.
- `marca-hex-duplicados` — los cuatro ficheros donde un hex está escrito a mano porque el token no
  llega (correo, favicon, `theme-color`, guía) siguen el valor del token, y **no hay un quinto**. Sin
  esto, un repintado deja los correos con el color anterior y no falla nada.
- `marca-v3-firmada` — los valores de marca **firmados**, clavados con cifras escritas (no leyendo el
  token, que estaría siempre verde), el contraste del CTA sobre el verde, y que no sobreviva ningún
  magenta ni morado. Los de paleta miden cualquier paleta; este clava la que hay.
- `imagenes-ci` — sin tests verdes no hay imagen (el job que publica depende de `tests` y nada lo
  salta), publicar es solo de `main` y después de revisar la imagen, y cada imagen sale de SU etapa en
  CI, en el compose de producción y en el de emergencia.
- `fuentes-locales` — ninguna fuente de Google: los mismos nueve `.woff2` en `src/app/fuentes` con su
  `unicode-range`, los respaldos con las métricas de antes, y el build del Dockerfile **sin red**.
- `portada-3d-movimiento` — las imágenes 3D de la portada (por tema, ≤ 80 KB, color desde los tokens,
  originales fuera del repo) y el movimiento: la inclinación solo con puntero fino, el rayo parado con
  reduced-motion de forma explícita (atado al scroll, la regla global no lo para), Save-Data lo apaga
  todo y la profundidad es luminosidad, no sombra.
- `deploy-script` — `deploy.sh` ejecutado de verdad con `docker`/`git`/`curl` falsos: no despliega si
  CI falló o no ha terminado, se para si el health responde con otro commit, y volver atrás con
  migraciones posteriores exige `--acepto-esquema-nuevo`. Y no da por bueno un despliegue sin WORKER:
  espera a su LATIDO en el health (`worker: { commit, haceS, vivoS }`, de
  [src/server/services/latido-worker.ts](src/server/services/latido-worker.ts)) del SHA desplegado,
  reciente y con el proceso vivo un rato (uno en bucle de reinicios late y muere). Un commit que NO
  sabe latir (su `scripts/worker.ts` no llama a `anotarLatido(`: anterior a esta vigilancia) no se
  espera: AVISA y sigue, para que volver atrás en una emergencia no se pare con todo sano. La marca se
  busca SIN tubería (`git show | grep -q` con `pipefail` caía por SIGPIPE en «no sabe latir» con un
  fichero grande), y un fallo de `git` es error 8, no aviso. `health` fija la
  forma del cuerpo; `redis-listo`, que el worker espera a Redis antes de su primera pasada y que su
  `bucleWorker` recibe `latido` (opcional: quitarlo compila); `sanear-error`, que el log dice la
  clase del fallo y nunca el mensaje. Y al final, CADDY: el Caddyfile DEL SHA desplegado (también al
  volver atrás) se valida dentro de su contenedor y solo entonces se recarga; si no valida, error
  sin recargar; si el reload falla, error. Caddy no relee el fichero montado: sin esto, un Caddyfile
  nuevo no se servía hasta un `caddy reload` a mano. Y si el Caddyfile servido no es el del disco (una
  vuelta atrás), AVISA: un reinicio del contenedor de Caddy cargaría el del disco.

- `zod-fuera-del-cliente` — ningún `"use client"` llega a zod por ninguna cadena de imports (el fallo
  la nombra). Un catálogo es una lista `VALORES_*` en `constants.ts`; su `z.enum` vive en
  [src/config/esquemas.ts](src/config/esquemas.ts), solo para el servidor, construido con esa lista; el
  cliente pregunta con `esUnoDe` ([src/lib/valores.ts](src/lib/valores.ts)). Un esquema en
  `constants.ts` devolvía ~64 KB gzip a TODAS las páginas.
- `hls-light` — el reproductor pide `hls.js/light` (no el completo: ~62 KB gzip más en `/feed`) y solo
  por `import()` bajo demanda; ningún cliente lo arrastra por un import estático; y el orden sigue
  siendo hls.js PRIMERO y el HLS nativo como último recurso: el token de Bunny va en la query y el
  nativo no lo propaga a los segmentos (rutas relativas) → 403 en Safari/iOS si se invierte.
- `sin-cripto` — el cobro es SOLO al banco: `VALORES_METODO_RETIRADA = ["BANK"]`, ningún texto de
  `src/` (sin comentarios) nombra la cripto, `RED_INCORRECTA` no es un motivo, las dos rutas de
  métodos rechazan `"CRYPTO"` con una frase humana, y la migración `quitar_red_cripto` se niega
  (`SIGNAL`) antes de cualquier `DROP` si queda una fila que no es `BANK`.
- `webhooks-por-tipo` — Stripe manda a CADA endpoint todos los eventos de su tipo, sean de la compra
  que sean: cada pago lleva su `tipo` en la metadata (`conTipo`, en sesión y en suscripción) y cada
  webhook descarta en silencio lo ajeno (200, sin log). Sin tipo, o con uno fuera del catálogo, no es
  de nadie: `tipoDePago` NO deduce nada de la forma (eso era la convención que se retiró).
- `marca-un-sitio` / `render/marca-cambiada` — la marca se escribe UNA vez, en
  [src/config/marca.ts](src/config/marca.ts): la marca actual (en ninguna forma) no se escribe en el
  código de `src/` fuera de ahí y de las excepciones declaradas (favicon, nombres internos de fuente,
  el ejemplo del dominio en `env.ts`), y las ANTERIORES no aparecen en `src/` ni en un comentario,
  salvo en la lista que las veta; los títulos salen de `TITULO_RAIZ`. Con la marca cambiada en un test, título, correo y
  logo la siguen, y la vieja sigue vetada como contraseña y como @usuario (`MARCAS_ANTERIORES`). El
  dominio NO tiene constante: vive en la configuración (`APP_URL`, `EMAIL_FROM`).
- `argon2-antes-de-mirar` — registrarse con un correo que ya existe no se distingue de hacerlo con uno
  nuevo: en `registerUser` y en `altaEmpresaDesdeCero`, el hash de la contraseña se llama EXACTAMENTE
  una vez y ANTES de la primera operación sobre `User` o de cualquier consulta EN CRUDO, con correo
  nuevo y con existente. SIN RELOJ (espía sobre el `hashPassword` real + extensión de Prisma a nivel de
  cliente que apunta el orden, también `$queryRaw`). Los tests de tiempo (`registration`,
  `registro-cuenta-existente`) son la SEGUNDA red y miden con
  [tests/helpers/tiempo-argon2.ts](tests/helpers/tiempo-argon2.ts) lo que AÑADE EL HASH a la separación
  entre caminos (`excesoDelHash`: misma ejecución con el hash real y con uno instantáneo), contra H/2:
  nada de `retry`, `skip` ni umbral subido a ojo. **DECISIÓN (analista, 19 nov 2026):** la diferencia
  de trabajo de BASE DE DATOS entre correo nuevo y existente es un RIESGO RESIDUAL ACEPTADO (pequeña
  frente al argon2, con límite de intentos por IP, e igualarla exigiría trabajo falso). Medida sin
  carga: ~7 ms en el registro y ~10 ms en el alta de empresa, frente a ~72 ms de argon2. Si crece, se
  revisa.
- `reloj-adelantado` (+ el job de CI `tests-reloj-adelantado`) — la suite entera corre OTRA vez con
  el reloj de Node adelantado 400 días ([scripts/ci-tests-reloj-adelantado.sh](scripts/ci-tests-reloj-adelantado.sh),
  libfaketime) y las imágenes dependen de ese job. Un test con fechas fijas que llama a un servicio
  sin `ahora` cae HOY, no el día que el calendario lo alcanza (así cayó `empresa-retos` el
  2026-11-15, en todas las ramas). Arreglo: pasar `ahora`, o `congelarReloj(AHORA)`. MariaDB no se
  adelanta: sembrar con la hora de Node y preguntar con `NOW()` también cae.
- `reloj-rate-limit` — todo test que lleva una ruta real hasta el 429 congela el reloj
  (`congelarReloj()` de [tests/helpers/reloj.ts](tests/helpers/reloj.ts)). Ver la trampa de abajo.

**Trampa: un test que depende de la HORA en que corre.** El rate-limit (y cualquier clave «por día»)
es una ventana fija alineada al reloj. Un test que llena un cubo real con N llamadas y espera el 429
en la N+1 falla si entre ellas cae un borde (`:00` de minuto, de hora, medianoche UTC): la última abre
una ventana vacía. Pasó en CI de main con el mismo SHA que había salido verde en la rama y en local.
Ni el entorno ni el código eran distintos; solo el segundo. Por eso un verde local no lo descarta, y
repetir la suite tampoco: se congela el reloj. CI corre exactamente `npm ci`, `npm run typecheck`,
`npm run lint` y `npx vitest run` contra un MariaDB sin contraseña; reproducirlo en local es lanzar
esos mismos cuatro. Y, en paralelo, `npx vitest run` otra vez con el reloj adelantado 400 días (solo
Linux: en Windows, dentro de un contenedor `node` con el paquete `faketime`).

Al tocar uno de estos, la comprobación no es que pase en verde: es **romper el invariante a
propósito y confirmar que se pone rojo**.
