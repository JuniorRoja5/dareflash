# DareFlash

Plataforma web _mobile-first_ de retos en vídeo corto.

Proyecto privado. Este README recoge **solo lo necesario para trabajar en el código**; la
operación (despliegue, infraestructura, correo, copias) se documenta aparte y fuera del
repositorio.

---

## Requisitos

|            |                                                                              |
| ---------- | ---------------------------------------------------------------------------- |
| **Node**   | La versión exacta está en [`.nvmrc`](.nvmrc); `engines` exige `>=22.13 <23`. |
| **Docker** | Para levantar la base de datos de desarrollo.                                |
| **Base**   | MariaDB 11.8 (InnoDB), la misma versión en local y en producción.            |

## Arranque local

```bash
cp .env.example .env     # y rellena los valores
docker compose -f docker-compose.dev.yml up -d
npm ci
npx prisma migrate dev
npm run dev              # http://localhost:3000
```

### Scripts

| Script                            | Qué hace                                                                |
| --------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo.                                                 |
| `npm run build` / `npm start`     | Build de producción y arranque.                                         |
| `npm run worker`                  | Runner de la cola de trabajos (proceso permanente).                     |
| `npm run typecheck`               | `tsc --noEmit` del código y de los tests.                               |
| `npm run lint` / `npm run format` | ESLint / Prettier.                                                      |
| `npm test`                        | Vitest. **Necesita la base de datos levantada.**                        |
| `npm run test:build-sin-env`      | Regresión: el build debe compilar sin variables de entorno (ver abajo). |

---

## Reglas que rompen el despliegue

Producción y CI ejecutan **`next build` sin ninguna variable de entorno**. De ahí dos reglas
que no son estilo, sino condición para que el despliegue no se caiga:

**1. Nadie lee `process.env` fuera de [`src/config/env.ts`](src/config/env.ts).** Se importa el
objeto `env`, tipado y validado con Zod.

**2. `env` valida de forma perezosa, al leer una propiedad.** Se puede leer desde código que
corre _por petición_ (route handlers, server actions, `src/server/**`). Está **prohibido**
leerlo en ámbito de módulo de cualquier cosa bajo `src/app/**`, o en componentes que se
prerendericen: se evaluaría durante el build y tumbaría el despliegue.

`prisma` ([`src/server/db/client.ts`](src/server/db/client.ts)) sigue el mismo patrón: singleton
construido perezosamente. Lo vigila `npm run test:build-sin-env`.

Promover una variable a **obligatoria** en `env.ts` obliga a añadirla al entorno del servidor
**en el mismo paso**: si falta, el proceso muere al arrancar (_fail-fast_ deliberado).

---

## Base de datos

- Migraciones en local: `npx prisma migrate dev`. Datos de ejemplo: `npx prisma db seed`.
- `postinstall` ejecuta `prisma generate`; el cliente vive en `src/generated/` (ignorado por git).
- Las migraciones son un **paso manual y explícito**, nunca automáticas al arrancar la app.
- **Charset `utf8mb4`** con collation `utf8mb4_unicode_ci`, en el contenedor y en la base. No es
  opcional: títulos y categorías llevan emoji, y con `utf8mb3` o `latin1` se corrompen.

---

## Tests

Vitest sobre Node, con **una base de datos por worker** (las crea y migra el `globalSetup`).

Además de los unitarios hay tests **estructurales**: no comprueban un resultado, fijan una
decisión que se podría deshacer en silencio. Casi todos nacieron de un fallo real, así que **no
se borran para "limpiar"**. Al tocar uno, la comprobación no es que pase en verde: es romper el
invariante a propósito y confirmar que se pone rojo.

Hooks de husky: **pre-commit** = lint-staged + typecheck; **pre-push** = build sin variables;
**commit-msg** = Conventional Commits.

---

## Arquitectura, en dos líneas

Next.js (App Router) + React + Prisma sobre MariaDB. `src/lib/` es lógica pura y testeable;
`src/server/` es todo lo que toca base de datos o red; `src/app/` son las pantallas y los
endpoints. Toda ruta que muta estado pasa por un envoltorio que comprueba origen, sesión y CSRF
— hay un test que recorre las rutas y falla si alguna se lo salta.

El detalle de convenciones para trabajar en el código está en [`CLAUDE.md`](CLAUDE.md).
