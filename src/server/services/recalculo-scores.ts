/**
 * RECÁLCULO del `scoreAutoridad` (usuarios y retos) en el WORKER — barrido de BAJA cadencia con CURSOR
 * KEYSET ROTATORIO persistido en SystemState (mismo patrón que las reconciliaciones). Coste FIJO por
 * ciclo: cada barrido recalcula como mucho `lote` usuarios y `lote` retos a partir de su cursor; al
 * llegar al fin de la tabla reinicia el cursor (round-robin de cobertura completa). La BÚSQUEDA solo
 * LEE la columna; el CÁLCULO vive en `calcularScoreAutoridad*` (punto único de enriquecimiento).
 */
import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import {
  calcularScoreAutoridadReto,
  calcularScoreAutoridadUsuario,
} from "@/server/services/score-autoridad";
import { escribirEstado, leerEstado } from "@/server/services/system-state";

const CURSOR_USER = "recalculo_scores_user_cursor";
const CURSOR_RETO = "recalculo_scores_reto_cursor";

export interface OpcionesRecalculo {
  now?: Date;
  /** Filas (por entidad) recalculadas por barrido. */
  lote: number;
  log?: (m: string) => void;
}

export interface ResultadoRecalculo {
  usuarios: number;
  retos: number;
  reinicioUser: boolean;
  reinicioReto: boolean;
}

async function barridoUsuarios(
  db: PrismaClient,
  now: Date,
  lote: number,
): Promise<{ n: number; reinicio: boolean }> {
  const cursor = (await leerEstado(db, CURSOR_USER)) ?? "";
  const usuarios = await db.user.findMany({
    where: { id: { gt: cursor }, deletedAt: null },
    select: { id: true },
    orderBy: { id: "asc" },
    take: lote,
  });
  if (usuarios.length === 0) {
    await escribirEstado(db, CURSOR_USER, "");
    return { n: 0, reinicio: true };
  }

  const ids = usuarios.map((u) => u.id);
  // Señales por usuario: nº de vídeos PUBLISHED + fecha del más reciente (una sola consulta agregada).
  const agg = await db.video.groupBy({
    by: ["userId"],
    where: { userId: { in: ids }, status: "PUBLISHED" },
    _count: true,
    _max: { createdAt: true },
  });
  const porUsuario = new Map(agg.map((a) => [a.userId, { n: a._count, ultima: a._max.createdAt }]));

  for (const u of usuarios) {
    const s = porUsuario.get(u.id);
    const scoreAutoridad = calcularScoreAutoridadUsuario({
      videosPublicados: s?.n ?? 0,
      ultimaActividad: s?.ultima ?? null,
      now,
    });
    await db.user.update({ where: { id: u.id }, data: { scoreAutoridad } });
  }

  const reinicio = usuarios.length < lote;
  await escribirEstado(db, CURSOR_USER, reinicio ? "" : usuarios[usuarios.length - 1]!.id);
  return { n: usuarios.length, reinicio };
}

async function barridoRetos(
  db: PrismaClient,
  now: Date,
  lote: number,
): Promise<{ n: number; reinicio: boolean }> {
  const cursor = (await leerEstado(db, CURSOR_RETO)) ?? "";
  const retos = await db.challenge.findMany({
    where: { id: { gt: cursor } },
    select: { id: true, prizeAmountCents: true, deadline: true, status: true },
    orderBy: { id: "asc" },
    take: lote,
  });
  if (retos.length === 0) {
    await escribirEstado(db, CURSOR_RETO, "");
    return { n: 0, reinicio: true };
  }

  for (const r of retos) {
    const scoreAutoridad = calcularScoreAutoridadReto({
      premioCentimos: r.prizeAmountCents,
      deadline: r.deadline,
      status: r.status,
      now,
    });
    await db.challenge.update({ where: { id: r.id }, data: { scoreAutoridad } });
  }

  const reinicio = retos.length < lote;
  await escribirEstado(db, CURSOR_RETO, reinicio ? "" : retos[retos.length - 1]!.id);
  return { n: retos.length, reinicio };
}

/** Un barrido: recalcula un lote de usuarios y un lote de retos, cada uno por su cursor rotatorio. */
export async function recalcularScoresAutoridad(
  db: PrismaClient,
  opts: OpcionesRecalculo,
): Promise<ResultadoRecalculo> {
  const now = opts.now ?? new Date();
  const u = await barridoUsuarios(db, now, opts.lote);
  const r = await barridoRetos(db, now, opts.lote);
  opts.log?.(
    `[worker] scores: usuarios=${u.n}${u.reinicio ? " (cursor reiniciado)" : ""} ` +
      `retos=${r.n}${r.reinicio ? " (cursor reiniciado)" : ""}`,
  );
  return { usuarios: u.n, retos: r.n, reinicioUser: u.reinicio, reinicioReto: r.reinicio };
}
