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
import { estaCaducada, estadoVisibleSolicitud } from "@/lib/reto-solicitud";
import { slugDesdeTitulo } from "@/lib/reto-slug";
import type { Prisma } from "@/generated/prisma/client";
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
    // Las PENDIENTES DE VERDAD, con el mismo filtro que la cola: una caducada ya no ocupa hueco.
    const pendientes = await tx.retoSolicitud.count({
      where: { empresaId: entrada.empresaId, ...filtroSolicitudesReto("PENDIENTE", ahora) },
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
  opciones: { cursor?: string | null; ahora?: Date } = {},
): Promise<PaginaSolicitudes<SolicitudDeEmpresa>> {
  const ahora = opciones.ahora ?? new Date();
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
        f.deadline,
        ahora,
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
 * EL FILTRO DE LA COLA, en un solo sitio: lo usan la LISTA, el CONTADOR de la insignia y el tope de
 * propuestas al proponer, para que "2 por revisar" y las filas de la cola no puedan discrepar (la
 * misma regla que `filtroEmpresas`).
 *
 * CON EL RELOJ DENTRO, porque CADUCADA se calcula (ver `estadoVisibleSolicitud`): una PENDIENTE con
 * el cierre vencido ya es caducada aunque el barrido aún no lo haya escrito. Así:
 *  - PENDIENTE = pendiente Y con el cierre por delante (lo que de verdad se puede decidir);
 *  - CADUCADA  = caducada en la columna, O pendiente con el cierre vencido.
 * Es la forma en `where` de `estaCaducada` (cierre <= ahora): las dos dicen lo mismo, y
 * `empresa-retos` lo comprueba contra la base de datos.
 */
export function filtroSolicitudesReto(
  estado: EstadoRetoSolicitud | null | undefined,
  ahora: Date,
): Prisma.RetoSolicitudWhereInput {
  if (estado === "PENDIENTE") return { estado: "PENDIENTE", deadline: { gt: ahora } };
  if (estado === "CADUCADA") {
    return { OR: [{ estado: "CADUCADA" }, { estado: "PENDIENTE", deadline: { lte: ahora } }] };
  }
  return estado ? { estado } : {};
}

/** Cuántas hay en ese estado. Lee EL MISMO filtro que la cola. */
export function contarSolicitudesReto(
  db: Db,
  estado: EstadoRetoSolicitud,
  ahora: Date = new Date(),
): Promise<number> {
  return db.retoSolicitud.count({ where: filtroSolicitudesReto(estado, ahora) });
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
  opciones: { estado?: EstadoRetoSolicitud | null; cursor?: string | null; ahora?: Date } = {},
): Promise<PaginaSolicitudes<SolicitudPanel>> {
  const ahora = opciones.ahora ?? new Date();
  const filtro = filtroSolicitudesReto(opciones.estado, ahora);
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
      // Una pendiente vencida es CADUCADA también en el panel, antes de que el barrido lo escriba:
      // la misma regla que el portal (`estaCaducada`).
      estado:
        f.estado === "PENDIENTE" && estaCaducada(f.deadline, ahora)
          ? "CADUCADA"
          : (f.estado as EstadoRetoSolicitud),
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
  // SIN IMPORTES NI DESGLOSE: a la empresa se le dice que está aprobado, que le escribimos para
  // organizar el pago y que se publica al recibirlo (la regla de `publicarReto`). Cómo se reparte el
  // dinero dentro de DareFlash no es cosa suya (`empresa-sin-comisiones` censa este correo).
  const cuerpo = aprobada
    ? `Hemos aprobado «${entrada.titulo}». Te escribiremos para organizar el pago, y lo publicaremos en cuanto lo recibamos.`
    : `Hemos revisado «${entrada.titulo}» y no lo hemos podido aprobar. ${
        entrada.motivo ? MSG_MOTIVO_RECHAZO_RETO[entrada.motivo] : ""
      }`.trim();
  const nota = aprobada
    ? "Quien gane cobra el premio entero. En tu portal verás cuándo está publicado."
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

// ---------------------------------------------------------------------------------------------------
// El pago
// ---------------------------------------------------------------------------------------------------

/**
 * MARCA RECIBIDO EL PAGO de un reto de empresa. Es lo que desbloquea `publicarReto`: a la empresa se
 * le promete que su reto se publica cuando se recibe el pago, y este es el único sitio que lo dice.
 *
 * Solo un reto CON empresa (los patrocinados a mano no tienen pago que marcar) y solo una vez: el
 * `WHERE` lleva las dos condiciones, así que repetirlo no reescribe la fecha ni deja dos rastros. Con
 * su línea en `AuditLog`, en la misma transacción: quién dio por recibido el dinero se sabe siempre.
 */
export async function marcarPagoRecibido(
  db: Db,
  entrada: { challengeId: string; actorId: string; ahora?: Date },
): Promise<{ marcado: boolean }> {
  const ahora = entrada.ahora ?? new Date();
  return db.$transaction(async (tx) => {
    const r = await tx.challenge.updateMany({
      where: { id: entrada.challengeId, empresaId: { not: null }, pagoRecibidoEn: null },
      data: { pagoRecibidoEn: ahora },
    });
    if (r.count === 0) return { marcado: false };
    await tx.auditLog.create({
      data: {
        actorId: entrada.actorId,
        action: "RETO_PAGO_RECIBIDO",
        targetType: "CHALLENGE",
        targetId: entrada.challengeId,
        metadata: {},
      },
    });
    return { marcado: true };
  });
}

// ---------------------------------------------------------------------------------------------------
// Los logos que ya no sirven
// ---------------------------------------------------------------------------------------------------

/**
 * EL NOMBRE DEL LOGO DE UNA PROPUESTA en el volumen de portadas. Sale SOLO del id (un cuid): para
 * borrarlo nunca se lee la URL guardada, así que una fila tocada a mano no puede convertir un borrado
 * en un `../` fuera del volumen. La ruta que lo guarda usa esta misma función.
 */
export function nombreLogoPropuesta(solicitudId: string): string {
  return `propuesta-${solicitudId}-sponsor.webp`;
}

/**
 * Las propuestas cuyo logo ya no va a usar nadie: RECHAZADAS, o PENDIENTES cuyo cierre ya pasó (no se
 * pueden aprobar, ver `aprobarSolicitudReto`). Las APROBADAS NO: su logo es el del reto que nació de
 * ellas (`Challenge.sponsorLogo` apunta al mismo fichero).
 */
function logosDescartados(ahora: Date) {
  return {
    sponsorLogo: { not: null },
    OR: [
      { estado: "RECHAZADA" },
      { estado: "CADUCADA" },
      { estado: "PENDIENTE", deadline: { lte: ahora } },
    ],
  };
}

/**
 * BORRA DEL VOLUMEN el logo de las propuestas descartadas y deja la fila sin él.
 *
 * Lo llaman DOS sitios, y los dos hacen falta:
 *  - la ruta de RECHAZAR, justo después de decidir, con su `solicitudId`: el fichero desaparece en el
 *    acto, que es lo que pidió el analista;
 *  - el BARRIDO del worker, sin id: recoge las que caducaron sin decidirse y cualquier rechazo cuyo
 *    borrado se quedó a medias (el proceso murió entre la decisión y el `unlink`). Por eso el orden
 *    es FICHERO PRIMERO y columna después: mientras la columna apunte al fichero, el barrido lo ve.
 *
 * SI EL VOLUMEN NO ESTÁ, NO TOCA NADA. Un `ENOENT` del FICHERO es "ya no está" y se da por hecho; uno
 * del DIRECTORIO es que este proceso no tiene el volumen montado, y entonces poner la columna a null
 * dejaría el fichero en el disco sin que nadie volviera a buscarlo. Se dice en el log y se sale.
 */
export async function limpiarLogosDescartados(
  db: Db,
  entrada: {
    dir: string;
    ahora?: Date;
    /** Solo esta propuesta (la ruta de rechazar). Sin él, el barrido entero. */
    solicitudId?: string;
    lote?: number;
    log?: (m: string) => void;
  },
): Promise<{ borrados: number; sinVolumen: boolean }> {
  const { access, unlink } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const ahora = entrada.ahora ?? new Date();
  try {
    await access(entrada.dir);
  } catch {
    entrada.log?.(
      `[retos-empresa] sin acceso a ${entrada.dir}: no se borra ningún logo (¿volumen sin montar?).`,
    );
    return { borrados: 0, sinVolumen: true };
  }

  const filtro = logosDescartados(ahora);
  const filas = await db.retoSolicitud.findMany({
    where: entrada.solicitudId ? { ...filtro, id: entrada.solicitudId } : filtro,
    select: { id: true },
    take: entrada.lote ?? 100,
  });

  let borrados = 0;
  for (const f of filas) {
    try {
      await unlink(join(entrada.dir, nombreLogoPropuesta(f.id)));
    } catch (e) {
      if ((e as { code?: unknown }).code !== "ENOENT") {
        entrada.log?.(`[retos-empresa] no se pudo borrar el logo de ${f.id}; reintento luego.`);
        continue; // la columna sigue apuntando: el siguiente barrido lo vuelve a intentar
      }
    }
    // La misma condición en el WHERE: si entre medias cambió (no debería: rechazada es final y una
    // vencida no se aprueba), no se toca.
    await db.retoSolicitud.updateMany({
      where: { id: f.id, ...filtro },
      data: { sponsorLogo: null },
    });
    borrados += 1;
  }
  return { borrados, sinVolumen: false };
}

// ---------------------------------------------------------------------------------------------------
// Las que caducan sin decidirse
// ---------------------------------------------------------------------------------------------------

/** La clave del aviso de caducidad: UNO por propuesta, aunque el barrido pase cien veces. */
export function claveAvisoCaducada(solicitudId: string): string {
  return `reto-caducada:${solicitudId}`;
}

/**
 * CONSOLIDA LAS CADUCADAS: una PENDIENTE cuyo cierre ya pasó pasa a CADUCADA en la columna, y se le
 * escribe a la empresa, UNA VEZ.
 *
 * El estado visible no depende de esto —ya es CADUCADA para el portal y el panel desde el instante en
 * que pasa el cierre (`estadoVisibleSolicitud`)—: esto lo deja escrito y AVISA. Mismo principio que el
 * resto del producto: el estado se calcula, el job consolida.
 *
 * UNA VEZ, POR DOS CERROJOS: el `UPDATE` que la reclama solo afecta a una PENDIENTE (el segundo barrido
 * no encuentra nada que reclamar), y el correo lleva una `idempotencyKey` por propuesta. Las dos cosas
 * van en la MISMA transacción, por propuesta: o pasa a caducada Y se encola el aviso, o ninguna.
 * Primero el `UPDATE`, sin lecturas antes (ver `aprobarSolicitudReto`).
 */
export async function caducarPropuestasVencidas(
  db: Db,
  entrada: { ahora: Date; appUrl: string; lote?: number },
): Promise<{ caducadas: number }> {
  const candidatas = await db.retoSolicitud.findMany({
    where: { estado: "PENDIENTE", deadline: { lte: entrada.ahora } },
    select: { id: true },
    orderBy: [{ deadline: "asc" }, { id: "asc" }],
    take: entrada.lote ?? 100,
  });

  let caducadas = 0;
  for (const c of candidatas) {
    const hecha = await db.$transaction(async (tx) => {
      const r = await tx.retoSolicitud.updateMany({
        where: { id: c.id, estado: "PENDIENTE", deadline: { lte: entrada.ahora } },
        data: { estado: "CADUCADA", revisadaEn: entrada.ahora },
      });
      if (r.count === 0) return false; // la decidió alguien entre medias, o ya estaba
      const s = await tx.retoSolicitud.findUniqueOrThrow({
        where: { id: c.id },
        select: { title: true, empresa: { select: { user: { select: { email: true } } } } },
      });
      const email = s.empresa.user.email;
      if (email) {
        const nuevo = new URL("/empresa/retos/nuevo", entrada.appUrl).toString();
        const titulo = "Tu propuesta de reto ha caducado";
        // Sin dinero: a la empresa no se le cuenta cómo se reparte (`empresa-sin-comisiones`).
        const cuerpo = `La fecha de «${s.title}» ya pasó sin que llegáramos a decidir tu propuesta. Puedes proponerlo de nuevo con otras fechas.`;
        await enqueueEmail(
          tx,
          {
            to: email,
            subject: titulo,
            text: [cuerpo, "", `Proponer un reto: ${nuevo}`].join("\n"),
            html: renderCorreoHtml({
              preheader: cuerpo,
              titulo,
              intro: cuerpo,
              cta: { texto: "Proponer un reto", href: nuevo },
              notas: [],
            }),
          },
          { idempotencyKey: claveAvisoCaducada(c.id), runAt: entrada.ahora },
        );
      }
      return true;
    });
    if (hecha) caducadas += 1;
  }
  return { caducadas };
}

/**
 * EL BARRIDO HORARIO DE PROPUESTAS (lo llama el worker): primero consolida las caducadas y avisa,
 * después borra los logos que ya no usará nadie.
 *
 * EN ESE ORDEN Y POR SEPARADO: caducar es base de datos y correo, y no puede depender de que el
 * proceso tenga el volumen de portadas montado. Si no lo tiene, las propuestas caducan y se avisa
 * igual, y solo los ficheros esperan (`limpiarLogosDescartados` lo dice en el log).
 */
export async function barrerPropuestas(
  db: Db,
  entrada: { dir: string; ahora: Date; appUrl: string; log?: (m: string) => void },
): Promise<{ caducadas: number; borrados: number; sinVolumen: boolean }> {
  const { caducadas } = await caducarPropuestasVencidas(db, entrada);
  const { borrados, sinVolumen } = await limpiarLogosDescartados(db, entrada);
  return { caducadas, borrados, sinVolumen };
}
