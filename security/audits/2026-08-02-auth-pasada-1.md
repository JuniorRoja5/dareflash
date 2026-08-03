# Auditoría de seguridad — primera pasada sobre `auth` (2026-08-02)

**Estado inicial: PROPUESTAS.** Cada hallazgo fue una propuesta; el propietario decidió cuáles se
corrigen y en qué orden. Ver el estado de remediación abajo.

## Estado de remediación (actualizado 2026-08-03)

- **Hallazgo 1 (bloqueo de cuenta ajena) — RESUELTO.** Rama `2a` (el 503 por saturación ya no gasta
  un intento del cubo de cuenta, semáforo reentrante) + rama `2b` (desbloqueo por correo: el dueño
  siempre tiene una vía de recuperación que el atacante no puede usar). Cerrado de punta a punta.
- **Hallazgo 2 (oráculo de tiempo en `resend-verification`) — RESUELTO de verdad**, no solo el
  comentario: la rama `2b` responde el uniforme PRIMERO y hace el trabajo dependiente de existencia
  en segundo plano (fire-and-forget), así su rama no gobierna el tiempo. Mismo arreglo que el correo
  de desbloqueo. El comentario de `email-verification.ts` ahora dice la verdad.
- **Hallazgos 4 y 5 (endurecimiento) — HECHOS** en la rama de Argon2id: parámetros explícitos y
  compartidos (`ARGON2_PARAMS`, p=1) con rehasheo. El `Secure` de la cookie sigue como estaba (el
  Dockerfile hornea `NODE_ENV=production`); se deja como endurecimiento menor.
- **Hallazgo 3 (X-Real-IP) — ABIERTO**, único que queda. Defensa en profundidad, no explotable en la
  infra actual. Va después o en paralelo a la Fase 1, con diseño primero. No bloquea nada.
- **Hallazgo 6 (`AUTH_SECRET` entropía) — anotado**, sin prioridad.

## Alcance

Solo la superficie de autenticación, como se acordó. Nada más (no hay vídeo, pagos ni feed aún):

- `src/server/auth/` (account, csrf, current-user, keys, login, mutating-route, password, rbac,
  registration, session)
- `src/server/security/rate-limit.ts`
- `src/server/services/email-verification.ts` y `src/server/services/ledger.ts`
- `src/app/api/auth/` (change-password, csrf, login, logout, register, resend-verification, verify)

Apoyo (leídos para entender el fail-open, no auditados como objetivo): `src/server/http/api.ts`,
`src/config/env.ts`, `src/config/constants.ts`, `Dockerfile`.

## Método

Skills de Trail of Bits vendorizadas como lente: **insecure-defaults** (fail-open),
**differential-review** (leer lo que pone, no lo que se quiso escribir), **variant-analysis** (tras
un hallazgo, barrer el resto). Cada candidato pasado por **fp-check** (¿verdadero/falso positivo?)
y **vulnerability-triage-brocards** (¿aplica a nuestro modelo de amenaza?) ANTES de entrar aquí.

Contra el sesgo de auditar código propio: además de mi lectura, **dos auditores independientes**
(lentes distintas: cripto/sesión y lógica/acceso) leyeron la misma superficie tratándola como
ajena. Los tres convergen. Su salida cruda no se reproduce; esto es la síntesis triada.

## Veredicto general

El diseño es **sólido y por encima de la media**: token de sesión de 256 bits (en BD solo su hash
SHA-256), Argon2id, hash señuelo anti-enumeración por tiempo en login y registro, CSRF firmado por
HMAC y **atado a la sesión** + chequeo de `Origin`, rotación de sesión en login y cambio de
contraseña, revocación real por borrado de fila, ledger serializado por `SELECT … FOR UPDATE` +
idempotencia, validación Zod con campos explícitos (sin mass-assignment). **No hay bypass de
autenticación, IDOR, escalada de privilegios ni doble gasto.** Los hallazgos son de
**disponibilidad**, **fuga por temporización** y **endurecimiento de configuración** — ninguno
crítico. Se reportan tal cual, sin inflar severidad.

---

## Hallazgos (ordenados por explotabilidad REAL)

### 1 — [MEDIA · disponibilidad] Bloqueo dirigido de cuenta ajena vía rate-limit por cuenta en login

- **Dónde:** `src/app/api/auth/login/route.ts:36-39` y `:50`; umbral en `src/config/constants.ts:146`
  (`LOGIN_PER_ACCOUNT: 20 / 15 min`).
