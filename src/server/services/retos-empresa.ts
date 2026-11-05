/**
 * RETOS PATROCINADOS PROPUESTOS POR UNA EMPRESA (Fase 9 · P3).
 *
 * El camino entero, en un sitio:
 *   1. La EMPRESA propone (`crearSolicitudReto`): nace PENDIENTE, en otra tabla, y el admin se entera
 *      en el acto (correo encolado en la MISMA transacción que la fila).
 *   2. El ADMIN la revisa en el panel y la APRUEBA (`aprobarSolicitudReto`) —nace un `Challenge` en
 *      BORRADOR, patrocinado, con la marca y el `empresaId` puestos— o la RECHAZA con un motivo de
 *      lista cerrada (`rechazarSolicitudReto`). Las dos decisiones le escriben a la empresa.
 *   3. El borrador sigue el camino de siempre: el admin pone lo que es de DareFlash (comisión, nivel,
 *      VIP, portada) y lo PUBLICA con la acción que ya existe, que es la que mira el reloj.
 *
 * ┌─ UNA PROPUESTA SIN APROBAR NO SE VE EN NINGÚN SITIO PÚBLICO, Y ES POR CONSTRUCCIÓN ───────────┐
 * │ No es un `Challenge` en otro estado: es otra tabla. Las consultas públicas de retos leen       │
 * │ `Challenge`, así que no hay ningún `where` que alguien pueda olvidar. El test                   │
 * │ `empresa-retos` lo ejecuta contra las consultas públicas de verdad y, además, vigila que       │
 * │ ningún servicio público lea `retoSolicitud`.                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL ÁMBITO: toda función que opera sobre UNA empresa recibe su `empresaId` por parámetro
 * OBLIGATORIO, y ese id sale SIEMPRE del chokepoint (`requireEmpresa`), nunca de la URL ni del
 * cuerpo. Las del panel no lo reciben porque miran la cola entera. El censo está en el test.
 *
 * NI UN CÉNTIMO AQUÍ: el patrocinio se paga por fuera y el ganador cobra el premio íntegro por el rail
 * de siempre. Ni un `FOR UPDATE` de `User` tampoco (veto de deadlock): nada de esto toca saldos.
 */
import "server-only";

import { z } from "zod";

import {
  COMISION_SPONSOR_BPS_DEFECTO,
  DEFAULT_CURRENCY,
  type EstadoRetoSolicitud,
  type EstadoVisibleSolicitud,
  MSG_MOTIVO_RECHAZO_RETO,
  MSG_PAGO_PATROCINIO,
  type MotivoRechazoReto,
  RETO_SOLICITUDES_PAGINA,
  RETO_SOLICITUDES_PENDIENTES_MAX,
  TITULO_AVISO_RETO_PROPUESTO,
  msgAvisoRetoPropuesto,
} from "@/config/constants";
import {
  codificarCursorTiempo,
  conKeysetTiempo,
  decodificarCursorTiempo,
} from "@/lib/cursor-tiempo";
import { estadoVisibleSolicitud } from "@/lib/reto-solicitud";
import { slugDesdeTitulo } from "@/lib/reto-slug";
import type { Db } from "@/server/db/types";
import { renderCorreoHtml } from "@/server/email/plantilla";
import { enqueueEmail } from "@/server/email/send";

import { crearRetoConPublicCode } from "./reto-codigo";
import { camposDeReto, conFechasDeReto } from "./retos-admin";

// ---------------------------------------------------------------------------------------------------
// Lo que propone
// ---------------------------------------------------------------------------------------------------

/**
 * LO QUE UNA EMPRESA PUEDE PROPONER: los MISMOS campos que el formulario del admin
 * (`camposDeReto`), y nada de lo que es de DareFlash —comisión, nivel, VIP, marca—, que lo pone el
 * equipo en el borrador. La marca no se escribe: es la de la empresa.
 *
 * Y UNA REGLA MÁS que el admin no tiene: el premio tiene que ser mayor que cero. Un reto patrocinado
 * sin premio no es un patrocinio, y la contabilidad (premio + comisión) sería cero sobre cero.
 */
