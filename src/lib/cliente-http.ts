/**
 * Cliente HTTP del NAVEGADOR (islas cliente). Centraliza lo que 10 componentes repetian a mano:
 * `Content-Type`, `body` JSON, `res.json().catch(() => ({}))` y la extraccion de `error.code`; y el
 * flujo CSRF (GET /api/auth/csrf -> cabecera `X-CSRF-Token`) que estaba duplicado en crear, editar
 * perfil, cambiar contrasena y borrar video. Asi un form nuevo no puede olvidarse del CSRF.
 *
 * FORMA DE RETORNO UNIFORME `{ ok, status, code, data }`: cada form decide su copy a partir de eso.
 * El manejo de EXCEPCION DE RED (fetch rechazado) NO se traga aqui: se PROPAGA para que cada form lo
 * capture con su propio mensaje ("No hemos podido conectar…"). Solo se absorbe el fallo de PARSEO del
 * cuerpo (`res.json().catch`), como hacian los componentes.
 *
 * SIMETRIA con el servidor: las rutas SIN CSRF (login, register, recuperar, resend…) usan `postJson`
 * (no manda token, no lo necesitan); las MUTANTES con sesion (crear, perfil, cambiar-password, borrar)
 * usan las variantes `*Csrf`.
 */

/** Respuesta uniforme. `data` = JSON del cuerpo ({} si no parsea). `code` = `data.error.code` o "". */
export interface RespuestaHttp<T = unknown> {
  ok: boolean;
  status: number;
  code: string;
  data: T;
}

/** Lee `error.code` del cuerpo de forma defensiva (misma logica que los `codigoDe` que se repetian). */
export function codigoDe(data: unknown): string {
  if (typeof data === "object" && data && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "object" && err && "code" in err) {
      return String((err as { code?: unknown }).code ?? "");
    }
  }
  return "";
}

/**
 * Lee `error.message` del cuerpo (el copy HUMANO que ya manda el servidor en `{ error:{ code, message }}`).
 * Algunas pantallas (editar perfil, cambiar contrasena, restablecer) prefieren mostrar ese mensaje del
 * servidor cuando existe, con un fallback propio si no. Devuelve "" si no hay mensaje.
 */
export function mensajeDe(data: unknown): string {
  if (typeof data === "object" && data && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "object" && err && "message" in err) {
      return String((err as { message?: unknown }).message ?? "");
    }
  }
  return "";
}

/**
 * Pide un token CSRF atado a la sesion (GET /api/auth/csrf, `credentials: "include"`). Lanza
 * `Error("SIN_SESION")` si no hay sesion (401), IGUAL que el `pedirCsrf` que tenian los componentes:
 * cada form lo distingue en su catch para decir "inicia sesion". Reutilizable tambien por subidas
 * multipart (avatar), que no son JSON pero necesitan el mismo token.
 */
export async function obtenerCsrfToken(): Promise<string> {
  const res = await fetch("/api/auth/csrf", { credentials: "include" });
  if (!res.ok) throw new Error("SIN_SESION");
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  return csrfToken;
}

/** Parsea una respuesta a la forma uniforme (absorbe SOLO el fallo de parseo del cuerpo). */
async function aRespuesta<T>(res: Response): Promise<RespuestaHttp<T>> {
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, code: codigoDe(data), data };
}

/** GET JSON (lecturas públicas: p.ej. la búsqueda). Sin cuerpo ni CSRF; misma forma de retorno. */
export async function getJson<T = unknown>(url: string): Promise<RespuestaHttp<T>> {
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  return aRespuesta<T>(res);
}

/** POST JSON SIN CSRF (login, register, recuperar, resend, unlock, verify, reset). */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<RespuestaHttp<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return aRespuesta<T>(res);
}

/** POST JSON CON CSRF (crear video, cambiar contrasena). Pide el token y lo manda en X-CSRF-Token. */
export async function postJsonCsrf<T = unknown>(
  url: string,
  body: unknown,
): Promise<RespuestaHttp<T>> {
  const csrfToken = await obtenerCsrfToken();
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify(body),
  });
  return aRespuesta<T>(res);
}

/** PATCH JSON CON CSRF (actualizar perfil). */
export async function patchJsonCsrf<T = unknown>(
  url: string,
  body: unknown,
): Promise<RespuestaHttp<T>> {
  const csrfToken = await obtenerCsrfToken();
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify(body),
  });
  return aRespuesta<T>(res);
}

/** DELETE CON CSRF, sin cuerpo (borrar mi video). */
export async function delCsrf<T = unknown>(url: string): Promise<RespuestaHttp<T>> {
  const csrfToken = await obtenerCsrfToken();
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
    headers: { "X-CSRF-Token": csrfToken },
  });
  return aRespuesta<T>(res);
}
