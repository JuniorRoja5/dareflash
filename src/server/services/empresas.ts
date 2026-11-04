/**
 * CUENTAS DE EMPRESA (Fase 9 · P1) — registrar, mirar y verificar a mano.
 *
 * EL PUNTO ÚNICO donde nace y cambia una `Empresa`. Las rutas no saben gobernar: traen quién lo
 * pide y qué pide, y traducen el resultado a copy humano.
 *
 * ┌─ EL ÁMBITO ES UN PARÁMETRO OBLIGATORIO, NO UN FILTRO QUE SE PUEDA OLVIDAR ────────────────────┐
 * │ Todo lo que lee datos de UNA empresa recibe su `empresaId` como primer argumento, y ese id     │
 * │ solo lo produce `requireEmpresa()` (el chokepoint, en `server/auth/empresa-actual`). Nunca se  │
 * │ lee del cuerpo ni de la query: un `empresaId` que venga del cliente es un IDOR con otro        │
 * │ nombre — el fallo que ya costó una revisión en esta misma fase.                                 │
 * │                                                                                                 │
 * │ Un filtro opcional se puede olvidar y el código compila, pasa los tests y devuelve datos de    │
 * │ más. Un parámetro obligatorio NO compila si falta, y `typecheck` corre en el pre-commit.       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL MOTIVO SE ENSEÑA Y LA NOTA NO. Hay dos DTO y son distintos a propósito: el del dueño
 * (`MiEmpresa`) no trae `notaInterna` ni quién la verificó, y el del panel (`EmpresaPanel`) trae las
 * dos cosas. Misma regla que la nota del ajuste de puntos, y con su test de igualdad exacta de
 * claves: el hueco típico no es una consulta sin filtro, es un `select` que creció.
 *
 * EL AVISO VA EN LA MISMA TRANSACCIÓN que el registro (ver `registrarEmpresa`).
 */
import "server-only";

import {
  EMPRESAS_PAGINA,
  EMPRESA_NOMBRE_MAX,
  EMPRESA_NOMBRE_MIN,
  EMPRESA_NOTA_MAX,
  TITULO_AVISO_EMPRESA_NUEVA,
  msgAvisoEmpresaNueva,
  type AuditAccionEmpresa,
  type EstadoEmpresa,
  type MotivoRechazoEmpresa,
  type TipoCuentaEmpresa,
  type TipoNegocio,
} from "@/config/constants";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  codificarCursorTiempo,
  conKeysetTiempo,
  decodificarCursorTiempo,
} from "@/lib/cursor-tiempo";
import type { Db } from "@/server/db/types";
import { enqueueEmail } from "@/server/email/send";

export class EmpresaError extends Error {
  constructor(
    public readonly code: "DATOS_INVALIDOS",
    message: string,
  ) {
    super(message);
    this.name = "EmpresaError";
  }
}

const esDuplicado = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Clave del aviso al admin: UNA por empresa. Un reintento del worker no manda un segundo correo. */
export function claveAvisoEmpresa(empresaId: string): string {
  return `empresa-pendiente:${empresaId}`;
}

// ---------------------------------------------------------------------------------------------------
// EL RESOLVEDOR DEL CHOKEPOINT. Es la ÚNICA función que busca una empresa por su dueño, y la usa
// solo `requireEmpresa()`. Todo lo demás parte del `empresaId` que ella devuelve.
// ---------------------------------------------------------------------------------------------------

export interface EmpresaDeSesion {
  id: string;
  estado: EstadoEmpresa;
}

/**
 * La empresa de ESTE usuario, o `null`. Devuelve lo mínimo —id y estado— porque es lo único que el
 * guard necesita para decidir; los datos se piden después, ya con el ámbito en la mano.
 */
export async function empresaDeUsuario(db: Db, userId: string): Promise<EmpresaDeSesion | null> {
  const e = await db.empresa.findUnique({
    where: { ownerUserId: userId },
    select: { id: true, estado: true },
  });
  return e ? { id: e.id, estado: e.estado as EstadoEmpresa } : null;
}

// ---------------------------------------------------------------------------------------------------
// REGISTRAR
// ---------------------------------------------------------------------------------------------------

export interface EntradaRegistro {
  userId: string;
  nombre: string;
  tipoCuenta: TipoCuentaEmpresa;
  tipoNegocio: TipoNegocio;
  /** Opcionales de verdad: una marca puede no tener web, y un negocio online no tiene dirección. */
  webUrl?: string | null;
  direccion?: string | null;
}

/** Lo que hace falta para avisar al admin. Se INYECTA: el servicio no lee `env` (regla de la casa). */
export interface AvisoRegistro {
  /** `null` = no hay destinatario configurado: no se encola nada y se deja una línea en el log. */
  adminEmail: string | null;
  /** Enlace a la cola del panel. Un enlace, no un token: se mira con una sesión. */
  urlPanel: string;
  log?: (mensaje: string) => void;
}

