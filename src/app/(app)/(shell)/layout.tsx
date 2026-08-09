import type { ReactNode } from "react";

import { BarraSuperior } from "./barra-superior";

/**
 * SHELL DE ESCRITORIO (grupo `(shell)`). Envuelve las secciones normales (Inicio, Retos, Ranking,
 * Perfil, Crear, Reto por dentro) con la BARRA SUPERIOR de escritorio + una region de contenido que
 * puede aprovechar el ancho. En movil no hay barra superior (la nav es la inferior del chrome) y se
 * reserva el hueco de esa barra (`pb-24`). El `/feed` queda FUERA de este grupo -> sin shell.
 *
 * En ESTA rama las secciones solo van "envueltas": su interior no se re-maqueta (eso es en ramas
 * posteriores). La rejilla ancha multicolumna se construira sobre esta region entonces.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      {/* Barra superior: solo escritorio */}
      <div className="hidden lg:block">
        <BarraSuperior />
      </div>

      {/* Region de contenido: hueco para la barra inferior en movil; en escritorio, ancho disponible. */}
      <div className="pb-24 lg:pb-0">{children}</div>
    </div>
  );
}
