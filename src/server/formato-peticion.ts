/**
 * EL IDIOMA Y LA ZONA DE LA PETICIÓN (Fase 11 · P1) — server-only.
 *
 * Lo que las páginas y las rutas pasan al formateador (`lib/formato`). Se lee POR PETICIÓN (cookies),
 * nunca en ámbito de módulo: el build corre sin petición.
 */
import "server-only";

import { headers } from "next/headers";

import type { Idioma } from "@/lib/formato";
import {
  CABECERA_IDIOMA,
  CABECERA_RUTA,
  esIdioma,
  esIdiomaDeTextos,
  IDIOMA_RAIZ,
  type IdiomaDeTextos,
} from "@/lib/idioma-ruta";

/**
 * EL IDIOMA DE LA PÁGINA, y el único sitio del que sale (Fase 11 · P5a). La URL manda: lo pone el proxy
 * en `x-df-idioma` a partir del prefijo (`/en/…`), y pisa siempre el que mande el cliente. Sin cabecera
 * —una ruta que no pasa por el proxy (la API, el panel) o el build—, el de la raíz: «es».
 *
 * Todavía no hay textos traducidos (P5b/P5c): hoy cambia `<html lang>` y lo que formatea con el idioma;
 * y mientras `IDIOMAS_PUBLICADOS` sea solo «es», el proxy no deja llegar aquí otro.
 */
export async function idiomaDeLaPeticion(): Promise<Idioma> {
  const valor = (await headers()).get(CABECERA_IDIOMA);
  return esIdioma(valor) ? valor : IDIOMA_RAIZ;
}

/**
 * EL IDIOMA DE LOS TEXTOS de la página (Fase 11 · P5b1): el de `idiomaDeLaPeticion`, o el pseudo-idioma
 * `xx` (solo en desarrollo; el proxy no lo deja pasar en producción). Para elegir el diccionario y para
 * los enlaces; para FORMATEAR (números, fechas, plurales) se usa `idiomaDeLaPeticion`, que en `xx` es «es».
 */
export async function idiomaDeTextosDeLaPeticion(): Promise<IdiomaDeTextos> {
  const valor = (await headers()).get(CABECERA_IDIOMA);
  return esIdiomaDeTextos(valor) ? valor : IDIOMA_RAIZ;
}

/**
 * La ruta de la página SIN prefijo de idioma (`/retos/x` también en `/en/retos/x`), de `x-df-ruta`. Para
 * la canónica y el `hreflang`. `null` si la petición no pasó por el proxy (panel, API, build): ahí no
 * se publica ninguna.
 */
export async function rutaDeLaPeticion(): Promise<string | null> {
  const valor = (await headers()).get(CABECERA_RUTA);
  return valor && valor.startsWith("/") && !valor.startsWith("//") ? valor : null;
}

/** La zona de quien mira: vive en `zona-peticion` (sin cabeceras: la usa también la API, P5b3). */
export { zonaDeLaPeticion } from "./zona-peticion";