- **Qué pasa:** el cubo por cuenta (`login:acct:<hmac(email)>`) se consume en CADA intento y solo
  se resetea tras un login **exitoso** (`resetRateLimit`, `:50`). El `allowed` se evalúa **antes**
  de verificar credenciales (`:37-39`), así que una vez alcanzado el tope el **usuario legítimo
  tampoco** puede entrar (se le corta antes de comprobar la contraseña) y por tanto nunca dispara
  el reset.
- **Explotación:** el atacante conoce el email de la víctima → 20× `POST /api/auth/login` con
  contraseña basura en 15 min → la cuenta responde `429`. Repitiendo ~20 peticiones cada 15 min
  (tráfico trivial, desde una IP porque el límite por IP es independiente y más alto) mantiene a la
  víctima fuera indefinidamente.
- **fp-check:** VERDADERO POSITIVO. Confirmado leyendo el orden: `allowed` se comprueba antes de
  `login()`, y el reset solo ocurre en acierto, que la víctima bloqueada no puede lograr.
- **brocards:** aplica. Es DoS dirigido, temporal (se autocura en 15 min) y **no** compromete la
  cuenta; por eso MEDIA, no ALTA. El comentario del código ("20 … sin facilitar el bloqueo de una
  cuenta ajena") es **inexacto**: 20 solo fija el umbral, no elimina el bloqueo.
- **variant-analysis:** el patrón peligroso es "rate-limit corta al camino legítimo antes de que
  pueda resetear, con clave que un tercero puede rellenar". Barrida la superficie: `change-password`
  usa clave por USUARIO ya autenticado (solo te bloqueas a ti mismo, no a otro); `register` y
  `resend` son por IP/email pero no guardan una acción de la que dependa la víctima como el login.
  **Sin variantes**: el vector es exclusivo de `login` por cuenta.
- **Mitigaciones habituales (a decidir por el propietario):** no cortar el camino del acierto
  legítimo (verificar credenciales y solo entonces decidir el bloqueo), exigir IP+cuenta juntas, o
  backoff en vez de corte duro.

### 2 — [BAJA · enumeración + discrepancia doc/código] Oráculo de temporización en resend-verification

- **Dónde:** `src/app/api/auth/resend-verification/route.ts:41-44`. Contradice la garantía escrita
  en `src/server/services/email-verification.ts:16-18` ("SIN ENUMERACION / TIMING … se aplica en el
  ENDPOINT").
- **Qué pasa:** la respuesta es uniforme (bien), pero el **trabajo no**. Si `user && emailVerified
=== null` se ejecuta `requestEmailVerification` (deleteMany + create del token + enqueue, varias
  idas a BD); si la cuenta no existe o ya está verificada, es un no-op tras un único `findUnique`. A
  diferencia de login/register, **aquí no hay Argon2** que entierre la diferencia.
- **Explotación:** medir la latencia de `/api/auth/resend-verification` para un email objetivo;
  respuesta consistentemente más lenta ⇒ "existe y sigue sin verificar". Distingue tres estados.
- **fp-check:** VERDADERO POSITIVO como discrepancia de temporización, pero explotabilidad BAJA: la
  señal es de pocos ms sobre latencia de red ruidosa (requiere muchas muestras) y está muy acotada
  por rate-limit (`RESEND_VERIFICATION_PER_EMAIL 3/h`, `PER_IP 10/h`), que impide muestrear lo
  suficiente para promediar el ruido.
- **brocards:** aplica sobre todo por lo que a este proyecto le importa: es un **comentario que
  promete una protección que el código no cumple** — el patrón que hemos convertido en norma. La
  fuga es marginal; la promesa incumplida es lo que hay que resolver (igualar el trabajo en ambas
  ramas, o alinear el comentario con lo que de verdad hace).
- **variant-analysis:** patrón "respuesta uniforme, trabajo no uniforme". `register` tiene el mismo
  reparto (email nuevo hace ~3 escrituras extra) pero ahí **sí** queda enmascarado por el Argon2
  que se ejecuta siempre (verificado en `registration.ts:66-91`). `login` ejecuta Argon2 siempre.
  El único punto sin máscara es `resend`.

### 3 — [MEDIA · condicionada a infra · defensa en profundidad] Rate-limit por IP confía 100 % en la cabecera `X-Real-IP`

- **Dónde:** `src/server/http/api.ts:33-46` (`clientIp` / `clientIpKey`), consumido en
  `register/route.ts:22-26`, `login/route.ts:33`, `resend-verification/route.ts:27-30`.
- **Qué pasa:** la IP del cliente sale de una **cabecera de petición**. La garantía de que no es
  falsificable es **puramente de infraestructura** (Caddy la reescribe con `Set` y el servicio `web`
  no expone puerto). El código no tiene plan B: si el contenedor quedara accesible sin pasar por
  Caddy (puerto publicado por error, un proxy futuro, un healthcheck expuesto), el atacante rota
  `X-Real-IP` por petición y **anula el límite por IP**.
- **Explotación (si cae la premisa):** `register` solo tiene límite **por IP** (5/h) → con
  `X-Real-IP` rotatorio, registros ilimitados que disparan correo de verificación a **direcciones
  de terceros arbitrarias** → **email-bombing** con la reputación SMTP de dareflash y agotamiento de
  la cuota de Hostinger.
- **fp-check:** el código, aislado, confía en la cabecera sin validar el origen de la conexión. NO
  verificable como explotable desde el repo: no hay `Caddyfile` en el árbol para confirmar el `Set`
  ni la topología de red. En la infra descrita **no es explotable hoy**; lo reporto como punto único
  de fallo / defensa en profundidad, no como bug activo.
- **brocards:** condicionada a infra fuera del alcance de código, pero el impacto si la premisa se
  rompe es alto y el código no ofrece resiliencia. Merece una decisión consciente (validar
  `remote_addr`, o rechazar si la conexión no viene del proxy esperado).
- **variant-analysis:** `register` es el peor caso (solo por IP). `login` y `resend` tienen un
  segundo límite (por cuenta / por email) que sobrevive aunque caiga el de IP.

### 4 — [BAJA · endurecimiento] La flag `Secure` de la cookie se deriva de `NODE_ENV`, que por defecto es `development`

- **Dónde:** `src/config/env.ts:53` (`NODE_ENV … default("development")`) +
  `src/server/auth/current-user.ts:32` (`secure: env.NODE_ENV === "production"`).
- **El patrón es fail-open:** `secure` es `true` solo si `NODE_ENV` es EXACTAMENTE `"production"`;
  cualquier otro valor (incluido el default del propio esquema) emite la cookie de sesión —la llave
  de la cuenta— **sin `Secure`**.
- **Corrección del hecho de base (por qué NO es ALTO):** dos auditores independientes lo pusieron de
  #1 ALTO. Verifiqué el Dockerfile: **`Dockerfile:48` fija `ENV NODE_ENV=production`** en la etapa
  runner (y `:78` en el worker). En el contenedor de producción `NODE_ENV=production` va **horneado
  en la imagen**, no en el `.env` que se mantiene a mano, así que la cookie **sí** lleva `Secure`. El
  escenario "el operador olvida la variable" no aplica: no es una variable de entorno olvidable, es
  parte de la imagen. Por eso baja a endurecimiento.
- **fp-check:** VERDADERO como patrón fail-open, pero NO produce cookie insegura en el despliegue
  actual. Residual: el `server.js` del standalone de Next **no** fuerza `NODE_ENV` por sí mismo (a
  diferencia de `next start`), así que la única cosa que lo fija es el `ENV` del Dockerfile; quien
  corriera la app fuera de esa imagen perdería el `Secure` en silencio.
- **Endurecimiento sugerido:** derivar `secure` de que `APP_URL` empiece por `https://` (que es
  obligatoria y validada) o `secure: env.NODE_ENV !== "development"` (fail-secure por defecto).

### 5 — [BAJA · endurecimiento] Parámetros de Argon2id no fijados explícitamente

- **Dónde:** `src/server/auth/password.ts:11` (`ARGON2_OPTIONS = { type: argon2.argon2id }`) vs
  `:19-20` (`DUMMY_HASH` con `m=65536,p=4,t=3`).
- **Qué pasa:** `hashPassword` no fija `memoryCost/timeCost/parallelism`: usa los **defaults de la
  librería**. Hoy coinciden con los del `DUMMY_HASH` (verificado), así que la equalización de tiempo
  anti-enumeración del login **funciona**. Riesgo de robustez: si una futura actualización de la
  dependencia cambia sus defaults, (a) los hashes nuevos dejarían de cuadrar con `DUMMY_HASH` →
  **reaparece un oráculo de tiempo en login**, y (b) el coste de hashing cambiaría en silencio.
- **fp-check / brocards:** no explotable hoy; latente y de mantenimiento.
- **Endurecimiento:** fijar los tres parámetros explícitamente y **compartirlos** entre
  `hashPassword` y `DUMMY_HASH` (una sola fuente de verdad).

### 6 — [BAJA · endurecimiento] `AUTH_SECRET` valida longitud, no entropía

- **Dónde:** `src/config/env.ts:66` (`z.string().min(32)`).
- **Qué pasa:** `AUTH_SECRET` es la clave HMAC del token CSRF, del hash de IP y de las claves de
  rate-limit. `min(32)` acepta 32 caracteres de baja entropía (una frase, o `"aaaa…"`). Un secreto
  adivinable permitiría **forjar tokens CSRF**. No es fail-open (la variable es obligatoria) y la doc
  dice `openssl rand -hex 32`, pero el guardarraíl es de longitud, no de aleatoriedad.
- **fp-check / brocards:** depende de que el operador ignore la instrucción; bajo. Endurecimiento:
  empujar el formato desde el esquema (p.ej. exigir 64 hex).

---

## Revisado y DESCARTADO (con motivo, una línea)

- **Búsqueda de token de sesión/verificación por hash sin `timingSafeEqual`** (`session.ts:98`,
  `email-verification.ts:69`): no explotable — se busca por índice el SHA-256 de un token de 256
  bits; el canal de tiempo de un B-tree no reconstruye el token.
- **Respuesta diferencial `EMAIL_NOT_VERIFIED` vs `INVALID_CREDENTIALS` en login** (`login.ts:42-49`):
  el `EMAIL_NOT_VERIFIED` solo se devuelve **tras** la contraseña correcta → no enumera sin
  autenticarse.
- **`verify` sin rate-limit** (`verify/route.ts`): token de 256 bits, fuerza bruta inviable; solo
  consume token si el hash casa. El diseño GET→página→POST evita el prefetch de escáneres de correo.
- **Idempotencia del ledger bajo carrera** (`ledger.ts`): correcta — `FOR UPDATE` del User primero y
  siempre, chequeo de idempotencia y escritura de valor absoluto (no `INCREMENT`); inmune a
  lost-update. Misma-key/distinto-usuario choca contra el UNIQUE y hace rollback (error, no doble
  aplicación).
- **Inyección SQL en `ledger` por `Prisma.raw(balanceColumn)`** (`ledger.ts:93`): no — `balanceColumn`
  es una unión cerrada de literales internos, nunca entrada de usuario.
- **CSRF forjable** (`csrf.ts`): no — `nonce.HMAC(subclave, sessionId:nonce)`, comparación en tiempo
  constante con chequeo de longitud, atado a la sesión; y el header `X-CSRF-Token` no es enviable
  cross-origin sin preflight.
- **CSRF en rutas exentas (login/register/verify/resend)**: no explotable — todas exigen
  `application/json` (vía `req.json()`), que una petición cross-site no puede enviar sin preflight
  CORS; además `mutatingRoute` cubre las que sí tienen sesión y un test estructural lo vigila.
- **`clientIp` colapsa a un cubo único si falta `X-Real-IP`** (`api.ts:36-38`): es _más_ restrictivo
  (todos comparten cubo) y loguea la anomalía; no es bypass (es secundario al hallazgo 3).
- **Mass assignment / privesc por `role`**: no — las rutas pasan campos explícitos a los servicios;
  ningún spread del body llega a Prisma, y `role` sale de la BD, no del cliente.
- **Rotación/fijación de sesión**: correcta — login crea token nuevo y fija cookie solo tras
  verificar; `changePassword` revoca todas + emite sesión y CSRF nuevos en la misma transacción.
- **Validación del ledger de los campos enum** (`ledger.ts`): `entryType`/`status`/`reason` se
  insertan sin validar en el servicio; hoy **no aplica** (no hay llamadas en producción). Cuando las
  Fases 4/6/7 llamen al ledger, el contrato "el llamador valida con los esquemas de `constants.ts`"
  debe hacerse cumplir. Anotado como deuda futura, no hallazgo actual.

---

## Cierre

No se ha modificado código. La superficie de auth está bien construida; el trabajo pendiente, si el
propietario lo aprueba, es el hallazgo 1 (disponibilidad), la decisión sobre el 3 (resiliencia del
rate-limit frente a la cabecera) y tres endurecimientos (4, 5, 6). El hallazgo 2 se resuelve tanto
igualando el trabajo como corrigiendo el comentario que promete de más.
