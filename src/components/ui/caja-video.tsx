import type { ReactNode } from "react";

/**
 * CAJA DE VÍDEO — regla CERRADA de formato: **16:9 en ESCRITORIO (lg+)** y **9:16 en MÓVIL**.
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
 */
export function CajaVideo({
  children,
  overlays,
  className = "",
}: {
  children?: ReactNode;
  overlays?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative aspect-[9/16] overflow-hidden lg:aspect-video ${className}`}>
      {/* Capa de blurred-fill (fondo). Placeholder; con Bunny: el propio vídeo difuminado y escalado. */}
      <div aria-hidden className="absolute inset-0 bg-raised" />
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
