/**
 * Derivacion de SUBCLAVES a partir de AUTH_SECRET, por dominio. Reutilizar la clave
 * cruda para varios propositos (CSRF, hash de IP, ...) es mal habito; se derivan
 * subclaves independientes con HMAC(AUTH_SECRET, "<dominio>"). Versionadas ("*.v1")
 * por si hay que rotar un dominio sin tocar los demas.
 */
import { createHmac } from "node:crypto";

export type KeyDomain = "csrf.v1" | "ip.v1" | "ratelimit.v1";

export function deriveKey(secret: string, domain: KeyDomain): Buffer {
  return createHmac("sha256", secret).update(domain).digest();
}