export interface EmpresaRegistrada {
  id: string;
  /** `false` = ya tenía una (doble clic, dos pestañas): no se ha creado otra ni se ha avisado dos veces. */
  creado: boolean;
}

/**
 * REGISTRAR una empresa y AVISAR al admin, en UNA transacción.
 *
 * El aviso es de los que exigen algo —bloquea a un cliente que ya se registró—, así que sale
 * inmediato por la cola (`SEND_EMAIL`, política de reaper FAIL: sobre SMTP no hay exactly-once) y no
 * en el resumen diario. Su clave se deriva del HECHO (`empresa-pendiente:{id}`), no del momento.
 *
 * IDEMPOTENTE POR LA BASE DE DATOS, no por un `if`: `ownerUserId` es UNIQUE. Dos envíos a la vez
 * dejan pasar uno, y el otro devuelve el que ganó, sin segunda empresa y sin segundo correo.
 *
 * SIN DESTINATARIO SE REGISTRA IGUAL. Que no tengamos a quién avisar no puede impedir que alguien se
 * dé de alta; lo que no se hace es dar el aviso por enviado.
 */
export async function registrarEmpresa(
  db: PrismaClient,
  entrada: EntradaRegistro,
  aviso: AvisoRegistro,
  now: Date = new Date(),
): Promise<EmpresaRegistrada> {
  const nombre = entrada.nombre.trim();
  if (nombre.length < EMPRESA_NOMBRE_MIN || nombre.length > EMPRESA_NOMBRE_MAX) {
    throw new EmpresaError(
      "DATOS_INVALIDOS",
      `El nombre tiene que tener entre ${EMPRESA_NOMBRE_MIN} y ${EMPRESA_NOMBRE_MAX} caracteres.`,
    );
  }

  const suya = () => empresaDeUsuario(db, entrada.userId);
  const previa = await suya();
  if (previa) return { id: previa.id, creado: false };

  try {
    return await db.$transaction(async (tx) => {
      const e = await tx.empresa.create({
        data: {
          ownerUserId: entrada.userId,
          nombre,
          tipoCuenta: entrada.tipoCuenta,
          tipoNegocio: entrada.tipoNegocio,
          estado: "PENDIENTE",
          ...(entrada.webUrl ? { webUrl: entrada.webUrl } : {}),
          ...(entrada.direccion ? { direccion: entrada.direccion } : {}),
          createdAt: now,
        },
        select: { id: true },
      });

      if (aviso.adminEmail) {
        await enqueueEmail(
          tx,
          {
            to: aviso.adminEmail,
            subject: TITULO_AVISO_EMPRESA_NUEVA,
            text: msgAvisoEmpresaNueva({
              nombre,
              tipoNegocio: entrada.tipoNegocio,
              urlPanel: aviso.urlPanel,
            }),
          },
          { idempotencyKey: claveAvisoEmpresa(e.id), runAt: now },
        );
      } else {
        aviso.log?.(
          "[empresas] ADMIN_EMAIL sin configurar: la empresa queda registrada y NADIE recibe el aviso.",
        );
      }

      return { id: e.id, creado: true };
    });
  } catch (err) {
    if (esDuplicado(err)) {
      const ganadora = await suya();
      if (ganadora) return { id: ganadora.id, creado: false };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------------
// MIRAR — dos DTO distintos, y la diferencia es el punto
// ---------------------------------------------------------------------------------------------------

/**
 * LO QUE VE EL DUEÑO. No trae `notaInterna` ni `verificadaPor`: la nota es traza del equipo y el
 * handle de quien verifica no es asunto de nadie de fuera (misma regla que el ajuste de puntos).
 * Hay test de igualdad EXACTA de claves, no de "contiene": así un `select` que crezca se pone rojo.
 */
export interface MiEmpresa {
  id: string;
  nombre: string;
  tipoCuenta: TipoCuentaEmpresa;
  tipoNegocio: TipoNegocio;
  estado: EstadoEmpresa;
  webUrl: string | null;
  direccion: string | null;
  motivoRechazo: MotivoRechazoEmpresa | null;
  creadaMs: number;
  verificadaMs: number | null;
}

/**
 * La empresa del portal, POR SU `empresaId` (el que produce el chokepoint). No recibe un `userId`
 * ni lo busca: así no hay forma de pedir "la empresa de este otro usuario" ni por descuido.
 */
export async function miEmpresa(db: Db, empresaId: string): Promise<MiEmpresa | null> {
  const e = await db.empresa.findUnique({
    where: { id: empresaId },
    select: {
      id: true,
      nombre: true,
      tipoCuenta: true,
      tipoNegocio: true,
      estado: true,
      webUrl: true,
      direccion: true,
      motivoRechazo: true,
      createdAt: true,
      verificadaEn: true,
    },
  });
  if (!e) return null;
  return {
    id: e.id,
    nombre: e.nombre,
    tipoCuenta: e.tipoCuenta as TipoCuentaEmpresa,
    tipoNegocio: e.tipoNegocio as TipoNegocio,
    estado: e.estado as EstadoEmpresa,
    webUrl: e.webUrl,
    direccion: e.direccion,
    motivoRechazo: e.motivoRechazo as MotivoRechazoEmpresa | null,
    creadaMs: e.createdAt.getTime(),
    verificadaMs: e.verificadaEn?.getTime() ?? null,
  };
}

/**
 * LO QUE VE EL PANEL: lo del dueño MÁS la nota interna y las firmas. Sin el email del dueño: el
 * panel no pinta direcciones en un listado de veinticinco (su única puerta es la ficha de la cuenta,
 * que escribe `AuditLog`), y un listado de empresas no puede ser la rendija que se lo salta.
 */
export interface EmpresaPanel {
  id: string;
  nombre: string;
  tipoCuenta: TipoCuentaEmpresa;
  tipoNegocio: TipoNegocio;
  estado: EstadoEmpresa;
  webUrl: string | null;
  direccion: string | null;
  motivoRechazo: MotivoRechazoEmpresa | null;
  notaInterna: string | null;
  /** Handle del dueño (no su correo). */
  dueno: string | null;
  creadaMs: number;
  verificadaMs: number | null;
  /** Handle de quien la verificó, para el equipo. */
  verificadaPor: string | null;
}

export interface PaginaEmpresas {
  items: EmpresaPanel[];
  proximoCursor: string | null;
}

/**
 * LA COLA DE VERIFICACIÓN: más nuevas primero, por KEYSET sobre (createdAt, id), con filtro
 * opcional de estado. Dos consultas por página haya las que haya: la página y los handles.
 *
 * EL FILTRO SE COMPONE CON `conKeysetTiempo`, NO CON SPREAD. Hoy el `where` es una conjunción plana
 * y el spread funcionaría; el día que alguien añada un `OR` —"pendientes **o** rechazadas"— el
 * spread se comería una de las dos ramas SIN AVISAR y la página 2 dejaría de filtrar lo que
 * filtraba la 1. Cuesta lo mismo hacerlo bien desde el principio.
 */
export async function listarEmpresas(
  db: Db,
  opciones: { estado?: EstadoEmpresa | null; cursor?: string | null; limite?: number } = {},
): Promise<PaginaEmpresas> {
  const limite = Math.min(Math.max(opciones.limite ?? EMPRESAS_PAGINA, 1), 50);
  const filtro = opciones.estado ? { estado: opciones.estado } : {};

  const filas = await db.empresa.findMany({
    where: conKeysetTiempo(filtro, decodificarCursorTiempo(opciones.cursor)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    select: {
      id: true,
      nombre: true,
      tipoCuenta: true,
      tipoNegocio: true,
      estado: true,
      webUrl: true,
      direccion: true,
      motivoRechazo: true,
      notaInterna: true,
      ownerUserId: true,
      verificadaPor: true,
      createdAt: true,
      verificadaEn: true,
    },
  });
  const pagina = filas.slice(0, limite);
  if (pagina.length === 0) return { items: [], proximoCursor: null };

  // Los handles del dueño y de quien verificó, en UNA consulta para toda la página (no N+1).
  const ids = [
    ...new Set([
      ...pagina.map((e) => e.ownerUserId),
      ...pagina.flatMap((e) => (e.verificadaPor ? [e.verificadaPor] : [])),
    ]),
  ];
  const cuentas = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true },
  });
  const handle = new Map(cuentas.map((c) => [c.id, c.username]));

  const ultima = pagina[pagina.length - 1]!;
  return {
    items: pagina.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      tipoCuenta: e.tipoCuenta as TipoCuentaEmpresa,
      tipoNegocio: e.tipoNegocio as TipoNegocio,
      estado: e.estado as EstadoEmpresa,
      webUrl: e.webUrl,
      direccion: e.direccion,
      motivoRechazo: e.motivoRechazo as MotivoRechazoEmpresa | null,
      notaInterna: e.notaInterna,
      dueno: handle.get(e.ownerUserId) ?? null,
      creadaMs: e.createdAt.getTime(),
      verificadaMs: e.verificadaEn?.getTime() ?? null,
      verificadaPor: e.verificadaPor ? (handle.get(e.verificadaPor) ?? null) : null,
    })),
    proximoCursor:
      filas.length > limite
        ? codificarCursorTiempo({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// VERIFICAR / RECHAZAR — a mano, con rastro, y sin hacer daño al repetirse
// ---------------------------------------------------------------------------------------------------

export type ResultadoEmpresa =
  | { estado: "hecho" }
  /** Ya estaba así: no se escribe nada, ni rastro. Repetir un gesto no es un hecho nuevo. */
  | { estado: "sin_cambios" }
  | { estado: "rechazado"; motivo: "NO_ENCONTRADA" };

/** El rastro, siempre igual y siempre DENTRO de la transacción del cambio. */
async function anotar(
  tx: Db,
  entrada: {
    accion: AuditAccionEmpresa;
    actorId: string;
    empresaId: string;
    metadata?: Record<string, string>;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entrada.actorId,
      action: entrada.accion,
      targetType: "EMPRESA",
      targetId: entrada.empresaId,
      metadata: entrada.metadata ?? {},
    },
  });
}

