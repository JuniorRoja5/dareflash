# DareFlash — Estado del codigo (LA PARTE QUE CADUCA)

> **Foto del 2026-10-07. `main` = `9472b09`, desplegado y verificado.**
>
> Todo lo de este fichero **caduca**: el resto de la documentacion (CLAUDE.md, AGENTS.md, los
> docblocks) describe decisiones que apenas cambian; esto cambia cada dos semanas.
>
> **Es una PISTA, no una verdad.** Si el codigo contradice este fichero, **gana el codigo**. Antes
> de afirmar nada de aqui, compruebalo contra el repositorio.
>
> **QUE NO ENTRA AQUI.** Este repositorio es PUBLICO. La operacion (runbook, despliegue, servidor,
> correo, copias, credenciales), la estrategia legal y los datos de negocio viven FUERA, y ahi se
> quedan — igual que `/security/audits/` esta en `.gitignore` a proposito. Si falta un dato de esos
> para una tarea, se **pide**; no se escribe aqui "para tenerlo a mano".

## 1. Fase actual

**Fases 0–5 CERRADAS y desplegadas. La siguiente es la Fase 6 (Stripe / Boost), NO iniciada.**
Quedan 6 fases (6–11): 6 Stripe/Boost · 7 monedero/premios/retiradas · 8 VIP · 9 Brand Challenges ·
10 1vs1 · 11 multiidioma/PWA.

Pre-lanzamiento: el sitio sigue tras el pestillo (`robots: Disallow: /` + `X-Robots-Tag: noindex`).

## 2. Que esta cerrado y desplegado

- **Fase 0** andamiaje · **Fase 1** auth, perfiles, feed, diseno, Bunny · **Fase 2** retos +
  comentarios sobre el video · **Fase 3** votacion + antifraude · **Fase 4** puntos/DareUp/niveles/
  ranking + panel de admin · **Fase 5** moderacion completa.
- **Fase 5:** denuncias (`Report`); **ocultado automatico por umbral** (3 denuncias OPEN de
  denunciantes DISTINTOS y verificados → objeto oculto, provisional y reversible, con aviso al
  equipo); lo que un moderador **absuelve no se re-esconde** durante 30 dias; `/panel/moderacion` y
  `/panel/usuarios` funcionales; rol **MODERATOR** (ver §3).
- **Lo ultimo de F4/F5:** likes en el video + **hito de 50 likes**; **racha** de dias activos
  (calculada, premiada una vez por racha, visible en el hero de `/puntos` y en el perfil propio);
  **referidos** (enlace + QR, premio atado a la verificacion del invitado); **emblema y anillo de
  nivel** en todos los avatares; **participacion por nivel** en retos (`nivelMinimo`); **puerta
  +18** declarada con consentimiento sellado, y aviso de edad al escribir la fecha.
- **Light mode** del sitio publico, servido desde cookie.

## 3. Rol MODERATOR

Desde Fase 5 el panel se abre a **MODERATOR** ademas de ADMIN. El rol **vive en `secciones.ts` y en
ningun otro sitio**: el layout deja entrar a MODERATOR o superior (el shell NO es la barrera) y cada
pagina exige el rol de SU seccion con `requireSeccion`. **Prohibido** un `requireRole("ADMIN")`
suelto en una pagina: seria una segunda verdad. Moderacion y Usuarios son del moderador;
retos/dinero/puntos/anuncios, del administrador. Solo el superadmin asigna roles, y solo
USER↔MODERATOR; ADMIN unicamente por el script de bootstrap. Solo se banea a cuentas USER.

## 4. Fase 6 (Stripe / Boost) — lo que falta decidir antes de teclear

Boost es **cobro normal (Stripe estandar), NO Connect**, asi que no depende de la verificacion de
identidad de la Fase 7. `BoostLedger` y `BoostActivation` **ya existen** en el esquema.

- **Precios definitivos de Boost**, a `constants.ts`.
- **Moneda de cobro**: `DEFAULT_CURRENCY` sigue marcada `// PENDIENTE`.
- **Cuenta de Stripe**: se construye y se prueba en modo TEST; el go-live queda detras de la cuenta
  real.

