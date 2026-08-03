import type { HTMLAttributes } from "react";

/**
 * TARJETA — superficie (--df-surface) + filete de 1 px. SIN sombra: la profundidad es luminosidad,
 * no elevacion. Radio por defecto (rounded-sm). Sin opinar sobre el contenido; el relleno se puede
 * ajustar por `className`.
 */
export function Tarjeta({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-sm border border-line bg-surface p-4 ${className}`} {...props}>
      {children}
    </div>
  );
}
