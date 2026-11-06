/**
 * LA MODERACIÓN POSTERIOR DE LA PUBLICIDAD, DEL LADO DEL ADMIN (Fase 9 · P8): el listado del panel, el
 * contador del menú, la ficha, RETIRAR con motivo y ABSOLVER.
 *
 * ┌─ SE MONTA SOBRE LA MÁQUINA QUE YA EXISTE (§6.4 del plan) ──────────────────────────────────────┐
 * │ Denunciar, el umbral y la inmunidad son los de los vídeos (`denuncias.ts`, `ocultado-automatico`):│
 * │ aquí no se reinventa nada de eso. Lo propio de la publicidad es lo que le pasa a una campaña al  │
 * │ decidir —liberar plazas, avisar a una empresa, dejar de servirse al momento— y que la decide el  │
 * │ ADMIN, no la cola de moderación de vídeos: retirar una campaña es una decisión comercial.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ «AL MOMENTO» QUIERE DECIR DESPUÉS DE CONFIRMAR ───────────────────────────────────────────────┐
 * │ La caché de campañas servibles (`campanasDeHoy`) se vacía DESPUÉS del commit: dentro de la       │
 * │ transacción, otra petición podría rellenarla con lo de antes y servir la campaña retirada 60 s   │
 * │ más. Y es una caché POR PROCESO: con un solo `web` basta vaciarla aquí; con varias instancias,   │
 * │ habría que avisar a todas (ver el docblock de la caché).                                         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LO INTERNO NO SALE: la nota de la retirada y quién la firmó se quedan en el panel y en el AuditLog. A
 * la empresa le llega el MOTIVO de la lista cerrada, en el portal y por correo, y nada más.
 */
import "server-only";

import {
  type AlcancePublicidad,
  ETIQUETA_MOTIVO_RETIRADA_PUBLICIDAD,
  type EstadoPublicidad,
  type EstadoVisiblePublicidad,
  MSG_MOTIVO_RETIRADA_PUBLICIDAD,
  type MotivoRetiradaPublicidad,
  MotivoRetiradaPublicidadSchema,
  PUBLICIDAD_PANEL_PAGINA,
  type ReportReason,
} from "@/config/constants";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  codificarCursorTiempo,
  conKeysetTiempo,
  decodificarCursorTiempo,
} from "@/lib/cursor-tiempo";
import { diaDe, estadoVisiblePublicidad } from "@/lib/publicidad";
import type { Db } from "@/server/db/types";

import { levantarAutoOcultoEnTx, sellarDescarteEnTx } from "./ocultado-automatico";
import { calendarios, nombresDeEstados, zonaLegible } from "./publicidad";

// ---------------------------------------------------------------------------------------------------
// El listado y el contador
// ---------------------------------------------------------------------------------------------------

/**
 * LOS FILTROS DEL LISTADO. «En revisión» es lo que espera una decisión (la pausó el umbral); «con
 * denuncias», lo que tiene alguna abierta sin haber llegado al umbral.
 */
export const FILTROS_PUBLICIDAD_PANEL = [
  "REVISION",
  "DENUNCIADAS",
  "ACTIVAS",
  "RETIRADAS",
  "TODAS",
] as const;
export type FiltroPublicidadPanel = (typeof FILTROS_PUBLICIDAD_PANEL)[number];

/** El filtro EN REVISIÓN, en un solo sitio: lo usan la lista y el contador del menú. */
const EN_REVISION = {
  estado: "PAUSADA",
  ocultoAutoEn: { not: null },
} satisfies Prisma.PublicidadWhereInput;

/**
 * CUÁNTAS ESPERAN DECISIÓN: el número de la insignia del menú. Sale del MISMO filtro que la lista
 * «En revisión», así que el número y las filas no pueden decir cosas distintas. Va sobre el índice de
 * `ocultoAutoEn`: el panel lo pide en cada página.
 */
export function contarPublicidadEnRevision(db: Db): Promise<number> {
  return db.publicidad.count({ where: EN_REVISION });
}

