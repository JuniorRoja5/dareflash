import localFont from "next/font/local";
import type { CSSProperties } from "react";

/**
 * LAS FUENTES, EN EL REPOSITORIO — sin Google ni en el build ni en la web.
 *
 * Hasta noviembre de 2026 venían de `next/font/google`, que DESCARGA las fuentes durante `next build`.
 * Esa descarga fallaba a veces y tumbaba el build (los dos rojos de `docker-build` del 2026-11-06: el
 * mismo SHA pasaba en otra ejecución). Ahora el build no descarga nada.
 *
 * SON LOS MISMOS FICHEROS, byte a byte: los que `next/font/google` descargaba y servía desde
 * `/_next/static/media`, con sus MISMOS `unicode-range`. Google trocea cada familia por alfabetos (latín,
 * latín extendido, vietnamita y, en Plex, cirílico y griego) y el navegador baja solo el trozo que la
 * página necesita: en castellano, el latino. Para no perder eso —ni pasar a bajar un fichero entero en
 * cada primera visita— hay UNA llamada por trozo, cada una con su `unicode-range`, y se encadenan en una
 * sola pila de fuentes (ver `pila`). Solo se precarga el trozo latino, como antes (`subsets: ["latin"]`).
 *
 * Familias (MARCA.md, brief §5), las dos con licencia SIL OFL 1.1 (los textos, junto a los ficheros):
 *  - DISPLAY: Archivo, variable en peso (100–900) y ANCHURA (62–125 %): cifras y titulares; los importes
 *    de premio van en Archivo Expanded (ancho alto) + peso alto.
 *  - TEXTO: IBM Plex Sans, variable en peso; se usa de 400 a 700. Cuerpo y formularios.
 * Prohibidas como cara del producto: Inter, Geist, Roboto, Open Sans, Poppins, Montserrat.
 *
 * `next/font` exige que cada llamada lleve sus opciones LITERALES (las resuelve al compilar): por eso los
 * rangos se repiten escritos en cada una y no salen de una constante.
 *
 * La comprobación de que ningún fichero vuelve a `next/font/google`, y de que los nueve trozos siguen
 * aquí con su rango, está en `tests/fuentes-locales.test.ts`.
 */

// ---- ARCHIVO -------------------------------------------------------------------------------------------
const archivoLatin = localFont({
  src: "./archivo-latin.woff2",
  weight: "100 900",
  display: "swap",
  preload: true,
  // El respaldo lo declara globals.css con las métricas de siempre (ver `pila`).
  adjustFontFallback: false,
  declarations: [
    { prop: "font-stretch", value: "62% 125%" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

const archivoLatinExt = localFont({
  src: "./archivo-latin-ext.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-stretch", value: "62% 125%" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

const archivoVietnamita = localFont({
  src: "./archivo-vietnamese.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-stretch", value: "62% 125%" },
    {
      prop: "unicode-range",
      value:
        "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
});

// ---- IBM PLEX SANS -------------------------------------------------------------------------------------
const plexLatin = localFont({
  src: "./ibm-plex-sans-latin.woff2",
  weight: "400 700",
  display: "swap",
  preload: true,
  // El respaldo lo declara globals.css con las métricas de siempre (ver `pila`).
  adjustFontFallback: false,
  declarations: [
    { prop: "font-stretch", value: "100%" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

const plexLatinExt = localFont({
  src: "./ibm-plex-sans-latin-ext.woff2",
  weight: "400 700",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-stretch", value: "100%" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

const plexVietnamita = localFont({
  src: "./ibm-plex-sans-vietnamese.woff2",
  weight: "400 700",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-stretch", value: "100%" },
    {
      prop: "unicode-range",
      value:
        "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
});

const plexCirilico = localFont({
  src: "./ibm-plex-sans-cyrillic.woff2",
  weight: "400 700",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-stretch", value: "100%" },
    { prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" },
  ],
});

const plexCirilicoExt = localFont({
  src: "./ibm-plex-sans-cyrillic-ext.woff2",
  weight: "400 700",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-stretch", value: "100%" },
    {
      prop: "unicode-range",
      value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
    },
  ],
});

const plexGriego = localFont({
  src: "./ibm-plex-sans-greek.woff2",
  weight: "400 700",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-stretch", value: "100%" },
    {
      prop: "unicode-range",
      value: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF",
    },
  ],
});

/** El nombre de familia (con comillas) que `next/font` generó para una llamada: el primero de su pila. */
const familia = (f: { style: { fontFamily: string } }) => f.style.fontFamily.split(",")[0]!.trim();

/**
 * LA PILA de una familia: los trozos en orden, del latino al último (cada uno solo cubre su
 * `unicode-range`, así que el navegador va al siguiente para lo que el anterior no tiene) y, al FINAL, el
 * respaldo con métricas ajustadas (Arial reescalada, para que no salte la maquetación mientras carga).
 *
 * El respaldo NO lo calcula `next/font` (todas las llamadas van con `adjustFontFallback: false`): lo
 * declara `globals.css` con las métricas EXACTAS que generaba `next/font/google`. Y va el último a
 * propósito: un respaldo no tiene `unicode-range`, así que, puesto antes, taparía a los trozos de detrás.
 */
const pila = (trozos: { style: { fontFamily: string } }[], respaldo: string) =>
  [...trozos.map(familia), `"${respaldo}"`].join(", ");

/**
 * Las dos variables que usa `globals.css` (`--font-display` y `--font-sans` las leen), con los MISMOS
 * nombres que tenían con `next/font/google`. Van en el `style` de `<html>`.
 */
export const variablesFuentes = {
  "--font-archivo": pila(
    [archivoLatin, archivoLatinExt, archivoVietnamita],
    "DareFlash Archivo Respaldo",
  ),
  "--font-plex": pila(
    [plexLatin, plexLatinExt, plexVietnamita, plexCirilico, plexCirilicoExt, plexGriego],
    "DareFlash Plex Respaldo",
  ),
} as CSSProperties;