export function solicitudRetoSchema(now: Date) {
  return conFechasDeReto(
    z.object(camposDeReto()).refine((d) => d.prizeAmountCents > 0, {
      message: "Un reto patrocinado necesita un premio.",
      path: ["prizeAmountCents"],
    }),
    now,
  );
}
export type SolicitudRetoInput = z.output<ReturnType<typeof solicitudRetoSchema>>;

export class SolicitudRetoError extends Error {
  constructor(
    public readonly code: "NO_VERIFICADA" | "DEMASIADAS_PENDIENTES",
    message: string,
  ) {
    super(message);
    this.name = "SolicitudRetoError";
  }
}

/** La clave del aviso al admin: UNO por propuesta, aunque el worker reintente. */
export function claveAvisoRetoPropuesto(solicitudId: string): string {
  return `reto-propuesto:${solicitudId}`;
}

export interface AvisoAdminReto {
  /** `null` = no hay destinatario configurado: no se encola nada y queda una línea en el log. */
  adminEmail: string | null;
  /** Enlace a la cola del panel. Un enlace, no un token: se mira con una sesión. */
  urlPanel: string;
  log?: (mensaje: string) => void;
}

/**
 * PROPONE UN RETO. Solo una empresa VERIFICADA, y con un tope de propuestas esperando a la vez.
 *
 * EL TOPE SE CUENTA, NO SE OCUPA, y es una decisión: no es dinero ni una plaza que se reparta, es un
 * freno para que una sola empresa no llene la cola de revisión. En una carrera de dos envíos a la
 * vez puede colarse una de más (la cuenta lee la instantánea, ver CLAUDE.md), y eso no le cuesta nada
 * a nadie. Ocuparlo como el cupo de Boost sería pagar una tabla y un test de concurrencia por algo que
 * no lo vale.
 *
 * EL AVISO AL ADMIN VA EN LA MISMA TRANSACCIÓN que la fila, por la cola: o existen los dos, o
 * ninguno. Un aviso fuera de la transacción es uno que se pierde si el proceso muere entre medias.
 */
export async function crearSolicitudReto(
  db: Db,
  entrada: {
    empresaId: string;
    datos: SolicitudRetoInput;
    aviso: AvisoAdminReto;
    ahora?: Date;
  },
): Promise<{ id: string }> {
  const ahora = entrada.ahora ?? new Date();
  const { datos } = entrada;
  return db.$transaction(async (tx) => {
    const empresa = await tx.empresa.findUnique({
      where: { id: entrada.empresaId },
      select: { estado: true, nombre: true },
    });
    if (empresa?.estado !== "VERIFICADA") {
      throw new SolicitudRetoError(
        "NO_VERIFICADA",
        "Podrás proponer retos en cuanto verifiquemos tu empresa.",
      );
    }
    const pendientes = await tx.retoSolicitud.count({
      where: { empresaId: entrada.empresaId, estado: "PENDIENTE" },
    });
    if (pendientes >= RETO_SOLICITUDES_PENDIENTES_MAX) {
      throw new SolicitudRetoError(
        "DEMASIADAS_PENDIENTES",
        `Ya tienes ${RETO_SOLICITUDES_PENDIENTES_MAX} propuestas esperando. En cuanto decidamos alguna, podrás enviar otra.`,
      );
    }

    const s = await tx.retoSolicitud.create({
      data: {
        empresaId: entrada.empresaId,
        title: datos.title,
        description: datos.description,
        rules: datos.rules,
        category: datos.category,
        prizeAmountCents: datos.prizeAmountCents,
        startsAt: datos.startsAt,
        deadline: datos.deadline,
        winnersCount: datos.winnersCount,
        createdAt: ahora,
      },
      select: { id: true },
    });

    if (entrada.aviso.adminEmail) {
      await enqueueEmail(
        tx,
        {
          to: entrada.aviso.adminEmail,
          subject: TITULO_AVISO_RETO_PROPUESTO,
          text: msgAvisoRetoPropuesto({
            empresa: empresa.nombre,
            titulo: datos.title,
            urlPanel: entrada.aviso.urlPanel,
          }),
        },
        { idempotencyKey: claveAvisoRetoPropuesto(s.id), runAt: ahora },
      );
    } else {
      entrada.aviso.log?.(
        "[retos-empresa] ADMIN_EMAIL sin configurar: la propuesta queda guardada y NADIE recibe el aviso.",
      );
    }
    return s;
  });
}

