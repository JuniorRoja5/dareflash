/**
 * RETOS PÚBLICOS (Tramo 1) — lo que ve el USUARIO. Solo LECTURA de retos reales:
 *   - Listado de ACTIVOS (PUBLISHED con cierre futuro), orden por cierre más próximo.
 *   - Listado de CERRADOS (cierre pasado o status CLOSED) para la pestaña aparte.
 *   - Detalle por `publicCode` (clave autoritativa) con resolución del canónico (301 si el slug no
 *     coincide) y 404 si no existe o es DRAFT (no público).
 * Sin participación/voto/comentarios (tramo siguiente). El DTO expone solo lo de la doc.
 */
import "server-only";

import type { Db } from "@/server/db/types";

/** Campos que necesita la TARJETA (doc): título, premio, cierre, categoría + la URL canónica. */
export interface RetoPublicoVista {
  publicCode: string;
  slug: string;
  titulo: string;
  categoria: string;
  premioCents: number;
  /** Cierre ABSOLUTO en ms (deadline.getTime()); el cliente pinta la cuenta atrás. */
  deadlineMs: number;
}

/** Detalle del reto (además de la tarjeta): descripción, reglas, nº de ganadores, moneda, estado. */
export interface RetoPublicoDetalle extends RetoPublicoVista {
  descripcion: string | null;
  reglas: string | null;
  winnersCount: number;
  prizeCurrency: string;
  status: string;
}

const SELECT_VISTA = {
  publicCode: true,
  slug: true,
  title: true,
  category: true,
  prizeAmountCents: true,
  deadline: true,
} as const;

type FilaVista = {
  publicCode: string;
  slug: string;
  title: string;
  category: string;
  prizeAmountCents: number;
  deadline: Date;
};

function aVista(f: FilaVista): RetoPublicoVista {
  return {
    publicCode: f.publicCode,
    slug: f.slug,
    titulo: f.title,
    categoria: f.category,
    premioCents: f.prizeAmountCents,
    deadlineMs: f.deadline.getTime(),
  };
}

/** ACTIVOS: PUBLISHED con cierre futuro, orden por cierre ASC (el que cierra antes, primero). */
export async function listarRetosPublicos(
  db: Db,
  ahora: Date,
  limite = 100,
): Promise<RetoPublicoVista[]> {
  const filas = await db.challenge.findMany({
    where: { status: "PUBLISHED", deadline: { gt: ahora } },
    orderBy: [{ deadline: "asc" }, { id: "asc" }],
    take: limite,
    select: SELECT_VISTA,
  });
  return filas.map(aVista);
}

/** CERRADOS: cierre pasado (aunque sigan PUBLISHED) o status CLOSED. Orden por cierre más reciente. */
export async function listarRetosCerrados(
  db: Db,
  ahora: Date,
  limite = 100,
): Promise<RetoPublicoVista[]> {
  const filas = await db.challenge.findMany({
    where: {
      OR: [{ status: "CLOSED" }, { status: "PUBLISHED", deadline: { lte: ahora } }],
    },
    orderBy: [{ deadline: "desc" }, { id: "asc" }],
    take: limite,
    select: SELECT_VISTA,
  });
  return filas.map(aVista);
}

/** Detalle por `publicCode`. DRAFT (no público) o inexistente -> null (el route hace 404). */
export async function retoPublicoPorCode(
  db: Db,
  publicCode: string,
): Promise<RetoPublicoDetalle | null> {
  const f = await db.challenge.findFirst({
    where: { publicCode, status: { not: "DRAFT" } },
    select: {
      ...SELECT_VISTA,
      prizeCurrency: true,
      description: true,
      rules: true,
      winnersCount: true,
      status: true,
    },
  });
  if (!f) return null;
  return {
    ...aVista(f),
    descripcion: f.description,
    reglas: f.rules,
    winnersCount: f.winnersCount,
    prizeCurrency: f.prizeCurrency,
    status: f.status,
  };
}

/** Resolución del detalle a partir del segmento `{publicCode}-{slug}`: 404, 301 al canónico, u OK. */
export type ResolucionDetalle =
  | { tipo: "ok"; reto: RetoPublicoDetalle }
  | { tipo: "redirect"; a: string }
  | { tipo: "noEncontrado" };

/** publicCode = lo anterior al PRIMER guion (los codes base32 no llevan guion; el slug sí puede). */
export function extraerPublicCode(codigo: string): string {
  const i = codigo.indexOf("-");
  return i === -1 ? codigo : codigo.slice(0, i);
}

export async function resolverRetoDetalle(db: Db, codigo: string): Promise<ResolucionDetalle> {
  const reto = await retoPublicoPorCode(db, extraerPublicCode(codigo));
  if (!reto) return { tipo: "noEncontrado" };
  const canonico = `${reto.publicCode}-${reto.slug}`;
  if (codigo !== canonico) return { tipo: "redirect", a: `/retos/${canonico}` };
  return { tipo: "ok", reto };
}