/** Ids de las campañas con alguna denuncia ABIERTA (pocas: no crece con el inventario). */
async function idsConDenunciasAbiertas(db: Db): Promise<string[]> {
  const filas = await db.report.findMany({
    where: { targetType: "PUBLICIDAD", status: "OPEN" },
    distinct: ["targetId"],
    select: { targetId: true },
  });
  return filas.map((f) => f.targetId);
}

async function filtroDe(
  db: Db,
  filtro: FiltroPublicidadPanel,
): Promise<Prisma.PublicidadWhereInput> {
  switch (filtro) {
    case "REVISION":
      return EN_REVISION;
    case "DENUNCIADAS":
      // Con alguna denuncia abierta (las que están en revisión también la tienen: salen en los dos).
      return { id: { in: await idsConDenunciasAbiertas(db) } };
    case "ACTIVAS":
      return { estado: "ACTIVA" };
    case "RETIRADAS":
      return { estado: "RETIRADA" };
    case "TODAS":
      return { estado: { not: "BORRADOR" } };
  }
}

/** Una fila del listado del panel. El admin SÍ ve de qué empresa es (es su trabajo). */
export interface PublicidadEnPanel {
  id: string;
  nombre: string;
  empresa: { id: string; nombre: string };
  estado: EstadoVisiblePublicidad;
  alcance: AlcancePublicidad;
  zona: string;
  denunciasAbiertas: number;
  creadaMs: number;
}

const SELECT_PANEL = {
  id: true,
  nombre: true,
  estado: true,
  alcance: true,
  estadoCodigo: true,
  ocultoAutoEn: true,
  createdAt: true,
  empresa: { select: { id: true, nombre: true } },
  ciudad: { select: { nombre: true, estadoNombre: true } },
  paises: { select: { paisIso: true } },
} as const;

async function denunciasPorCampana(db: Db, ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const filas = await db.report.groupBy({
    by: ["targetId"],
    where: { targetType: "PUBLICIDAD", status: "OPEN", targetId: { in: [...ids] } },
    _count: { _all: true },
  });
  return new Map(filas.map((f) => [f.targetId, f._count._all]));
}

