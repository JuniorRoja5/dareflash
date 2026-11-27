/**
 * LOS TEXTOS DE LA API (Fase 11 · P5b3) — UN sitio para que cada ruta responda en el idioma de quien
 * la llama, sin pasar idiomas a mano.
 *
 * ┌─ POR QUÉ UNA COOKIE Y NO LAS CABECERAS DEL PROXY ─────────────────────────────────────────────┐
 * │ `/api` no pasa por el proxy: ni lleva prefijo de idioma ni nadie le pisa `x-df-idioma` /      │
 * │ `x-df-ruta`, así que ahí llegan tal cual las mande el cliente — un dato sin validar con pinta │
 * │ de ser de confianza. El proxy deja en la cookie `df-idioma` el idioma de la última PÁGINA     │
 * │ servida (`COOKIE_IDIOMA`) y aquí se lee VALIDADA: un idioma publicado, o el pseudo-idioma `xx`│
 * │ solo en desarrollo. Cualquier otra cosa —sin cookie, vacía, manipulada, uno no publicado— es  │
 * │ castellano. Lo fija `tests/textos-api` (y `api-sin-cabeceras-de-idioma`, que nadie en la API  │
 * │ lea esas cabeceras).                                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Los textos son los del espacio `api` del diccionario: server-only, nunca viajan al navegador (lo
 * que viaja es la frase ya compuesta, en el JSON de la respuesta).
 */
import "server-only";

import { IDIOMAS_PUBLICADOS } from "@/config/constants";
import {
  COOKIE_IDIOMA,
  esIdioma,
  IDIOMA_PSEUDO,
  IDIOMA_RAIZ,
  type IdiomaDeTextos,
} from "@/lib/idioma-ruta";
import type { Idioma } from "@/lib/formato";
import { diccionario, type NombreEspacio, type Textos } from "@/textos/diccionarios";
import type { MensajeApi } from "@/textos/mensaje-api";
import { crearT, type FuncionT } from "@/textos/plantilla";

/** El valor de una cookie de la petición, sin dependencias (la API recibe un `Request` pelado). */
function cookieDe(req: Request, nombre: string): string | undefined {
  const crudo = req.headers.get("cookie");
  if (!crudo) return undefined;
  for (const trozo of crudo.split(";")) {
    const i = trozo.indexOf("=");
    if (i > 0 && trozo.slice(0, i).trim() === nombre) return trozo.slice(i + 1).trim();
  }
  return undefined;
}

/** El idioma en que responde la API: el de la cookie si es válido; si no, castellano. */
export async function idiomaDeLaApi(req: Request): Promise<IdiomaDeTextos> {
  const v = cookieDe(req, COOKIE_IDIOMA);
  // `env` se carga SOLO si la cookie dice `xx`, y por petición (import dinámico, como en las rutas):
  // el resto de peticiones no dependen de él, y este módulo no lo arrastra al importarse.
  if (v === IDIOMA_PSEUDO) {
    const { env } = await import("@/config/env");
    return env.NODE_ENV === "development" ? IDIOMA_PSEUDO : IDIOMA_RAIZ;
  }
  if (esIdioma(v) && IDIOMAS_PUBLICADOS.includes(v)) return v;
  return IDIOMA_RAIZ;
}

/**
 * La `t` de los mensajes de la API, en el idioma de quien llama. Por defecto, del espacio `api`; una
 * ruta que dice LA MISMA FRASE que pinta una pantalla (el toque enviado, el límite diario de Boost)
 * pide el espacio de esa pantalla: una frase, UNA clave.
 */
export async function textosApi<N extends NombreEspacio = "api">(
  req: Request,
  espacio: N = "api" as N,
): Promise<FuncionT<Textos[N]>> {
  const idioma = await idiomaDeLaApi(req);
  return crearT(diccionario(idioma)[espacio], deFormato(idioma));
}

/** El idioma para FORMATEAR (fechas, horas, cifras): el pseudo-idioma formatea como el castellano. */
export async function idiomaDeFormatoDeLaApi(req: Request): Promise<Idioma> {
  return deFormato(await idiomaDeLaApi(req));
}

const deFormato = (idioma: IdiomaDeTextos): Idioma =>
  idioma === IDIOMA_PSEUDO ? IDIOMA_RAIZ : idioma;

/** La `t` de la API, para pasársela a una función auxiliar de la ruta que compone un error. */
export type TApi = FuncionT<Textos["api"]>;

/**
 * Una frase de la API dicha como DATO (P5b3): la clave del espacio `api` y sus parámetros. Es lo que
 * devuelve un servicio en vez de una frase escrita (un `PublicidadError`, el veredicto de una
 * contraseña…): la frase la compone la ruta, en el idioma de quien llama, con `frase`.
 */
export type { MensajeApi };

/** La frase de un `MensajeApi`, en el idioma de `t`. */
export function frase(t: TApi, m: MensajeApi): string {
  // La clave y sus parámetros los comprueba `MensajeApi` donde se escribe el dato; aquí ya son un par
  // válido, y `FuncionT` no sabe estrechar un par genérico.
  return (t as (clave: string, p?: Record<string, string | number>) => string)(m.clave, m.params);
}

/**
 * La `t` de la API en CASTELLANO FIJO, para lo que comparte una pieza con el PANEL (que no se traduce):
 * `imagenDelFormulario` la usa por defecto, así una ruta del panel no cambia.
 */
export function textosApiEnCastellano(): TApi {
  return crearT(diccionario(IDIOMA_RAIZ).api, IDIOMA_RAIZ);
}

/**
 * El mensaje de un error de VALIDACIÓN (zod) en el idioma de quien llama. Un esquema que se traduce
 * lleva como mensaje la CLAVE del espacio `api` (P5b3); uno que no —o el texto por defecto de zod—
 * sale tal cual, como antes. Las cifras de un tope (`{min}`, `{max}`) salen del propio error de zod,
 * que es quien sabe cuál era. `porDefecto`: la frase si no hay ningún error que contar.
 */
export function mensajeDeValidacion(
  t: TApi,
  error: { message: string; minimum?: unknown; maximum?: unknown } | undefined,
  porDefecto: string,
): string {
  if (error === undefined) return porDefecto;
  if (!esClaveApi(error.message)) return error.message;
  const params: Record<string, string> = {};
  if (error.minimum !== undefined) params["min"] = String(error.minimum);
  if (error.maximum !== undefined) params["max"] = String(error.maximum);
  return (t as (c: string, p?: Record<string, string>) => string)(error.message, params);
}

function esClaveApi(s: string): boolean {
  return Object.hasOwn(diccionario(IDIOMA_RAIZ).api, s);
}
