/**
 * Validacion de la ruta de retorno (`?siguiente`) tras el login.
 *
 * Cuando un anonimo intenta una accion protegida, el proxy lo manda a
 * /entrar?siguiente=<ruta> para devolverlo alli tras entrar. Ese valor viaja en la
 * URL, asi que es ENTRADA NO CONFIABLE: un atacante puede colar "//evil.com" o
 * "https://evil" para un OPEN REDIRECT (mandar al usuario ya autenticado a un dominio
 * externo que suplante la marca). Por eso solo se acepta una ruta LOCAL.
 *
 * Local seguro = empieza por "/", y NO por "//" ni "/\" (URL relativas de protocolo /
 * con host, que el navegador resuelve a OTRO dominio), y sin "://" (URL absoluta
 * disfrazada). Nota: cualquier valor que empiece por "\" ya se descarta por no empezar
 * por "/".
 */
export function esRutaLocalSegura(destino: string | null | undefined): destino is string {
  if (!destino) return false;
  if (!destino.startsWith("/")) return false;
  if (destino.startsWith("//")) return false;
  if (destino.startsWith("/\\")) return false;
  if (destino.includes("://")) return false;
  return true;
}

/**
 * Devuelve `destino` si es una ruta local segura; si no, el `fallback` (por defecto "/").
 * Lo usa el login para respetar `?siguiente` sin arriesgar un open-redirect.
 */
export function rutaSiguienteSegura(destino: string | null | undefined, fallback = "/"): string {
  return esRutaLocalSegura(destino) ? destino : fallback;
}