/** EL LISTADO DEL PANEL, por KEYSET sobre (createdAt, id), con el filtro compuesto con AND. */
export async function listarPublicidadPanel(
  db: Db,
  opciones: { filtro?: FiltroPublicidadPanel; cursor?: string | null; ahora?: Date } = {},
): Promise<{ items: PublicidadEnPanel[]; nextCursor: string | null }> {
  const ahora = opciones.ahora ?? new Date();
  const filtro = await filtroDe(db, opciones.filtro ?? "REVISION");
  const filas = await db.publicidad.findMany({
    where: conKeysetTiempo(filtro, decodificarCursorTiempo(opciones.cursor)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PUBLICIDAD_PANEL_PAGINA + 1,
    select: SELECT_PANEL,
  });
  const hayMas = filas.length > PUBLICIDAD_PANEL_PAGINA;
  const pagina = hayMas ? filas.slice(0, PUBLICIDAD_PANEL_PAGINA) : filas;
  const ids = pagina.map((f) => f.id);
  const [cals, estados, denuncias] = await Promise.all([
    calendarios(db, ids, ahora),
    nombresDeEstados(
      db,
      pagina.flatMap((f) => (f.estadoCodigo ? [f.estadoCodigo] : [])),
    ),
    denunciasPorCampana(db, ids),
  ]);
  const ultima = pagina.at(-1);
  return {
    items: pagina.map((f) => {
      const cal = cals.get(f.id);
      return {
        id: f.id,
        nombre: f.nombre,
        empresa: f.empresa,
        estado: estadoVisiblePublicidad(
          f.estado as EstadoPublicidad,
          { ocupaHoy: cal?.ocupaHoy ?? false, ocupaDespues: cal?.ocupaDespues ?? false },
          f.ocultoAutoEn !== null,
        ),
        alcance: f.alcance as AlcancePublicidad,
        zona: zonaLegible(f, estados),
        denunciasAbiertas: denuncias.get(f.id) ?? 0,
        creadaMs: f.createdAt.getTime(),
      };
    }),
    nextCursor:
      hayMas && ultima
        ? codificarCursorTiempo({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// La ficha
// ---------------------------------------------------------------------------------------------------

export interface FichaPublicidadPanel extends PublicidadEnPanel {
  texto: string;
  destinoUrl: string;
  imagen: string | null;
  /** Las denuncias abiertas, contadas por motivo (sin quién: el panel no abre la lista de denunciantes). */
  motivos: { motivo: ReportReason; cuantas: number }[];
  retirada: {
    motivo: string;
    /** La nota interna: SOLO para el panel. */
    nota: string | null;
    en: number;
  } | null;
}

export async function fichaPublicidadPanel(
  db: Db,
  publicidadId: string,
  ahora: Date = new Date(),
): Promise<FichaPublicidadPanel | null> {
  const f = await db.publicidad.findUnique({
    where: { id: publicidadId },
    select: {
      ...SELECT_PANEL,
      texto: true,
      destinoUrl: true,
      imagen: true,
      retiradaMotivo: true,
      retiradaNota: true,
      retiradaEn: true,
    },
  });
  if (!f) return null;
  const [cals, estados, porMotivo] = await Promise.all([
    calendarios(db, [f.id], ahora),
    nombresDeEstados(db, f.estadoCodigo ? [f.estadoCodigo] : []),
    db.report.groupBy({
      by: ["reason"],
      where: { targetType: "PUBLICIDAD", targetId: f.id, status: "OPEN" },
      _count: { _all: true },
    }),
  ]);
  const cal = cals.get(f.id);
  const motivo = MotivoRetiradaPublicidadSchema.safeParse(f.retiradaMotivo);
  return {
    id: f.id,
    nombre: f.nombre,
    empresa: f.empresa,
    estado: estadoVisiblePublicidad(
      f.estado as EstadoPublicidad,
      { ocupaHoy: cal?.ocupaHoy ?? false, ocupaDespues: cal?.ocupaDespues ?? false },
      f.ocultoAutoEn !== null,
    ),
    alcance: f.alcance as AlcancePublicidad,
    zona: zonaLegible(f, estados),
    denunciasAbiertas: porMotivo.reduce((s, m) => s + m._count._all, 0),
    creadaMs: f.createdAt.getTime(),
    texto: f.texto,
    destinoUrl: f.destinoUrl,
    imagen: f.imagen,
    motivos: porMotivo
      .map((m) => ({ motivo: m.reason as ReportReason, cuantas: m._count._all }))
      .sort((a, b) => b.cuantas - a.cuantas),
    retirada:
      f.estado === "RETIRADA" && motivo.success && f.retiradaEn
        ? {
            motivo: ETIQUETA_MOTIVO_RETIRADA_PUBLICIDAD[motivo.data],
            nota: f.retiradaNota,
            en: f.retiradaEn.getTime(),
          }
        : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// Retirar y absolver
// ---------------------------------------------------------------------------------------------------

export const ACCION_RETIRAR_PUBLICIDAD = "PUBLICIDAD_RETIRADA";
export const ACCION_ABSOLVER_PUBLICIDAD = "PUBLICIDAD_ABSUELTA";

export type ResultadoDecisionPublicidad =
  | { estado: "hecho" }
  | { estado: "sin_cambios" }
  | { estado: "rechazado"; motivo: "NO_EXISTE" | "NO_SE_PUEDE" };

/** Cierra las denuncias ABIERTAS de una campaña. Devuelve cuántas. */
async function cerrarDenunciasPublicidad(
  tx: Db,
  publicidadId: string,
  estado: "RESOLVED" | "DISMISSED",
): Promise<number> {
  const r = await tx.report.updateMany({
    where: { targetType: "PUBLICIDAD", targetId: publicidadId, status: "OPEN" },
    data: { status: estado },
  });
  return r.count;
}

/** El correo y el nombre de la empresa dueña, para avisarla. */
async function duenaDe(tx: Db, publicidadId: string) {
  return tx.publicidad.findUnique({
    where: { id: publicidadId },
    select: {
      nombre: true,
      empresa: { select: { nombre: true, user: { select: { email: true } } } },
    },
  });
}

async function vaciarCache(): Promise<void> {
  const { olvidarCacheDeHoy } = await import("./publicidad-entrega");
  olvidarCacheDeHoy();
}

/**
 * RETIRA UNA CAMPAÑA (solo ADMIN). Pasa a RETIRADA con su motivo —de la lista cerrada— y una nota
 * interna opcional; libera sus días por venir (si no, una campaña retirada seguiría bloqueando una de las
 * plazas de su zona); cierra sus denuncias como RESOLVED; deja traza en AuditLog; y le escribe a la
 * empresa con el MOTIVO (la nota no). Todo en la misma transacción. Los días ya mostrados no se
 * devuelven (acordado). Y deja de servirse AL MOMENTO: la caché se vacía al confirmar.
 *
 * Se puede retirar lo que se sirve o podría volver a servirse: activa, programada, pausada o en
 * revisión. Un borrador no ha salido nunca, y una terminada o retirada ya no saldrá.
 */
export async function retirarPublicidad(
  db: PrismaClient,
  entrada: {
    publicidadId: string;
    adminId: string;
    motivo: MotivoRetiradaPublicidad;
    nota?: string | null;
    appUrl: string;
    ahora?: Date;
  },
): Promise<ResultadoDecisionPublicidad> {
  const ahora = entrada.ahora ?? new Date();
  const r = await db.$transaction(async (tx): Promise<ResultadoDecisionPublicidad> => {
    const filas = await tx.$queryRaw<{ estado: string }[]>`
      SELECT \`estado\` FROM \`Publicidad\` WHERE \`id\` = ${entrada.publicidadId} FOR UPDATE`;
    const estado = filas[0]?.estado;
    if (!estado) return { estado: "rechazado", motivo: "NO_EXISTE" };
    if (estado === "RETIRADA") return { estado: "sin_cambios" };
    if (estado !== "ACTIVA" && estado !== "PAUSADA") {
      return { estado: "rechazado", motivo: "NO_SE_PUEDE" };
    }
    // Ya no está «en revisión»: está decidida. El auto-oculto se levanta por SU puerta, la única
    // (`levantarAutoOcultoEnTx`), igual que hace la retirada de un vídeo; nunca con un `null` a mano.
    await levantarAutoOcultoEnTx(tx, { targetType: "PUBLICIDAD", targetId: entrada.publicidadId });
    await tx.publicidad.update({
      where: { id: entrada.publicidadId },
      data: {
        estado: "RETIRADA",
        retiradaMotivo: entrada.motivo,
        retiradaNota: entrada.nota?.trim() || null,
        retiradaPor: entrada.adminId,
        retiradaEn: ahora,
      },
    });
    await tx.zonaOcupacion.deleteMany({
      where: { publicidadId: entrada.publicidadId, dia: { gt: diaDe(ahora) } },
    });
    const cerradas = await cerrarDenunciasPublicidad(tx, entrada.publicidadId, "RESOLVED");
    await tx.auditLog.create({
      data: {
        actorId: entrada.adminId,
        action: ACCION_RETIRAR_PUBLICIDAD,
        targetType: "PUBLICIDAD",
        targetId: entrada.publicidadId,
        metadata: { motivo: entrada.motivo, denunciasCerradas: cerradas },
      },
    });
    await avisarEmpresaEnTx(tx, entrada.publicidadId, entrada.appUrl, ahora, {
      clave: `publicidad-retirada:${entrada.publicidadId}`,
      titulo: "Hemos retirado tu campaña",
      cuerpo: (nombre) =>
        `Hemos retirado «${nombre}» y ya no se muestra. ${MSG_MOTIVO_RETIRADA_PUBLICIDAD[entrada.motivo]}`,
      nota: "Si crees que es un error, contesta a este correo y lo volvemos a mirar.",
    });
    return { estado: "hecho" };
  });
  if (r.estado === "hecho") await vaciarCache();
  return r;
}

/**
 * ABSUELVE UNA CAMPAÑA DENUNCIADA (solo ADMIN): sus denuncias abiertas pasan a DISMISSED y se SELLA la
 * absolución —durante la inmunidad, el umbral no la vuelve a ocultar (el candado de siempre)—. Si el
 * umbral la había pausado, se levanta: queda como una PAUSADA normal y la empresa recibe un correo para
 * reanudarla ella (volver a ocupar plaza y comprometer saldo es decisión suya).
 */
export async function absolverPublicidad(
  db: PrismaClient,
  entrada: { publicidadId: string; adminId: string; appUrl: string; ahora?: Date },
): Promise<ResultadoDecisionPublicidad> {
  const ahora = entrada.ahora ?? new Date();
  return db.$transaction(async (tx): Promise<ResultadoDecisionPublicidad> => {
    const existe = await tx.publicidad.findUnique({
      where: { id: entrada.publicidadId },
      select: { id: true },
    });
    if (!existe) return { estado: "rechazado", motivo: "NO_EXISTE" };
    const objeto = { targetType: "PUBLICIDAD" as const, targetId: entrada.publicidadId };
    const levantado = await levantarAutoOcultoEnTx(tx, objeto);
    const cerradas = await cerrarDenunciasPublicidad(tx, entrada.publicidadId, "DISMISSED");
    // Como en los vídeos: el juicio se sella solo si de verdad había algo que juzgar (si no, sería
    // regalar inmunidad por pulsar un botón).
    if (cerradas > 0) await sellarDescarteEnTx(tx, objeto, ahora);
    if (!levantado && cerradas === 0) return { estado: "sin_cambios" };
    await tx.auditLog.create({
      data: {
        actorId: entrada.adminId,
        action: ACCION_ABSOLVER_PUBLICIDAD,
        targetType: "PUBLICIDAD",
        targetId: entrada.publicidadId,
        metadata: { denunciasDescartadas: cerradas, levantada: levantado },
      },
    });
    if (levantado) {
      await avisarEmpresaEnTx(tx, entrada.publicidadId, entrada.appUrl, ahora, {
        clave: `publicidad-absuelta:${entrada.publicidadId}:${ahora.getTime()}`,
        titulo: "Hemos revisado tu campaña: puedes reanudarla",
        cuerpo: (nombre) =>
          `Hemos revisado «${nombre}» tras unas denuncias y está todo en orden. Sigue pausada: puedes reanudarla desde tu portal cuando quieras.`,
        nota: "Al reanudarla se reservan los días que le quedan, si hay plaza en su zona.",
      });
    }
    return { estado: "hecho" };
  });
}

/** El correo a la empresa (un hecho, un correo, con su clave). Sin correo de la cuenta, no se encola. */
async function avisarEmpresaEnTx(
  tx: Db,
  publicidadId: string,
  appUrl: string,
  ahora: Date,
  m: { clave: string; titulo: string; cuerpo: (nombre: string) => string; nota: string },
): Promise<void> {
  const d = await duenaDe(tx, publicidadId);
  const email = d?.empresa.user.email;
  if (!email) return;
  const { enqueueEmail } = await import("@/server/email/send");
  const { renderCorreoHtml } = await import("@/server/email/plantilla");
  const enlace = new URL(`/empresa/publicidad/${publicidadId}`, appUrl).toString();
  const cuerpo = m.cuerpo(d.nombre);
  await enqueueEmail(
    tx,
    {
      to: email,
      subject: m.titulo,
      text: [cuerpo, "", `Tu campaña: ${enlace}`, "", m.nota].join("\n"),
      html: renderCorreoHtml({
        preheader: cuerpo,
        titulo: m.titulo,
        intro: cuerpo,
        cta: { texto: "Ver mi campaña", href: enlace },
        notas: [m.nota],
      }),
    },
    { idempotencyKey: m.clave, runAt: ahora },
  );
}

/** Para el formulario del panel: los motivos, en el orden en que se ofrecen. */
export const MOTIVOS_RETIRADA_PUBLICIDAD = MotivoRetiradaPublicidadSchema.options.map((clave) => ({
  clave,
  etiqueta: ETIQUETA_MOTIVO_RETIRADA_PUBLICIDAD[clave],
}));
