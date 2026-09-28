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
  REGISTER_FROM_VIDEO_LINK: "Registro desde un vídeo",
  VIDEO_100_EXTERNAL_VIEWS: "100 vistas externas",
  RACHA_7_DIAS: "Racha de 7 días",
  VIDEO_50_LIKES: "50 likes en un vídeo",
  [RAZON_AJUSTE_ADMIN]: "Ajuste manual",
};

/**
 * Copy del DUEÑO: segunda persona. El ajuste manual se llama "Ajuste del equipo" y no "Ajuste
 * manual": al usuario no le dice nada que fuera manual, le dice quién lo hizo.
 */
const EN_SEGUNDA: Record<string, string> = {
  WIN_CHALLENGE: "Ganaste un reto",
  TOP20: "Entraste en el top 20",
  VIDEOS_PUBLICADOS: "Publicaste vídeos suficientes para un hito",
  INVITE_FRIEND: "Invitaste a alguien que verificó su correo",
  REGISTERED_WITH_REFERRAL: "Te registraste con una invitación",
  REGISTER_FROM_VIDEO_LINK: "Alguien se registró desde tu vídeo",
  VIDEO_100_EXTERNAL_VIEWS: "Tu vídeo llegó a 100 vistas externas",
  RACHA_7_DIAS: "Mantuviste una racha de 7 días",
  VIDEO_50_LIKES: "Tu vídeo llegó a 50 likes",
  [RAZON_AJUSTE_ADMIN]: "Ajuste del equipo",
};

/** Motivo en tercera persona (panel). Una razón desconocida se devuelve tal cual. */
export function razonHumana(razon: string): string {
  return EN_TERCERA[razon] ?? razon;
}

/** Motivo dirigido al dueño de la cuenta (su propio historial). */
export function razonHumanaPropia(razon: string): string {
  return EN_SEGUNDA[razon] ?? razon;
}
