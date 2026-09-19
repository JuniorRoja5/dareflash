/**
 * EL ENLACE A UN COMENTARIO — fuente única de la URL del deep-link.
 *
 * No hay página por vídeo (todavía), así que un comentario se abre en el FEED: el feed entra por ese
 * vídeo, abre su panel de comentarios y ancla el comentario. Lo construye el aviso COMENTARIO y lo lee
 * la página del feed; si los nombres de los parámetros vivieran en los dos sitios, cambiar uno rompería
 * el enlace en silencio.
 */
export const PARAM_VIDEO = "video";
export const PARAM_COMENTARIO = "comentario";

/** `/feed?video=…&comentario=…`. Ruta local, ambos valores escapados. */
export function enlaceComentario(videoId: string, commentId: string): string {
  const q = new URLSearchParams({ [PARAM_VIDEO]: videoId, [PARAM_COMENTARIO]: commentId });
  return `/feed?${q.toString()}`;
}
