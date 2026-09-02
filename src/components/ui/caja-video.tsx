import type { ReactNode } from "react";

/**
 * CAJA DE VÍDEO — regla CERRADA de formato, con DOS proporciones según para qué sirve la caja.
 *
 * ┌─ VISTAZO NO ES LO MISMO QUE REPRODUCCIÓN ──────────────────────────────────────────────────────┐
 * │ Esta caja nació para REPRODUCIR: 9:16 a ancho completo en móvil, que es lo correcto cuando el   │
 * │ vídeo ES la pantalla. Las REJILLAS la reutilizaron tal cual, y ahí ese mismo 9:16 significa que  │
 * │ UNA miniatura ocupa más de una pantalla de móvil: con diez participaciones, diez pantallas de    │
 * │ scroll para ver quién participa. Se vio en producción.                                          │
 * │                                                                                                 │
 * │ Por eso la proporción es ahora una DECISIÓN EXPLÍCITA del consumidor y no un valor único:        │
 * │   - `reproduccion`: el vídeo es la pantalla. 9:16 en móvil.                                     │
 * │   - `miniatura`: rejilla de vistazo. Más baja en móvil, para que quepan varias a la vez.        │
 * │ Vive AQUÍ y no como un `aspect-*` suelto en cada rejilla: si cada superficie lo decidiera por su │
 * │ cuenta, volverían a divergir —que es exactamente como llegamos hasta aquí—.                      │
 * │                                                                                                 │
 * │ En ESCRITORIO las dos son 16:9: allí el ancho sobra y la densidad la da la rejilla.              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * El vídeo se guarda tal cual se grabó y NO se recorta nunca: se CENTRA (tira 9:16) y los lados se
 * rellenan con una versión DIFUMINADA del propio vídeo (blurred-fill), jamás barras negras ni recorte.
 * En móvil la caja YA es 9:16, así que el vídeo la llena y no hay relleno visible.
 *
 * Excepción: el FEED es 9:16 inmersivo en todo y NO usa esta caja.
 *
 * MAQUETA: hoy es un placeholder. La ESTRUCTURA del blurred-fill queda lista para Bunny:
 *   - `capa de relleno` (fondo, `inset-0`): pasará a ser el `<video>` difuminado (filter: blur + scale).
 *   - `centro 9:16`: el `<video>` nítido centrado (aquí, el placeholder que se le pase por `children`).
 *
 * `overlays` se pintan SOBRE la caja (categoría, marcador, votos…). `className` estiliza la caja
 * (aspecto/borde/sombra los pone el consumidor; el aspecto por defecto ya es 9:16→16:9).
 *
 * `relleno` sustituye la capa de blurred-fill de fondo. Por defecto es el placeholder `bg-raised`;
 * el reproductor real (hls.js) le pasa el fondo difuminado (póster/vídeo escalado + blur).
 */
/** Para qué sirve la caja. Decide su proporción EN MÓVIL; en escritorio las dos son 16:9. */
export type ProporcionCaja = "reproduccion" | "miniatura";

const PROPORCION: Record<ProporcionCaja, string> = {
  // El vídeo ES la pantalla: vertical a sangre, como el feed.
  reproduccion: "aspect-[9/16] lg:aspect-video",
  // Rejilla de vistazo: 4:5 deja ver DOS filas de dos donde antes cabía media miniatura. No se
  // recorta nada —el vídeo sigue centrado con relleno difuminado a los lados—, solo se enseña menos
  // alto de una miniatura que el usuario aún no ha decidido ver.
  miniatura: "aspect-[4/5] lg:aspect-video",
};

export function CajaVideo({
  children,
  overlays,
  relleno,
  proporcion = "reproduccion",
  className = "",
}: {
  children?: ReactNode;
  overlays?: ReactNode;
  relleno?: ReactNode;
  /** `reproduccion` (por defecto, no cambia nada de lo que ya existía) o `miniatura` para rejillas. */
  proporcion?: ProporcionCaja;
  className?: string;
}) {
  return (
    <div className={`relative ${PROPORCION[proporcion]} overflow-hidden ${className}`}>
      {/* Capa de blurred-fill (fondo). Placeholder por defecto; con Bunny: el vídeo/póster difuminado. */}
      {relleno ?? <div aria-hidden className="absolute inset-0 bg-raised" />}
      {/* Vídeo nítido, CENTRADO como tira 9:16. En móvil ocupa toda la caja; en lg deja los lados al
          relleno. Filete lateral sutil en lg para leer dónde cae el vídeo real. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex aspect-[9/16] h-full items-center justify-center bg-void/25 lg:border-x lg:border-line/60">
          {children}
        </div>
      </div>
      {overlays}
    </div>
  );
}
