import type { TipoNotificacion } from "@/config/constants";

/**
 * Nombre HUMANO de cada tipo de notificación en el panel (filtro y tabla del inspector). `Record` sobre
 * la unión: un tipo nuevo sin su etiqueta no compila, en vez de salir en el panel como un código.
 */
export const ETIQUETA_TIPO: Record<TipoNotificacion, string> = {
  VIDEO_LISTO: "Vídeo publicado",
  VIDEO_FALLIDO: "Vídeo no publicado",
  VOTO_RECIBIDO: "Voto recibido",
  GANASTE_RETO: "Ganó un reto",
  TOP20: "Top 20 de un reto",
  SUBISTE_NIVEL: "Subió de nivel",
  ANUNCIO: "Anuncio",
};
