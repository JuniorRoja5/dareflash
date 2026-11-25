/**
 * LAS PALABRAS DE LOS PUNTOS EN EL IDIOMA DE LA PÁGINA (Fase 11 · P5b2a). Puras y sin diccionarios:
 * reciben la `t` del espacio, igual que `nombreDeCategoria`.
 *  - `razonPropia`: el motivo de un movimiento en el historial PROPIO. Qué frase toca lo decide
 *    `claveRazonPropia` (lib/razones-puntos); una razón desconocida se dice TAL CUAL.
 *  - `etiquetaAccion`: cada acción de la tabla «Cómo ganar puntos», con su cifra desde la config.
 */
import {
  LIKES_PARA_HITO,
  RACHA_DIAS_PREMIO,
  RAZON_HITO_LIKES,
  RAZON_HITO_VIDEOS,
  RAZON_INVITO_AMIGO,
  RAZON_RACHA,
  RAZON_REGISTRO_CON_REFERIDO,
  VIDEOS_POR_HITO,
} from "@/config/constants";
import { claveRazonPropia } from "@/lib/razones-puntos";

import type { FuncionT } from "./plantilla";
import type { Textos } from "./servidor";

export function razonPropia(
  t: FuncionT<Textos["razonesPuntos"]>,
  razon: string,
  delta?: number,
): string {
  const clave = claveRazonPropia(razon, delta);
  return clave ? t(`propia_${clave}`) : razon;
}

/** La etiqueta de una acción del catálogo, o la razón TAL CUAL si no es una de ellas. */
export function etiquetaAccion(t: FuncionT<Textos["puntos"]>, razon: string): string {
  switch (razon) {
    case "WIN_CHALLENGE":
      return t("accion_WIN_CHALLENGE");
    case "TOP20":
      return t("accion_TOP20");
    case RAZON_HITO_VIDEOS:
      return t("accion_VIDEOS_PUBLICADOS", { n: VIDEOS_POR_HITO });
    case RAZON_INVITO_AMIGO:
      return t("accion_INVITE_FRIEND");
    case RAZON_REGISTRO_CON_REFERIDO:
      return t("accion_REGISTERED_WITH_REFERRAL");
    case RAZON_RACHA:
      return t("accion_RACHA_7_DIAS", { n: RACHA_DIAS_PREMIO });
    case RAZON_HITO_LIKES:
      return t("accion_VIDEO_50_LIKES", { n: LIKES_PARA_HITO });
    default:
      return razon;
  }
}