async function estadoActual(
  db: Db,
  empresaId: string,
): Promise<{
  estado: EstadoEmpresa;
  verificadaEn: Date | null;
  motivoRechazo: string | null;
  notaInterna: string | null;
} | null> {
  const e = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { estado: true, verificadaEn: true, motivoRechazo: true, notaInterna: true },
  });
  return e ? { ...e, estado: e.estado as EstadoEmpresa } : null;
}

/**
 * VERIFICAR. Vale también para revertir un rechazo o levantar una suspensión: es el mismo gesto —
 * "esta empresa es buena" — y queda con su fila de `AuditLog`.
 *
 * `verificadaEn` SE ESCRIBE UNA SOLA VEZ (si estaba a `null`). Es la fecha que decidirá el regalo de
 * Socio Fundador (P4), y nadie debería perderlo porque un rechazo se revirtiera meses después. El
 * historial de las vueltas está en `AuditLog`, que es donde corresponde.
 */
export async function verificarEmpresa(
  db: PrismaClient,
  entrada: { empresaId: string; actorId: string; ahora?: Date },
): Promise<ResultadoEmpresa> {
  const actual = await estadoActual(db, entrada.empresaId);
  if (!actual) return { estado: "rechazado", motivo: "NO_ENCONTRADA" };
  if (actual.estado === "VERIFICADA") return { estado: "sin_cambios" };

  const ahora = entrada.ahora ?? new Date();
  await db.$transaction(async (tx) => {
    await tx.empresa.update({
      where: { id: entrada.empresaId },
      data: {
        estado: "VERIFICADA",
        // Primera verificación: se sella. Las siguientes no la mueven (ver el docblock).
        ...(actual.verificadaEn === null ? { verificadaEn: ahora } : {}),
        verificadaPor: entrada.actorId,
        // El motivo del rechazo anterior se limpia: ya no describe nada y el dueño lo vería.
        motivoRechazo: null,
      },
    });
    await anotar(tx, {
      accion: "EMPRESA_VERIFY",
      actorId: entrada.actorId,
      empresaId: entrada.empresaId,
      metadata: { de: actual.estado },
    });
  });
  return { estado: "hecho" };
}

