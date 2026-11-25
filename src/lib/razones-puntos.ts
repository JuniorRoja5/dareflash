/**
 * EL MOTIVO DE UN MOVIMIENTO DE PUNTOS, EN CASTELLANO (puro).
 *
 * DOS JUEGOS DE COPY PARA LAS MISMAS RAZONES, y no es duplicar por duplicar: el panel mira la cuenta
 * de OTRO ("Ganó un reto", "Invitó a un amigo") y el dueño mira la suya ("Ganaste un reto"). Un solo
 * juego obliga a que uno de los dos lea raro, y el que leería raro es el usuario, que es quien más
 * veces va a estar delante.
 *
 * VIVE EN `lib` Y NO EN EL COMPONENTE DEL PANEL porque ahora lo usan los dos sitios, y una copia en
 * cada uno se desincroniza en cuanto se añada una razón: la segunda pantalla seguiría enseñando el
 * código crudo sin que nada fallara.
 *
 * UNA RAZÓN SIN COPY SE ENSEÑA TAL CUAL. Es feo a propósito: un código raro a la vista se arregla; una
 * etiqueta inventada ("Bonus") se queda para siempre diciendo algo que no es. `tests/razones-puntos`
 * exige que toda razón del catálogo tenga las dos, así que el caso solo se da con una razón nueva sin
 * declarar.
 */
import { ACCIONES_PUNTOS, RAZON_AJUSTE_ADMIN } from "@/config/constants";

/** Todas las razones que el producto puede escribir en el ledger: el catálogo + el ajuste manual. */
export const RAZONES_CONOCIDAS: readonly string[] = [
  ...ACCIONES_PUNTOS.map((a) => a.razon),
  RAZON_AJUSTE_ADMIN,
];

/** Copy del PANEL: tercera persona, porque se está mirando la cuenta de otra persona. */
const EN_TERCERA: Record<string, string> = {
  WIN_CHALLENGE: "Ganó un reto",
  TOP20: "Top 20 de un reto",
  VIDEOS_PUBLICADOS: "Hito de vídeos publicados",
  INVITE_FRIEND: "Invitó a un amigo",
  REGISTERED_WITH_REFERRAL: "Se registró con una invitación",
  RACHA_7_DIAS: "Racha de 7 días",
  VIDEO_50_LIKES: "50 likes en un vídeo",
  [RAZON_AJUSTE_ADMIN]: "Ajuste manual",
};

/** Motivo en tercera persona (panel). Una razón desconocida se devuelve tal cual. */
export function razonHumana(razon: string): string {
  return EN_TERCERA[razon] ?? razon;
}

/**
 * LA VOZ PROPIA («Ganaste un reto»), la del historial de cada persona. Desde la P5b2a sus palabras viven
 * en el diccionario (`razonesPuntos.propia_*`) y las pone `razonPropia` (src/textos/razones-puntos.ts):
 * aquí queda la DECISIÓN de qué frase toca, que es lo que se prueba. El ajuste del equipo se dice por su
 * SIGNO —«te añadió» o «te retiró»—, sin repetir la cifra ni contar el porqué (la nota es interna); sin
 * importe, la frase neutra. Una razón desconocida no tiene clave: se dice TAL CUAL (`null`).
 */
export type ClaveRazonPropia =
  | "WIN_CHALLENGE"
  | "TOP20"
  | "VIDEOS_PUBLICADOS"
  | "INVITE_FRIEND"
  | "REGISTERED_WITH_REFERRAL"
  | "RACHA_7_DIAS"
  | "VIDEO_50_LIKES"
  | "ADMIN_AJUSTE"
  | "ajusteSuma"
  | "ajusteResta";

const PROPIAS = new Set<string>(RAZONES_CONOCIDAS);

export function claveRazonPropia(razon: string, delta?: number): ClaveRazonPropia | null {
  if (razon === RAZON_AJUSTE_ADMIN && typeof delta === "number" && delta !== 0) {
    return delta > 0 ? "ajusteSuma" : "ajusteResta";
  }
  return PROPIAS.has(razon) ? (razon as ClaveRazonPropia) : null;
}