/**
 * Apunta el LOGO de una propuesta suya, después de guardarlo en el volumen. Solo mientras está
 * PENDIENTE (una decidida ya no se toca) y solo de SU empresa: el `where` lleva el ámbito, así que un
 * id ajeno no apunta nada.
 */
export async function apuntarLogoSolicitud(
  db: Db,
  entrada: { empresaId: string; solicitudId: string; url: string },
): Promise<boolean> {
  const r = await db.retoSolicitud.updateMany({
    where: { id: entrada.solicitudId, empresaId: entrada.empresaId, estado: "PENDIENTE" },
    data: { sponsorLogo: entrada.url },
  });
  return r.count > 0;
}

// ---------------------------------------------------------------------------------------------------
// Lo que ve la empresa
// ---------------------------------------------------------------------------------------------------

/**
 * UNA PROPUESTA, VISTA POR SU EMPRESA. Lo que NO trae, a propósito: la nota interna del equipo y quién
 * la decidió. No es que no se pinten: es que este DTO no las tiene, y el test lo fija con igualdad
 * exacta de claves (si alguien añade un campo al `select`, rojo).
 */
export interface SolicitudDeEmpresa {
  id: string;
  titulo: string;
  categoria: string;
  premioCents: number;
  aperturaMs: number;
  cierreMs: number;
  ganadores: number;
  estado: EstadoVisibleSolicitud;
  /** Clave del motivo, solo si se rechazó. El texto lo pone `MSG_MOTIVO_RECHAZO_RETO`. */
  motivoRechazo: MotivoRechazoReto | null;
  creadaMs: number;
  /** El reto, solo cuando ya está PUBLICADO: un borrador no tiene página que enlazar. */
  reto: { publicCode: string; slug: string } | null;
}

export interface PaginaSolicitudes<T> {
  items: T[];
  nextCursor: string | null;
}

