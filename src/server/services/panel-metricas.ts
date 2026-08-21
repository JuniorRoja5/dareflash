/**
 * Métricas REALES del Resumen del panel. SOLO datos que ya existen en la BD (conteos de retos por estado
 * y usuarios): CERO cifras inventadas. Lo que aún no tiene backend (dinero/monedero, participaciones,
 * ranking) NO se calcula aquí — el Resumen lo muestra como "próximamente", no como un 0 engañoso.
 */
import "server-only";

import type { Db } from "@/server/db/types";

export interface MetricasPanel {
  retosTotal: number;
  retosPublicados: number;
  retosBorradores: number;
  usuarios: number;
}

/**
 * Conteos en paralelo. Los retos por estado se agrupan en UNA consulta (`groupBy status`) y el total se
 * deriva sumando (evita una consulta extra y que total y desglose se contradigan). CLOSED existe en el
 * dominio pero hoy no hay cierre automático; se ignora en el desglose y se cuenta solo en el total.
 */
export async function metricasPanel(db: Db): Promise<MetricasPanel> {
  const [porEstado, usuarios] = await Promise.all([
    db.challenge.groupBy({ by: ["status"], _count: { _all: true } }),
    db.user.count(),
  ]);

  const cuenta = (estado: string) => porEstado.find((g) => g.status === estado)?._count._all ?? 0;
  const retosTotal = porEstado.reduce((acc, g) => acc + g._count._all, 0);

  return {
    retosTotal,
    retosPublicados: cuenta("PUBLISHED"),
    retosBorradores: cuenta("DRAFT"),
    usuarios,
  };
}
