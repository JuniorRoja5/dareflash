/**
 * COMENTARIOS — la parte PURA: qué texto vale. La usan la caja de escribir (para habilitar "Publicar")
 * y el servidor (para aceptarlo): la misma regla en los dos lados, así que la caja no promete lo que la
 * API va a rechazar.
 */
import { COMENTARIO_TEXTO_MAX } from "@/config/constants";

/** El texto tal y como se guarda: recortado, ni vacío ni pasado del tope. `null` = no vale. */
export function limpiarComentario(texto: string): string | null {
  const t = texto.trim();
  return t.length > 0 && t.length <= COMENTARIO_TEXTO_MAX ? t : null;
}
