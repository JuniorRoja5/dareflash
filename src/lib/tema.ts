/**
 * EL TEMA DEL SITIO PÚBLICO — parte PURA (sin React ni servidor).
 *
 * Dos temas y ninguno más: OSCURO (el de siempre, y el que sale si no hay preferencia guardada) y
 * CLARO. La preferencia vive en una cookie legible por el navegador, NO en `localStorage`: el servidor
 * tiene que saber el tema para pintar el HTML ya con él. Con `localStorage` el primer pintado sería
 * siempre oscuro y el claro entraría de golpe al hidratar — el parpadeo que esta pieza evita.
 *
 * NO es una credencial: no autentica ni autoriza nada, así que no es `HttpOnly` (el conmutador la
 * escribe desde el cliente) y `SameSite=Lax` basta. Lo peor que puede hacer un tercero que la fije es
 * enseñarte el sitio en claro.
 *
 * El VALOR DE LA COOKIE va en castellano, como el resto del código; el ATRIBUTO del HTML va en inglés
 * (`data-theme="light"`), que es lo que leen los selectores de CSS y lo que entiende `color-scheme`.
 */
export const TEMA_COOKIE = "df-tema";

/** Un año: es una preferencia, no una sesión. */
export const TEMA_COOKIE_MAX_EDAD_S = 60 * 60 * 24 * 365;

export type Tema = "oscuro" | "claro";

/** El que sale cuando no hay nada guardado (o hay basura): el producto nació oscuro. */
export const TEMA_POR_DEFECTO: Tema = "oscuro";

/**
 * Tema a partir del valor crudo de la cookie. Cualquier cosa que no sea exactamente "claro" u
 * "oscuro" —vacío, de otra versión, manipulado a mano— cae en el de por defecto: un query param no
 * puede dejar la página sin tema.
 */
export function temaDesdeCookie(valor: string | null | undefined): Tema {
  return valor === "claro" || valor === "oscuro" ? valor : TEMA_POR_DEFECTO;
}

/** Lo que se escribe en `<html data-theme>` y en `color-scheme`. */
export function atributoTema(tema: Tema): "light" | "dark" {
  return tema === "claro" ? "light" : "dark";
}

/** El otro. El conmutador es un interruptor, no un menú. */
export function temaContrario(tema: Tema): Tema {
  return tema === "claro" ? "oscuro" : "claro";
}

/** La cookie tal cual se asigna a `document.cookie` desde el conmutador. */
export function cookieDeTema(tema: Tema): string {
  return `${TEMA_COOKIE}=${tema}; path=/; max-age=${TEMA_COOKIE_MAX_EDAD_S}; samesite=lax`;
}

/** Color de la barra del navegador (`theme-color`) en cada tema: el fondo de página. */
export const TEMA_COLOR_BARRA: Record<Tema, string> = {
  oscuro: "#07090d",
  claro: "#f4f6f8",
};
