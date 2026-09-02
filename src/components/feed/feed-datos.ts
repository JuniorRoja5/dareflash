/**
 * FEED · formato de contadores y datos de MAQUETA que aún no tienen modelo. Los VÍDEOS del feed ya son
 * REALES (ver `src/server/services/feed.ts` y el tipo `PostFeed`); lo que sigue siendo maqueta es el
 * PANEL de comentarios de escritorio (el modelo `Comment` llega en la Fase 1).
 */

/**
 * Comentarios de MAQUETA para el PANEL de escritorio del feed (placeholder). Bastantes a proposito,
 * para que el panel se vea con SCROLL propio. Sin backend: los comentarios reales llegan con el modelo
 * `Comment` (Fase 1). Compartidos entre posts (maqueta); el panel muestra los del video activo.
 */
export const COMENTARIOS_FEED = [
  { usuario: "sara_p", texto: "Esto es otro nivel, el aterrizaje limpísimo. Mi voto." },
  { usuario: "entrenador_dani", texto: "La técnica es de manual. Bien ahí." },
  { usuario: "leo", texto: "¿Repetible en casa? Explica el calentamiento porfa." },
  { usuario: "laia10", texto: "El control es una locura, enhorabuena." },
  { usuario: "maxi_y_rocky", texto: "Lo intenté y casi me abro la cabeza, respeto." },
  { usuario: "carlos_fit", texto: "Progresión brutal desde tu último vídeo." },
  { usuario: "rae", texto: "El montaje ayuda mucho, muy limpio todo." },
  { usuario: "dario", texto: "Vengo del ranking solo para votar esto." },
  { usuario: "nico_skate", texto: "Merece estar en el podio del mes, fácil." },
  { usuario: "bea", texto: "Me has motivado a probarlo esta semana. Guardado." },
  { usuario: "kevoo", texto: "El detalle del final no me lo esperaba jaja." },
  { usuario: "noa.dance", texto: "Repítelo en cámara lenta que quiero verlo bien." },
  { usuario: "vale.mp4", texto: "Guardado para la inspiración de esta semana." },
  { usuario: "tomi_skate", texto: "El nivel del feed hoy está altísimo, madre mía." },
  { usuario: "jules", texto: "Cómo se nota el trabajo detrás. Grande." },
  { usuario: "mar_c", texto: "¿Alguien más viene a votar todos los días? jaja" },
  { usuario: "the_rai", texto: "Esto merece muchísimos más votos, en serio." },
  { usuario: "pau.gg", texto: "Justo lo que necesitaba ver hoy. Brutal." },
  { usuario: "lucia.voz", texto: "Referencia total. A por el premio." },
  { usuario: "cocina_express_maria", texto: "Distinto a lo mío pero aplaudo el nivel." },
];

/** 1 decimal, sin ".0" (1.0 -> "1", 12.4 -> "12.4"). */
function redondea1(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

/**
 * Formato COMPACTO de un contador (decision PURA, atada con dientes): < 1000 tal cual; miles -> "K";
 * millones -> "M". Se renderiza con `tabular-nums`. Romper el formato (no compactar) cae en rojo.
 */
export function formatearContador(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${redondea1(n / 1000)}K`;
  return `${redondea1(n / 1_000_000)}M`;
}
