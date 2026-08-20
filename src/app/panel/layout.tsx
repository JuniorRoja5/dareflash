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
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-line bg-surface px-6 py-3">
        <span className="text-sm font-semibold tracking-widest text-text-dim uppercase">
          Panel · Admin
        </span>
        <div className="ml-auto flex items-center gap-4">
          <span className="max-w-[40ch] truncate text-sm text-text-dim">{nombre}</span>
          <SalirPanel />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:flex-row lg:gap-8">
        <PanelNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
