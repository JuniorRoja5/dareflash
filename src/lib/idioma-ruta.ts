/**
 * EL IDIOMA EN LA URL (Fase 11 · P5a) — parte PURA, la usan el proxy, el servidor y el cliente.
 *
 * La URL manda: el castellano vive en la RAÍZ (`/feed`, las URL de siempre, también las de los correos
 * ya enviados) y los demás idiomas con su PREFIJO (`/en/feed`, `/de/feed`). No hay carpeta `[idioma]`:
 * el proxy quita el prefijo, reescribe a la ruta de siempre y le dice a la página en qué idioma está con
 * la cabecera `x-df-idioma` (ver `src/proxy.ts`).
 *
 * Lo que NO lleva idioma nunca (`RUTAS_SIN_IDIOMA`): el panel (no se traduce), la API y `/ir`. Un enlace a
 * ellas sale tal cual desde cualquier idioma, y con prefijo (`/en/panel`) son un 404.
 */
import { IDIOMAS, type Idioma } from "./formato";

/** El idioma de la raíz, sin prefijo. */
export const IDIOMA_RAIZ: Idioma = "es";

/** Las cabeceras que pone el proxy en la petición (y que pisa siempre si vienen del cliente). */
export const CABECERA_IDIOMA = "x-df-idioma";
export const CABECERA_RUTA = "x-df-ruta";

/** Rutas que no llevan idioma: ni se prefijan en un enlace ni existen con prefijo. */
export const RUTAS_SIN_IDIOMA = ["/panel", "/api", "/ir", "/_next"] as const;

export function esIdioma(valor: unknown): valor is Idioma {
  return typeof valor === "string" && (IDIOMAS as readonly string[]).includes(valor);
}

/** ¿`ruta` es (o cuelga de) `base`? Por SEGMENTO: `/destacados` no cuelga de `/de`. */
function cuelgaDe(ruta: string, base: string): boolean {
  return ruta === base || ruta.startsWith(`${base}/`);
}

export function esRutaSinIdioma(ruta: string): boolean {
  return RUTAS_SIN_IDIOMA.some((base) => cuelgaDe(ruta, base));
}

/**
 * Separa el prefijo de idioma de una ruta: `/en/retos/x` → `{ prefijo: "en", resto: "/retos/x" }`;
 * `/retos` → `{ prefijo: null, resto: "/retos" }`; `/en` → `{ prefijo: "en", resto: "/" }`. Solo mira el
 * PRIMER segmento y solo si es un idioma del catálogo (`/destacados` no es `/de`).
 */
export function separarIdioma(ruta: string): { prefijo: Idioma | null; resto: string } {
  const m = /^\/([^/?#]+)(.*)$/.exec(ruta);
  if (m && esIdioma(m[1])) {
    const resto = m[2] ?? "";
    return { prefijo: m[1], resto: resto === "" || resto.startsWith("?") ? `/${resto}` : resto };
  }
  return { prefijo: null, resto: ruta };
}

/** La ruta sin su prefijo de idioma (la que comparan los componentes: `/inicio`). */
export function rutaSinIdioma(ruta: string): string {
  return separarIdioma(ruta).resto;
}

/**
 * EL ENLACE INTERNO EN UN IDIOMA. `ruta("en", "/retos")` → `/en/retos`; en castellano, sin tocar.
 * Idempotente: una ruta que ya lleva prefijo de idioma sale igual (no hay `/en/en/…`). No toca lo que
 * no es una ruta interna (`https://…`, `mailto:`, `#ancla`, `?query`, `//host`) ni las rutas sin
 * idioma (panel, API, `/ir`).
 */
export function ruta(idioma: Idioma, href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  if (separarIdioma(href).prefijo !== null) return href;
  if (esRutaSinIdioma(href.split(/[?#]/, 1)[0] ?? href)) return href;
  if (idioma === IDIOMA_RAIZ) return href;
  return href === "/"
    ? `/${idioma}`
    : href.startsWith("/?") || href.startsWith("/#")
      ? `/${idioma}${href.slice(1)}`
      : `/${idioma}${href}`;
}
