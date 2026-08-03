import type { ReactNode } from "react";

/**
 * PILDORA DE CATEGORIA — radius-full, filete de 1 px, NEUTRA (borde --df-line, texto --df-text-dim).
 * JAMAS un color semantico: una categoria no es dinero, ni tiempo, ni accion. Es metadato, y el
 * metadato no compite con la cifra.
 */
export function PildoraCategoria({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-3 py-1 text-2xs font-medium uppercase tracking-wide text-text-dim">
      {children}
    </span>
  );
}
