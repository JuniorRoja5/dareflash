/**
 * Mensaje de error SANEADO para el LOG. Alguien lo va a leer al depurar (un correo que no sale, un
 * encolado que falla, una tarea del worker). NUNCA el mensaje crudo: puede llevar tokens, enlaces,
 * DIRECCIONES de correo o credenciales (la URL de la base de datos, con su usuario y su contraseña).
 * Se queda con la CLASE:
 *
 *  - el `code` (EAUTH, ECONNECTION, ECONNREFUSED, EDNS, ETIMEDOUT, EENVELOPE, P2002…) y el
 *    responseCode SMTP, que es lo que distingue auth / certificado / DNS / rechazo del destinatario;
 *  - el `errorCode` de Prisma cuando no hay `code` (un fallo al conectar trae P1001, P1017… ahí);
 *  - «Redis no conectado» para los rechazos de ioredis sin conexión, que llegan como un `Error`
 *    pelado, sin `code` (Fase 11 · worker vigilado: el worker escribía «(Error)» y no se sabía nada).
 *    Se reconoce por la FORMA del mensaje, pero lo que sale es la clase fija, nunca el mensaje;
 *  - el nombre del error si no es el genérico (`MaxRetriesPerRequestError`,
 *    `PrismaClientValidationError`…).
 *
 * Lo usan el WORKER (lastError de Job y el log de sus tareas) y las RUTAS (fallo al encolar un correo).
 */
const REDIS_SIN_CONEXION = /enableOfflineQueue|Stream isn't writeable|Connection is closed/i;

export function sanearError(e: unknown): string {
  if (!(e instanceof Error)) return "error desconocido";
  const code = (e as { code?: unknown }).code;
  const rc = (e as { responseCode?: unknown }).responseCode;
  if (typeof code === "string") return typeof rc === "number" ? `${code} (${rc})` : code;
  const errorCode = (e as { errorCode?: unknown }).errorCode;
  if (typeof errorCode === "string" && /^P\d{4}$/.test(errorCode)) return errorCode;
  if (REDIS_SIN_CONEXION.test(e.message)) return "Redis no conectado";
  if (/cert|tls/i.test(e.message)) return "error de certificado TLS";
  return e.name || "error de envio"; // fallback SIN el mensaje crudo
}
