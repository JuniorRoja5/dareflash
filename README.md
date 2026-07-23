# DareFlash

Plataforma web (mobile-first) de **retos en vídeo corto con premios reales**: los usuarios
suben vídeos verticales participando en retos, la comunidad vota y los ganadores reciben
premios. Incluye puntos y niveles (DareUp), rankings, moderación con antifraude, promoción
de pago (Boost), suscripción VIP, retos de marca y duelos 1vs1.

> **Estado:** Fase 0 — andamiaje. Este README se completa en el Paso 12; por ahora recoge
> lo imprescindible para levantar el proyecto y las reglas operativas que **rompen el
> despliegue si se incumplen**.

---

## Requisitos

|                         |                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| **Node**                | La versión exacta está en [`.nvmrc`](.nvmrc). `engines` exige `>=22.13 <23`.                       |
| **Gestor de versiones** | [fnm](https://github.com/Schniz/fnm) (cambia de versión al entrar en la carpeta leyendo `.nvmrc`). |
| **Base de datos**       | MariaDB 11.8 (InnoDB), igual que producción. En local, vía `docker-compose.dev.yml`.               |
| **Docker**              | **Solo en local**, para MariaDB. Producción no usa Docker.                                         |

## Arranque local

```bash
cp .env.example .env     # y rellena los valores
npm ci                   # instalación reproducible (respeta package-lock.json)
npm run dev              # http://localhost:3000
```

### Scripts

| Script                            | Qué hace                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo.                                                             |
| `npm run build` / `npm start`     | Build de producción y arranque.                                                     |
| `npm run typecheck`               | `tsc --noEmit`.                                                                     |
| `npm run lint` / `npm run format` | ESLint / Prettier.                                                                  |
| `npm run test:build-sin-env`      | **Test de regresión**: el build debe compilar sin variables de entorno (ver abajo). |

---

## Variables de entorno

- La plantilla es [`.env.example`](.env.example). **`.env` nunca se commitea.**
- En producción viven en **hPanel** (Hostinger), nunca en el repositorio.
- Se validan con Zod en [`src/config/env.ts`](src/config/env.ts). **Nadie lee `process.env`
  fuera de ese archivo.**
- La validación falla en **arranque**, no en build: si falta una obligatoria, el proceso
  muere con un mensaje que dice cuál. Config rota = proceso muerto (mejor que servir
  peticiones mal configuradas).

### ⚠️ Regla de acceso a `env` (rompe el despliegue si se incumple)

`env` valida de forma **perezosa**, al leer una propiedad. Y `next build` **sí ejecuta
código de página** para prerenderizar. Además, **Hostinger compila sin ninguna variable
configurada**. Por tanto:

- ✅ **Sí**: leer `env` desde código de servidor que corre **por petición** — route
  handlers, server actions, funciones de servicio (`src/server/**`).
- ❌ **No**: leer `env` en **ámbito de módulo** de nada bajo `src/app/**`, ni en
  componentes o layouts que se prerendericen estáticamente. Se evaluaría durante el build
  → excepción → **despliegue caído**.

Si una página necesita configuración: o se accede dentro del ámbito de la petición, o se
marca la ruta como dinámica de forma explícita y consciente.

Lo vigila `npm run test:build-sin-env` (verificado: detecta una página que lee `env` en
ámbito de módulo).

### ⚠️ Promover una variable a obligatoria

**Toda variable que se marque como obligatoria en `src/config/env.ts` debe añadirse a
hPanel en el mismo paso, antes de hacer push.** Hostinger redespliega en cada push; si
falta, la app entra en **crash-loop**. Y un crash-loop repetido puede llevar a Hostinger a
suspender o limitar la aplicación.

---

## Base de datos y migraciones

- **En local**: `npx prisma migrate dev`.
- **En producción**: **solo** `npx prisma migrate deploy`. **Nunca `migrate dev`.**

  `migrate dev` necesita una _shadow database_ (crea y destruye una base de datos) y en
  hosting compartido **no hay permisos** para eso. En **local**, el usuario `dareflash`
  del contenedor necesita privilegio para crearla; concédelo una vez:
  `GRANT ALL PRIVILEGES ON *.* TO 'dareflash'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;`
  (solo desarrollo; en producción no aplica porque allí solo se usa `migrate deploy`).

- **Seed:** `npx prisma db seed` (configurado en `prisma.config.ts` → `tsx prisma/seed.ts`).
  Idempotente; inserta datos mínimos de desarrollo, incluidos emoji para verificar utf8mb4.

- Las migraciones son un **paso manual y explícito**. Nunca automáticas al arrancar la app.
- `DATABASE_URL` lleva un **`connection_limit` bajo y explícito** (empieza en 5), acorde al
  límite del plan compartido.
- El cliente Prisma es un **singleton** (patrón `globalThis`): sin eso, el hot-reload abre
  una conexión nueva en cada recarga y agota el pool.
- **Charset**: `utf8mb4` con collation `utf8mb4_unicode_ci`, en el contenedor y en la base
  de datos. No es opcional: nombres de usuario, títulos y categorías llevan emoji
  (🎭 Humor, 🏋️ Fitness); con `utf8mb3` o `latin1` se corrompen o revientan las inserciones.

---

## Despliegue

Producción es **Hostinger Business** (hosting compartido con Node.js), con build automático
en cada push a `main`. Consecuencias asumidas: sin PostgreSQL, sin Redis, sin Docker, sin
procesos permanentes y sin root.

### Cola de trabajos y cron

hPanel **no ofrece cron jobs** para aplicaciones Node. El disparador de la cola es un
**workflow programado de GitHub Actions** que llama a `POST /api/cron/run` con el
`CRON_SECRET` en cabecera. El diseño del endpoint no cambia: protegido por secreto,
idempotente y en lotes pequeños; solo cambia quién lo invoca.

> ⚠️ **Dos limitaciones que hay que vigilar:**
>
> 1. **GitHub desactiva los workflows programados en repositorios públicos tras 60 días sin
>    actividad.** Si el proyecto se queda quieto dos meses, los jobs dejan de ejecutarse
>    **en silencio**.
> 2. Los workflows programados **no garantizan puntualidad**: se retrasan bajo carga y
>    ocasionalmente se saltan ejecuciones. No son un cron de servidor.
>
> Por eso **todo se diseña calculado, no disparado**: el estado visible (qué Boost está
> arriba, si un reto está cerrado) se resuelve siempre por consulta sobre `expiresAt`, y el
> job solo consolida y limpia. Una ejecución perdida se recupera sola en la siguiente.
>
> Está previsto un **disparador redundante externo** (servicio de cron gratuito llamando al
> mismo endpoint). La idempotencia y el `SKIP LOCKED` garantizan que ambas fuentes puedan
> convivir.

---

## Prisma (base de datos)

- **Runtime sin binario nativo:** con Prisma 7 + driver adapter (`@prisma/adapter-mariadb`)
  el cliente usa el **queryCompiler en WASM**, no un motor de consultas nativo. Sirve
  peticiones en cualquier arquitectura sin compilar nada — clave en hosting compartido.
- **`postinstall` ejecuta `prisma generate`:** el cliente generado (`src/generated`) está
  gitignoreado y se regenera en cada `install`. ⚠️ **Esto depende de que el CLI de Prisma
  (devDependency) esté instalado.** Hoy funciona porque Hostinger instala también las
  `devDependencies`. **Si algún día cambia a `--omit=dev`, el build se romperá** (no
  encontrará `prisma`). En ese caso, mover `prisma` a `dependencies` o generar el cliente de
  otro modo.
- **Migraciones:** el motor de esquema (`schema-engine`) sí es un binario nativo, pero solo
  lo usa el **CLI de migraciones**, que corre por SSH en el servidor (Node 22.18 + `npx`
  bajan el binario de Linux). El runtime no lo toca.

## Notas de dependencias

- **`overrides` de `sharp`** a `^0.35.0`: Next aún fija `0.34.x`, con vulnerabilidades
  heredadas de libvips (GHSA-f88m-g3jw-g9cj). `sharp` corre en **producción** (optimización
  de imágenes). **Retirar el override cuando Next actualice su rango.**
- **`postcss` 8.4.31 anidado en Next**: vulnerabilidad moderada conocida y **aceptada**.
  Solo se ejecuta en build, procesando nuestro propio CSS, así que no es explotable aquí.
  No tiene arreglo limpio: `npm audit fix --force` degradaría Next a `9.3.3`. Se revisará
  cuando Next actualice su postcss interno.
