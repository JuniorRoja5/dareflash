/**
 * LA FRASE DE UN AVISO, EN UN IDIOMA DADO (Fase 11 · P5b4) — una sola función de composición.
 *
 * `componerAviso(fila, idioma, contexto)`: el dato lo saca `datosDeAviso` (lib/notificaciones, pura) y
 * la frase sale del diccionario del idioma QUE SE LE PASA. No lee la petición —ni cabeceras, ni
 * cookies, ni `formato-peticion`—, así que la llaman igual la página de /notificaciones (con el idioma
 * de la página), la API de la campana (con el de la cookie) y, en la P4, el worker para el título de un
 * push (con el del destinatario). Lo fija `tests/avisos-texto`.
 *
 * UN AVISO QUE NO SE SABE PINTAR (un `tipo` de otra versión, `datos` incompletos) no rompe la campana:
 * sale la frase genérica del diccionario y se anota en el log, con el `tipo` y nada más (ni el
 * usuario ni los datos de la fila). Un anuncio cuyo texto ya no existe se OMITE, como siempre.
 */
import "server-only";

import type { IdiomaDeTextos } from "@/lib/idioma-ruta";
import { IDIOMA_PSEUDO } from "@/lib/idioma-ruta";
import { datosDeAviso, type ContextoTexto } from "@/lib/notificaciones";
import { diccionario } from "@/textos/diccionarios";
import { crearT } from "@/textos/plantilla";

export interface AvisoCompuesto {
  texto: string;
  href: string;
  /** `false` = la fila no valida y lleva la frase genérica (el panel la enseña sin texto). */
  valido: boolean;
}

/** El `tipo` tal como se puede anotar: solo mayúsculas y guiones bajos, corto. */
const tipoParaLog = (tipo: unknown): string =>
  typeof tipo === "string" ? tipo.replace(/[^A-Z_]/g, "").slice(0, 40) || "?" : "?";

export function componerAviso(
  fila: { tipo: string; refType: string; refId: string; datos: unknown },
  idioma: IdiomaDeTextos,
  contexto: ContextoTexto = {},
): AvisoCompuesto | null {
  const d = diccionario(idioma);
  // El pseudo-idioma formatea como el castellano: no es un idioma de verdad.
  const formato = idioma === IDIOMA_PSEUDO ? "es" : idioma;
  const r = datosDeAviso(fila, contexto);
  if (r.estado === "omitir") return null;
  if (r.estado === "invalido") {
    console.warn(`[avisos] un aviso que no se sabe pintar: tipo=${tipoParaLog(fila.tipo)}`);
    return { texto: crearT(d.avisos, formato)("generico"), href: "/notificaciones", valido: false };
  }
  const f = r.frase;
  if ("texto" in f) return { texto: f.texto, href: r.href, valido: true };
  // La clave y sus valores los comprueba `FraseAviso` donde se escriben; `FuncionT` no estrecha un par
  // genérico, de ahí la firma suelta.
  const t = crearT(d[f.espacio], formato) as (
    c: string,
    p?: Record<string, string | number>,
  ) => string;
  return { texto: t(f.clave, "params" in f ? f.params : undefined), href: r.href, valido: true };
}
