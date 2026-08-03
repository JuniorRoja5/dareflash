/**
 * Mensaje de error SANEADO para el LOG. Alguien lo va a leer al depurar (un correo que no sale, un
 * encolado que falla). NUNCA el mensaje crudo: puede llevar tokens, enlaces, DIRECCIONES de correo
 * o credenciales. Se queda con el `code` (EAUTH, ECONNECTION, EDNS, ETIMEDOUT, EENVELOPE, P2002...)
 * y el responseCode SMTP, que es lo que distingue auth / certificado / DNS / rechazo del
 * destinatario. Lo usan el WORKER (lastError de Job) y las RUTAS (fallo al encolar un correo).
 */
export function sanearError(e: unknown): string {
  if (!(e instanceof Error)) return "error desconocido";
  const code = (e as { code?: unknown }).code;
  const rc = (e as { responseCode?: unknown }).responseCode;
  if (typeof code === "string") return typeof rc === "number" ? `${code} (${rc})` : code;
  if (/cert|tls/i.test(e.message)) return "error de certificado TLS";
  return e.name || "error de envio"; // fallback SIN el mensaje crudo
}
