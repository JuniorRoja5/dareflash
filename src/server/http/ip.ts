/**
 * Normalizacion de IP para agrupar el rate-limit. Modulo APARTE de `api.ts` (sin
 * dependencias de Next) para poder testearlo directamente en Node.
 */

/**
 * Normaliza una IP para agrupar el rate-limit:
 *  - IPv4: tal cual.
 *  - IPv4 mapeada en IPv6 ("::ffff:a.b.c.d"): es una IPv4 real (proxies/duales la
 *    entregan asi), se trata como IPv4. Sin este caso, TODAS caerian en el mismo /64
 *    ("0:0:0:0::/64") y compartirian cubo de rate-limit: un atacante evadiria el
 *    limite y usuarios distintos se bloquearian entre si.
 *  - IPv6: truncada al prefijo /64. A un usuario domestico se le asigna un /64
 *    entero (2^64 direcciones); sin truncar, cada peticion podria usar una IP
 *    distinta y el rate-limit por IP no existiria para quien tenga IPv6.
 */
export function normalizeIp(ip: string): string {
  if (!ip.includes(":")) return ip; // IPv4
  const zoneless = (ip.split("%")[0] ?? ip).toLowerCase();
  // IPv4 mapeada: "::ffff:203.0.113.5" -> "203.0.113.5" (antes del troceo /64).
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(zoneless);
  if (mapped) return mapped[1]!;
  // IPv6: quedarnos con los primeros 4 hextetos (/64). Expandir "::" primero.
  const parts = zoneless.split("::");
  let head: string[];
  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    head = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  } else {
    head = zoneless.split(":");
  }
  return head.slice(0, 4).join(":") + "::/64";
}