/** SUS propuestas, más nuevas primero, por KEYSET. El `empresaId` sale del chokepoint. */
export async function misSolicitudesReto(
  db: Db,
  empresaId: string,
  opciones: { cursor?: string | null } = {},
): Promise<PaginaSolicitudes<SolicitudDeEmpresa>> {
  const filas = await db.retoSolicitud.findMany({
    where: conKeysetTiempo({ empresaId }, decodificarCursorTiempo(opciones.cursor)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RETO_SOLICITUDES_PAGINA + 1,
    select: {
      id: true,
      title: true,
      category: true,
      prizeAmountCents: true,
      startsAt: true,
      deadline: true,
      winnersCount: true,
      estado: true,
      motivoRechazo: true,
      createdAt: true,
      challenge: { select: { status: true, publicCode: true, slug: true } },
    },
  });
  const hayMas = filas.length > RETO_SOLICITUDES_PAGINA;
  const pagina = hayMas ? filas.slice(0, RETO_SOLICITUDES_PAGINA) : filas;
  const ultima = pagina.at(-1);
  return {
    items: pagina.map((f) => {
      const estado = estadoVisibleSolicitud(
        f.estado as EstadoRetoSolicitud,
        f.challenge?.status ?? null,
      );
      return {
        id: f.id,
        titulo: f.title,
        categoria: f.category,
        premioCents: f.prizeAmountCents,
        aperturaMs: f.startsAt.getTime(),
        cierreMs: f.deadline.getTime(),
        ganadores: f.winnersCount,
        estado,
        motivoRechazo: (f.motivoRechazo as MotivoRechazoReto | null) ?? null,
        creadaMs: f.createdAt.getTime(),
        reto:
          estado === "PUBLICADA" && f.challenge
            ? { publicCode: f.challenge.publicCode, slug: f.challenge.slug }
            : null,
      };
    }),
    nextCursor:
      hayMas && ultima
        ? codificarCursorTiempo({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// La cola del panel
// ---------------------------------------------------------------------------------------------------

/**
 * EL FILTRO DE LA COLA, en un solo sitio: lo usan la LISTA y el CONTADOR de la insignia, para que
 * "2 por revisar" y las filas de la cola no puedan discrepar (la misma regla que `filtroEmpresas`).
 */
export function filtroSolicitudesReto(estado: EstadoRetoSolicitud | null | undefined): {
  estado?: string;
} {
  return estado ? { estado } : {};
}

/** Cuántas hay en ese estado. Lee EL MISMO filtro que la cola. */
export function contarSolicitudesReto(db: Db, estado: EstadoRetoSolicitud): Promise<number> {
  return db.retoSolicitud.count({ where: filtroSolicitudesReto(estado) });
}

/** Una fila de la cola del panel. Aquí SÍ va la nota interna: es el equipo quien mira. */
export interface SolicitudPanel {
  id: string;
  empresaId: string;
  empresa: string;
  titulo: string;
  descripcion: string | null;
  reglas: string | null;
  categoria: string;
  premioCents: number;
  aperturaMs: number;
  cierreMs: number;
  ganadores: number;
  logo: string | null;
  estado: EstadoRetoSolicitud;
  motivoRechazo: MotivoRechazoReto | null;
  notaInterna: string | null;
  creadaMs: number;
  /** El borrador o reto que nació de ella: el panel enlaza a él para revisarlo y publicarlo. */
  challengeId: string | null;
}

/** LA COLA, por KEYSET, más nuevas primero. Del panel: no recibe ámbito porque mira todas. */
export async function listarSolicitudesReto(
  db: Db,
  opciones: { estado?: EstadoRetoSolicitud | null; cursor?: string | null } = {},
): Promise<PaginaSolicitudes<SolicitudPanel>> {
  const filtro = filtroSolicitudesReto(opciones.estado);
  const filas = await db.retoSolicitud.findMany({
    where: conKeysetTiempo(filtro, decodificarCursorTiempo(opciones.cursor)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RETO_SOLICITUDES_PAGINA + 1,
    select: {
      id: true,
      empresaId: true,
      title: true,
      description: true,
      rules: true,
      category: true,
      prizeAmountCents: true,
      startsAt: true,
      deadline: true,
      winnersCount: true,
      sponsorLogo: true,
      estado: true,
      motivoRechazo: true,
      notaInterna: true,
      createdAt: true,
      challengeId: true,
      empresa: { select: { nombre: true } },
    },
  });
  const hayMas = filas.length > RETO_SOLICITUDES_PAGINA;
  const pagina = hayMas ? filas.slice(0, RETO_SOLICITUDES_PAGINA) : filas;
  const ultima = pagina.at(-1);
  return {
    items: pagina.map((f) => ({
      id: f.id,
      empresaId: f.empresaId,
      empresa: f.empresa.nombre,
      titulo: f.title,
      descripcion: f.description,
      reglas: f.rules,
      categoria: f.category,
      premioCents: f.prizeAmountCents,
      aperturaMs: f.startsAt.getTime(),
      cierreMs: f.deadline.getTime(),
      ganadores: f.winnersCount,
      logo: f.sponsorLogo,
      estado: f.estado as EstadoRetoSolicitud,
      motivoRechazo: (f.motivoRechazo as MotivoRechazoReto | null) ?? null,
      notaInterna: f.notaInterna,
      creadaMs: f.createdAt.getTime(),
      challengeId: f.challengeId,
    })),
    nextCursor:
      hayMas && ultima
        ? codificarCursorTiempo({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// Decidir
// ---------------------------------------------------------------------------------------------------

export type ResultadoAprobar =
  | { estado: "aprobada"; challengeId: string; publicCode: string }
  /** Ya estaba decidida (o no existe): el doble clic acaba aquí, sin crear un segundo reto. */
  | { estado: "sin_cambios" }
  /** El cierre propuesto ya pasó: aprobarla crearía un reto que no se podría publicar. */
  | { estado: "rechazada"; motivo: "CIERRE_PASADO" };

/**
 * APRUEBA una propuesta: nace un `Challenge` en BORRADOR, patrocinado, con la marca de la empresa
 * (copiada, ver `Challenge.sponsorNombre`), su logo y su `empresaId`. La comisión es la del producto
 * (`COMISION_SPONSOR_BPS_DEFECTO`) y el admin la ajusta en el borrador si el trato es otro.
 *
 * ┌─ EL PRIMER PASO ES EL `UPDATE` QUE LA RECLAMA, NO UNA LECTURA ────────────────────────────────┐
 * │ `PENDIENTE -> APROBADA` con `updateMany` y la condición en el `WHERE`: si dos admins aprueban  │
 * │ a la vez, uno afecta a 1 fila y el otro a 0, y solo el primero crea el reto. Va PRIMERO a      │
 * │ propósito: con `innodb_snapshot_isolation`, una lectura antes fijaría la instantánea, y el     │
 * │ `UPDATE` sobre una fila que otro acaba de cambiar respondería 1020 en vez de 0 filas.          │
 * │ El cierre va en el mismo `WHERE`: una propuesta vencida no se reclama.                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Todo en UNA transacción —reclamar, crear el reto, enlazarlo, anotarlo en `AuditLog` y encolar el
 * correo a la empresa—: o pasa todo o no pasa nada. Y no publica: publicar es la acción de siempre.
 */
export async function aprobarSolicitudReto(
  db: Db,
  entrada: { solicitudId: string; actorId: string; appUrl: string; ahora?: Date },
): Promise<ResultadoAprobar> {
  const ahora = entrada.ahora ?? new Date();
  return db.$transaction(async (tx) => {
    const reclamada = await tx.retoSolicitud.updateMany({
      where: { id: entrada.solicitudId, estado: "PENDIENTE", deadline: { gt: ahora } },
      data: { estado: "APROBADA", revisadaPor: entrada.actorId, revisadaEn: ahora },
    });
    if (reclamada.count === 0) {
      // ¿Por qué no? Solo para decirlo bien: no se escribe nada.
      const s = await tx.retoSolicitud.findUnique({
        where: { id: entrada.solicitudId },
        select: { estado: true },
      });
      return s?.estado === "PENDIENTE"
        ? { estado: "rechazada", motivo: "CIERRE_PASADO" }
        : { estado: "sin_cambios" };
    }

    const s = await tx.retoSolicitud.findUniqueOrThrow({
      where: { id: entrada.solicitudId },
      select: {
        empresaId: true,
        title: true,
        description: true,
        rules: true,
        category: true,
        prizeAmountCents: true,
        startsAt: true,
        deadline: true,
        winnersCount: true,
        sponsorLogo: true,
        empresa: { select: { nombre: true } },
      },
    });

    const reto = await crearRetoConPublicCode((publicCode) =>
      tx.challenge.create({
        data: {
          title: s.title,
          slug: slugDesdeTitulo(s.title) || publicCode,
          publicCode,
          description: s.description,
          rules: s.rules,
          category: s.category,
          status: "DRAFT",
          prizeAmountCents: s.prizeAmountCents,
          prizeCurrency: DEFAULT_CURRENCY,
          startsAt: s.startsAt,
          deadline: s.deadline,
          winnersCount: s.winnersCount,
          esPatrocinado: true,
          sponsorNombre: s.empresa.nombre,
          sponsorLogo: s.sponsorLogo,
          comisionBps: COMISION_SPONSOR_BPS_DEFECTO,
          empresaId: s.empresaId,
          createdById: entrada.actorId,
        },
        select: { id: true, publicCode: true },
      }),
    );

    await tx.retoSolicitud.update({
      where: { id: entrada.solicitudId },
      data: { challengeId: reto.id },
    });

    const audit = await tx.auditLog.create({
      data: {
        actorId: entrada.actorId,
        action: "RETO_SOLICITUD_APROBAR",
        targetType: "RETO_SOLICITUD",
        targetId: entrada.solicitudId,
        metadata: { challengeId: reto.id },
      },
      select: { id: true },
    });

    await avisarDecisionReto(tx, {
      empresaId: s.empresaId,
      titulo: s.title,
      decision: "APROBADA",
      claveCambio: audit.id,
      appUrl: entrada.appUrl,
      ahora,
    });

    return { estado: "aprobada", challengeId: reto.id, publicCode: reto.publicCode };
  });
}

/**
 * RECHAZA una propuesta con un motivo de lista cerrada (que la empresa SÍ lee) y una nota opcional
 * (que no lee nunca). Mismo patrón que aprobar: el `UPDATE` que la reclama va primero, y una ya
 * decidida no se vuelve a decidir —ni se reenvía el correo—.
 */
export async function rechazarSolicitudReto(
  db: Db,
  entrada: {
    solicitudId: string;
    actorId: string;
    motivo: MotivoRechazoReto;
    nota?: string | null;
    appUrl: string;
    ahora?: Date;
  },
): Promise<{ rechazada: boolean }> {
  const ahora = entrada.ahora ?? new Date();
  return db.$transaction(async (tx) => {
    const reclamada = await tx.retoSolicitud.updateMany({
      where: { id: entrada.solicitudId, estado: "PENDIENTE" },
      data: {
        estado: "RECHAZADA",
        motivoRechazo: entrada.motivo,
        notaInterna: entrada.nota?.trim() || null,
        revisadaPor: entrada.actorId,
        revisadaEn: ahora,
      },
    });
    if (reclamada.count === 0) return { rechazada: false };

    const s = await tx.retoSolicitud.findUniqueOrThrow({
      where: { id: entrada.solicitudId },
      select: { empresaId: true, title: true },
    });
    const audit = await tx.auditLog.create({
      data: {
        actorId: entrada.actorId,
        action: "RETO_SOLICITUD_RECHAZAR",
        targetType: "RETO_SOLICITUD",
        targetId: entrada.solicitudId,
        // El motivo sí: es lo que se le dijo a la empresa. La nota no se duplica aquí.
        metadata: { motivo: entrada.motivo },
      },
      select: { id: true },
    });
    await avisarDecisionReto(tx, {
      empresaId: s.empresaId,
      titulo: s.title,
      decision: "RECHAZADA",
      motivo: entrada.motivo,
      claveCambio: audit.id,
      appUrl: entrada.appUrl,
      ahora,
    });
    return { rechazada: true };
  });
}

/**
 * LE ESCRIBE A LA EMPRESA LO QUE DECIDIMOS. Su portal le promete "te escribimos en cuanto la
 * decidamos", y esto es lo que hace verdad esa frase. En la transacción de la decisión, con la clave
 * atada a SU fila de `AuditLog`: un hecho, un correo, aunque el worker reintente.
 *
 * El rechazo lleva el MOTIVO y nunca la nota interna. La aprobación cuenta lo que pasa después —que
 * se prepara y se publica— y cómo se paga, para que nadie lea "aprobada" como "ya está en marcha".
 */
async function avisarDecisionReto(
  tx: Db,
  entrada: {
    empresaId: string;
    titulo: string;
    decision: "APROBADA" | "RECHAZADA";
    motivo?: MotivoRechazoReto;
    claveCambio: string;
    appUrl: string;
    ahora: Date;
  },
): Promise<void> {
  const e = await tx.empresa.findUnique({
    where: { id: entrada.empresaId },
    select: { user: { select: { email: true } } },
  });
  // Una cuenta sin correo (anonimizada) no tiene a quién avisar. No es un error de la decisión.
  if (!e?.user.email) return;

  const portal = new URL("/empresa/retos", entrada.appUrl).toString();
  const aprobada = entrada.decision === "APROBADA";
  const titulo = aprobada ? "Hemos aprobado tu reto" : "No hemos podido aprobar tu reto";
  const cuerpo = aprobada
    ? `Hemos aprobado «${entrada.titulo}». Ahora lo preparamos para publicarlo, y en tu portal verás cuándo está abierto.`
    : `Hemos revisado «${entrada.titulo}» y no lo hemos podido aprobar. ${
        entrada.motivo ? MSG_MOTIVO_RECHAZO_RETO[entrada.motivo] : ""
      }`.trim();
  const nota = aprobada
    ? MSG_PAGO_PATROCINIO
    : "Puedes proponer otro desde tu portal. Si crees que es un error, contesta a este correo.";

  await enqueueEmail(
    tx,
    {
      to: e.user.email,
      subject: titulo,
      text: [cuerpo, "", `Tus retos: ${portal}`, "", nota].join("\n"),
      html: renderCorreoHtml({
        preheader: cuerpo,
        titulo,
        intro: cuerpo,
        cta: { texto: "Ver mis retos", href: portal },
        notas: [nota],
      }),
    },
    { idempotencyKey: `reto-decision:${entrada.claveCambio}`, runAt: entrada.ahora },
  );
}
