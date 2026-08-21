import type { ReactNode } from "react";

import { nombreMostrado } from "@/lib/identidad";

import { PanelNav } from "./panel-nav";
import { protegerPanel } from "./panel-guard";
import { SalirPanel } from "./salir-panel";

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
  const admin = await protegerPanel();

  const { prisma } = await import("@/server/db/client");
  const fila = await prisma.user.findUnique({
    where: { id: admin.userId },
    select: { displayName: true, username: true },
  });
  const nombre = fila ? nombreMostrado(fila.displayName, fila.username) : "Admin";

  return (
    <div className="min-h-screen bg-void text-text">
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-line bg-surface px-5 py-3 lg:px-6">
        <span className="text-sm font-semibold tracking-widest text-text-dim uppercase">
          Panel <span className="text-text">· Admin</span>
        </span>
        <div className="ml-auto flex items-center gap-4">
          <span className="max-w-[40ch] truncate text-sm text-text-dim">{nombre}</span>
          <SalirPanel />
        </div>
      </header>
      {/* Dashboard a ANCHO COMPLETO: barra lateral persistente (escritorio) + área principal que usa todo
          el ancho restante. En móvil la barra cae a una fila superior desplazable (dentro de PanelNav). */}
      <div className="lg:flex lg:items-start">
        <aside className="lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-line lg:bg-surface/40">
          <PanelNav />
        </aside>
        <main className="min-w-0 flex-1 px-5 py-8 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