Reglas que aplican si o si: dinero en **centimos enteros**, ledger de **solo insercion** con
`idempotencyKey`, saldo ajustado en la misma transaccion bloqueando **primero** la fila del `User`
con `FOR UPDATE`, y webhooks idempotentes.

## 5. Piezas cortas pendientes

Trabajo acotado y listo para instruir. Ninguna bloquea la Fase 6.

- **`likeCount` en la reconciliacion.** Falta el barrido que lo cuadre contra el `COUNT` real, como
  ya tiene `voteCount`. Con el cerrojo no deberia descuadrarse, pero es la red que los otros
  contadores si tienen.
- **Dos acciones de puntos sin asignar.** Siguen en `ACCIONES_PUNTOS` como `activa: false`.
  **Confirmar cuales exactamente contra `constants.ts` antes de instruir**: las cableadas hoy son
  ganar reto, top 20, hito de videos, invitar, registrarse con invitacion, racha y 50 likes.
- **Like en rejilla y perfil.** Hoy solo esta en el feed. El DTO ya lleva `likes`/`miLike` a la
  rejilla del reto, asi que es trabajo de vista.
- **"Compartir" que funcione.** Decidido activarlo, no quitarlo. Hoy es un `<Accion>` sin
  `onClick`: un boton que se pulsa y no hace nada, **declarado como tal** en
  `tests/feed-rail-sin-botones-muertos.test.ts`. Al implementarlo hay que sacarlo de esa lista.

## 6. Deuda tecnica viva (no bloquea)

- **Feed:** conserva la debilidad del cursor de Prisma (retirar una fila entre paginas se come
  otra). El detalle del reto ya usa keyset explicito; el feed no. Arreglar al tocar el feed.
- **Keyset en la pestana "Cerrados"** de `/retos`: se acumula sin limite ("Activos" si esta
  acotado).
- **Maquetas con tripwire (`MAQUETA_PENDIENTE`):** `retos-datos.ts` (`RETOS_SEED`) y
  `portada-datos.ts` (Boost / F6).
- **Halo del light mode** (`--df-halo-fuerza` al 10% sobre blanco): pendiente de revision visual.
- `tests/buscar.test.ts` es **flaky conocido**: el FULLTEXT de InnoDB se asienta tras reiniciar
  MariaDB. **No es regresion**; ignorar si salta aislado.
- Prisma 7.9.0 → 7.9.1 pendiente.
- Vulnerabilidades moderadas de postcss (build-time, no explotables). **Nunca
  `npm audit fix --force`**: degrada Next.

## 7. Deuda de producto

- El texto legal dice 30 s y la regla real es 90 s. Corregir antes de lanzar.
- `/terminos` y `/privacidad` no existen: la casilla del registro las nombra y no enlaza a nada.
- Anonimizacion real de cuenta: hoy solo hay tombstone `del_<aleatorio>`.

## 8. Lecciones de proceso

Valen mas que cualquier fase, porque se repiten.

- **Probar la COMPOSICION, no solo las piezas.** El like llego roto a produccion con el servicio, la
  ruta, `haySesion` y `esMio` todos probados: el rail tenia DOS corazones y el que se pulsaba era un
  adorno sin `onClick`. Al anadir un control a una superficie que ya existe van **dos** tests: el de
  **interaccion** (pulsarlo hace algo) y el de **composicion** (hay uno solo, y ninguna accion
  promete un clic que no existe). Los controles aun sin cablear se **declaran uno a uno** en el
  guard, para que el proximo mudo tenga que justificarse.
- **Clavar los numeros de producto.** Umbral de denuncias (3), plazo de inmunidad (30 dias), likes
  del hito (50) y dias de racha (7) van fijados con un `toBe(...)` en su test. Si todos los casos se
  derivan de la constante, moverla no enrojece nada — y eso paso tres veces antes de sistematizarlo.
- **Un guard que enrojece por lo que no es, se acaba borrando.** Un `\boffset\b` caza
  `underline-offset-2`; un `\b18\b` caza el `path` de un icono; buscar sobre el fichero entero caza
  el comentario que EXPLICA la regla. Los guards miran el codigo sin comentarios y se acotan a la
  funcion que decide.