/**
 * RECHAZAR, con motivo de la lista cerrada (el dueño lo ve) y nota interna opcional (no lo ve).
 *
 * Rechazar lo ya rechazado CON EL MISMO motivo y la misma nota no escribe nada: no ha pasado nada.
 * Cambiar el motivo SÍ es un hecho nuevo y deja su rastro — es información distinta para quien la
 * lee, y el `AuditLog` tiene que poder contar la secuencia.
 */
export async function rechazarEmpresa(
  db: PrismaClient,
  entrada: {
    empresaId: string;
    actorId: string;
    motivo: MotivoRechazoEmpresa;
    nota?: string | null;
  },
): Promise<ResultadoEmpresa> {
  const actual = await estadoActual(db, entrada.empresaId);
  if (!actual) return { estado: "rechazado", motivo: "NO_ENCONTRADA" };

  const nota = entrada.nota?.trim().slice(0, EMPRESA_NOTA_MAX) || null;
  if (
    actual.estado === "RECHAZADA" &&
    actual.motivoRechazo === entrada.motivo &&
    actual.notaInterna === nota
  ) {
    return { estado: "sin_cambios" };
  }

  await db.$transaction(async (tx) => {
    await tx.empresa.update({
      where: { id: entrada.empresaId },
      data: {
        estado: "RECHAZADA",
        motivoRechazo: entrada.motivo,
        notaInterna: nota,
        verificadaPor: entrada.actorId,
      },
    });
    await anotar(tx, {
      accion: "EMPRESA_REJECT",
      actorId: entrada.actorId,
      empresaId: entrada.empresaId,
      // El MOTIVO sí (es la decisión); la NOTA no: el rastro no es el sitio donde duplicar un texto
      // libre que ya vive en su columna, y así no hay dos copias que puedan discrepar.
      metadata: { motivo: entrada.motivo, de: actual.estado },
    });
  });
  return { estado: "hecho" };
}
