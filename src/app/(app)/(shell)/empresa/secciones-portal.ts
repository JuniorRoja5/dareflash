/**
 * LAS SECCIONES DEL PORTAL DE EMPRESA — fuente única de su pestañero (`NavPortal`).
 *
 * SOLO LAS QUE EXISTEN. "Campañas" no está aquí todavía, y no es un olvido: una
 * pestaña que lleva a un "próximamente" es una promesa con fecha que nadie vigila, y sobrevive a su
 * fase. Cada sección entra en esta lista EN LA MISMA PIEZA que construye su página, y un test
 * (`empresa-shell`) comprueba que toda entrada tiene su `page.tsx`.
 *
 * Pura: la lee una isla cliente.
 */
export interface SeccionPortal {
  readonly href: string;
  readonly nombre: string;
}

export const SECCIONES_PORTAL: readonly SeccionPortal[] = [
  { href: "/empresa", nombre: "Resumen" },
  // Fase 9 · P3: sus propuestas de reto patrocinado y su extracto. Entra con su página, como dice arriba.
  { href: "/empresa/retos", nombre: "Retos" },
  // fase9-diseno: el historial entero de créditos de publicidad, paginado. El Resumen enseña el saldo.
  { href: "/empresa/creditos", nombre: "Créditos" },
  { href: "/empresa/cuenta", nombre: "Cuenta" },
];

/**
 * Sección activa para una ruta. La raíz SOLO es activa en sí misma —si no, "Resumen" se
 * encendería en todas—; el resto, en sí mismas y en sus subrutas. Pura.
 */
export function seccionPortalActiva(pathname: string): string | null {
  for (const s of SECCIONES_PORTAL) {
    if (s.href === "/empresa") {
      if (pathname === s.href) return s.href;
    } else if (pathname === s.href || pathname.startsWith(`${s.href}/`)) {
      return s.href;
    }
  }
  return null;
}
