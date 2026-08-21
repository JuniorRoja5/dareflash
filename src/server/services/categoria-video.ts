/**
 * Resolución de la CATEGORÍA de un vídeo (Fase 2 · 2c). FUENTE ÚNICA compartida por feed y perfil:
 *  - con una Submission PUBLICADA -> la categoría del RETO (Submission->Challenge). El reto manda.
 *  - sin Submission publicada     -> la categoría propia del vídeo LIBRE (`Video.category`).
 * Devuelve la KEY de CATEGORIES (o null si no hay). La vista la traduce a etiqueta con `nombreCategoria`.
 * PURA y testeable. NO duplica la categoría del reto en el Video: aquí sólo se ELIGE de dónde leerla.
 */
export function categoriaKeyDeVideo(v: {
  submission: { status: string; challenge: { category: string } } | null;
  category: string | null;
}): string | null {
  if (v.submission && v.submission.status === "PUBLISHED") return v.submission.challenge.category;
  return v.category;
}
