import Link from "next/link";
import type { ReactNode } from "react";

import { nombreMostrado } from "@/lib/identidad";
import { totalPendientes } from "@/lib/pendientes-panel";

import { InsigniaPendientes } from "./insignia-pendientes";
import { PanelNav } from "./panel-nav";
import { protegerPanel } from "./panel-guard";
import { SalirPanel } from "./salir-panel";
import { ETIQUETA_ROL } from "./usuarios/etiquetas";

// NO INDEXABLE (defensa en profundidad): además del `X-Robots-Tag: noindex` global de next.config y del
// `Disallow` de robots.txt, el head del panel declara noindex explícito. Y sobre todo vive tras
// `requireRole("ADMIN")` (abajo): un crawler no llega igualmente.
export const metadata = {
  title: "Panel · DareFlash",
  robots: { index: false, follow: false },
};

/**
 * LAYOUT del PANEL DE ADMIN — FUERA del (shell) de usuario (sin barra/nav de feed/retos/buscar). Guard
 * ESTRUCTURAL en un solo punto: `protegerPanel()` (requireRole ADMIN) protege TODO el subárbol; un
 * no-admin ni ve el panel. Cabecera: identidad del admin + salir. Brand v2 (void/surface/raised).
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const quienMira = await protegerPanel();

  const { prisma } = await import("@/server/db/client");
  const { pendientesPanel } = await import("@/server/services/pendientes-panel");
  // LO QUE ESPERA AL ADMIN, una vez por página y para TODO el panel: la insignia de cada sección y
  // el total de la cabecera salen de aquí, y el Resumen lee la MISMA función. Si no, la barra diría
  // un número y la cola otro.
  const [fila, pendientes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: quienMira.userId },
      select: { displayName: true, username: true },
    }),
    pendientesPanel(prisma, quienMira.role),
  ]);
  const nombre = fila ? nombreMostrado(fila.displayName, fila.username) : "Cuenta";
  const total = totalPendientes(pendientes, quienMira.role);

  return (
    // EL PANEL ES OSCURO SIEMPRE, aunque el sitio público esté en claro: `data-theme="dark"` vuelve a
    // declarar aquí la paleta oscura (ver `globals.css`), y de este nodo hacia abajo todo la hereda.
    // Es una herramienta de trabajo con tablas densas y no se rediseña por gusto del visitante.
    <div data-theme="dark" className="min-h-screen bg-void text-text">
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-line bg-surface px-5 py-3 lg:px-6">
        {/* El rótulo dice el rol de QUIEN MIRA: desde que entran moderadores, poner "Admin" fijo
            sería mentir en la mitad de las sesiones. */}
        <span className="min-w-0 truncate text-sm font-semibold tracking-widest text-text-dim uppercase">
          Panel <span className="text-text">· {ETIQUETA_ROL[quienMira.role]}</span>
        </span>
        {/* EN MÓVIL CABE: a 390 px el total, el nombre y «Salir» no entraban en una fila y la página
            entera desbordaba en horizontal (medido: el grupo acababa en 532 px). El nombre se queda
            en escritorio —en móvil no aporta, es tu propio nombre— y la palabra junto a la insignia
            también: la cifra con su `aria-label` ya lo dice. */}
        <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
          {/* EL TOTAL DE LO QUE PIDE UNA DECISIÓN, visible desde cualquier página del panel. Lleva al
              Resumen, que es donde está desglosado ("Pendiente de ti"). Con 0 no aparece. */}
          {total > 0 ? (
            <Link
              href="/panel"
              data-pendientes-total={total}
              className="flex items-center gap-2 rounded-sm border border-line px-3 py-1.5 text-sm text-text transition-colors duration-150 ease-mechanical hover:bg-raised"
            >
              <InsigniaPendientes n={total} etiqueta={`${total} cosas esperan una decisión`} />
              <span aria-hidden="true" className="hidden sm:inline">
                {total === 1 ? "pendiente" : "pendientes"}
              </span>
            </Link>
          ) : null}
          <span className="hidden max-w-[40ch] truncate text-sm text-text-dim sm:inline">
            {nombre}
          </span>
          <SalirPanel />
        </div>
      </header>
      {/* Dashboard a ANCHO COMPLETO: barra lateral persistente (escritorio) + área principal que usa todo
          el ancho restante. En móvil la barra cae a una fila superior desplazable (dentro de PanelNav). */}
      <div className="lg:flex lg:items-start">
        <aside className="lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-line lg:bg-surface/40">
          {/* La nav solo enseña lo que ese rol alcanza: un moderador no ve Retos, DareUp ni anuncios. */}
          <PanelNav rol={quienMira.role} pendientes={pendientes} />
        </aside>
        <main className="min-w-0 flex-1 px-5 py-8 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
