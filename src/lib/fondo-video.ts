/**
 * ¿SE MONTA EL VÍDEO DE FONDO? La decisión, en un solo sitio y pura.
 *
 * ┌─ EL INVARIANTE DURO: EN MÓVIL NO SE PIDEN LOS BYTES ───────────────────────────────────────────┐
 * │ No basta con esconder el <video> con CSS: `display:none` (o `hidden`, o un `lg:block`) oculta el │
 * │ elemento pero el navegador PUEDE descargar el vídeo igual — la carga la decide el elemento, no   │
 * │ su visibilidad. La ÚNICA forma de garantizar cero bytes es NO MONTAR el elemento.                │
 * │                                                                                                 │
 * │ Y como eso exige mirar el viewport, solo se puede saber en CLIENTE: el servidor no sabe en qué   │
 * │ pantalla va a caer el HTML. Por eso el fondo se pinta SIN vídeo en el servidor y el vídeo se      │
 * │ añade después de hidratar, si toca. El primer render del cliente coincide con el del servidor,   │
 * │ así que no hay aviso de hidratación ni parpadeo.                                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * La condición es UNA sola y vive aquí para que ninguna pantalla la reimplemente con un `||` de más.
 */

/** Corte de "escritorio": el MISMO `lg` que ya usa la home (Tailwind). Sin números paralelos. */
export const ANCHO_ESCRITORIO_PX = 1024;

export const CONSULTA_ESCRITORIO = `(min-width: ${ANCHO_ESCRITORIO_PX}px)`;

/**
 * Se pregunta por `no-preference` y no por `reduce`: si el navegador no soporta la consulta, no
 * coincide, y el resultado es NO reproducir. Ante la duda, quieto — que es la regla global del brief.
 */
export const CONSULTA_MOVIMIENTO = "(prefers-reduced-motion: no-preference)";

/**
 * Las DOS condiciones tienen que cumplirse. Móvil o movimiento reducido = no se monta el vídeo y se
 * ve el velo oscuro, que ya estaba ahí desde el primer pintado.
 */
export function debeMontarVideoFondo(entorno: {
  escritorio: boolean;
  permiteMovimiento: boolean;
}): boolean {
  return entorno.escritorio && entorno.permiteMovimiento;
}
