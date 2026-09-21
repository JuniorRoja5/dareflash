/**
 * GOBIERNO DE CUENTAS (Fase 5, pieza A) — nombrar moderadores y suspender cuentas.
 *
 * El PUNTO ÚNICO donde se decide y se escribe. Las rutas no saben gobernar: traen quién lo pide y a
 * quién, y traducen el resultado a copy humano.
 *
 * QUIÉN PUEDE QUÉ lo dicen `puedeAsignarRol` y `puedeBanear` (`lib/permisos`, puras): la misma regla
 * que usará el panel. Aquí NO se reescribe ninguna de las dos; se aplican sobre el rol REAL del
 * destino, leído de la fila, nunca sobre lo que diga el cliente.
 *
 * CADA CAMBIO DEJA RASTRO, en la MISMA transacción que el cambio: quién lo hizo, sobre quién y de qué
 * a qué (`AuditLog`). Que el registro fuera aparte sería peor que no tenerlo — una cuenta suspendida
 * sin saber por quién es exactamente lo que un registro debe impedir.
 *
 * IDEMPOTENTE, y eso incluye NO hacer daño: pedir el rol que ya se tiene no revoca sesiones ni escribe
 * rastro, porque no ha pasado nada. Sin ese cuidado, "guardar" dos veces echaría al usuario de todas
 * sus sesiones la segunda vez sin que nadie hubiera cambiado nada.
 *
 * NO TOCA el enum `Role`, ni `create-admin.ts`, ni el enforcement de `bannedAt` (sesión, login y
 * visibilidad ya lo aplican). Y `ADMIN` no se asigna por aquí: el único camino es el script de
 * arranque, que es lo que mantiene "un solo superadmin" como un hecho y no como una costumbre.
 */
import type { AuditAccionCuenta } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { banearEnTx, cambiarRolEnTx, desbanearEnTx } from "@/server/auth/account";
import type { Db } from "@/server/db/types";
import { puedeAsignarRol, puedeBanear, type RolAsignable } from "@/lib/permisos";

export type MotivoRechazoCuenta =
  /** No existe (o está borrada): el mismo resultado para las dos cosas. */
  | "NO_ENCONTRADA"
  /** La regla dice que no: actor sin rango, rol no asignable, o destino privilegiado. */
  | "NO_PERMITIDO";

export type ResultadoCuenta =
  | { estado: "hecho" }
  /** Ya estaba así: no se escribe nada, ni rastro, ni se revocan sesiones. */
  | { estado: "sin_cambios" }
  | { estado: "rechazado"; motivo: MotivoRechazoCuenta };

/** Una cuenta, vista desde el panel: quién es, qué es y si está suspendida. */
export interface CuentaAdmin {
  id: string;
  username: string;
  displayName: string | null;
  image: string | null;
  rol: string;
  suspendida: boolean;
}

/** Cuántas cuentas devuelve una búsqueda del panel. Es una búsqueda dirigida, no un listado. */
export const CUENTAS_BUSCAR_LIMITE = 20;

/**
 * BUSCAR CUENTAS PARA MODERAR. Es OTRA búsqueda que la pública (`buscarUsuarios`), y tiene que serlo:
 * aquella esconde a los suspendidos —es su trabajo—, y aquí son justo a quienes hay que encontrar para
 * levantarles la suspensión o revisar qué hicieron. Lo único que sigue fuera es lo BORRADO, que para
 * el sistema ya no existe.
 *
 * DIRIGIDA POR LA CONSULTA: sin término no devuelve nada. Un panel de cuentas no es un volcado del
 * censo; se busca a alguien concreto, por su handle (o por su nombre, que es como se le recuerda).
 *
 * Los comodines de LIKE se neutralizan: un "%" convertiría la búsqueda en ese volcado que se evita.
 */
export async function buscarCuentasAdmin(
  db: PrismaClient,
  consulta: string,
  limite: number = CUENTAS_BUSCAR_LIMITE,
): Promise<CuentaAdmin[]> {
  const termino = consulta.trim().replace(/[\\%_]/g, "");
  if (termino === "") return [];

  const filas = await db.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ username: { startsWith: termino } }, { displayName: { startsWith: termino } }],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      image: true,
      role: true,
      bannedAt: true,
    },
    // El handle ordena: es lo que el moderador escribió y lo que reconoce en la lista.
    orderBy: [{ username: "asc" }],
    take: Math.min(Math.max(1, limite), CUENTAS_BUSCAR_LIMITE),
  });

  return filas.map((f) => ({
    id: f.id,
    username: f.username,
    displayName: f.displayName,
    image: f.image,
    rol: f.role,
    suspendida: f.bannedAt !== null,
  }));
}

/** Una cuenta borrada no se gobierna: para el resto del sistema ya no está. */
async function cuentaDestino(
  db: PrismaClient,
  userId: string,
): Promise<{ role: string; bannedAt: Date | null } | null> {
  return db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { role: true, bannedAt: true },
  });
}

/** El rastro, siempre igual y siempre dentro de la transacción del cambio. */
async function anotar(
  tx: Db,
  entrada: {
    accion: AuditAccionCuenta;
    actorId: string;
    userId: string;
    metadata?: Record<string, string>;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entrada.actorId,
      action: entrada.accion,
      targetType: "USER",
      targetId: entrada.userId,
      metadata: entrada.metadata ?? {},
    },
  });
}

/**
 * ASIGNAR ROL (solo el superadmin). Reutiliza `cambiarRolEnTx`, que revoca las sesiones del destino:
 * el TTL de sesión depende del rol, así que quien cambia de rol vuelve a entrar con el suyo.
 */
export async function asignarRol(
  db: PrismaClient,
  entrada: { actorId: string; rolActor: string; userId: string; rolPedido: RolAsignable },
): Promise<ResultadoCuenta> {
  const destino = await cuentaDestino(db, entrada.userId);
  if (!destino) return { estado: "rechazado", motivo: "NO_ENCONTRADA" };

  if (
    !puedeAsignarRol({
      rolActor: entrada.rolActor,
      rolActualDestino: destino.role,
      rolPedido: entrada.rolPedido,
    })
  ) {
    return { estado: "rechazado", motivo: "NO_PERMITIDO" };
  }
  if (destino.role === entrada.rolPedido) return { estado: "sin_cambios" };

  await db.$transaction(async (tx) => {
    await cambiarRolEnTx(tx, entrada.userId, entrada.rolPedido);
    await anotar(tx, {
      accion: "ROLE_CHANGE",
      actorId: entrada.actorId,
      userId: entrada.userId,
      metadata: { de: destino.role, a: entrada.rolPedido },
    });
  });
  return { estado: "hecho" };
}

/**
 * SUSPENDER una cuenta (moderación). Reutiliza `banearEnTx`: marca `bannedAt` y borra sus sesiones.
 */
export async function suspenderCuenta(
  db: PrismaClient,
  entrada: { actorId: string; rolActor: string; userId: string; ahora?: Date },
): Promise<ResultadoCuenta> {
  const destino = await cuentaDestino(db, entrada.userId);
  if (!destino) return { estado: "rechazado", motivo: "NO_ENCONTRADA" };
  if (!puedeBanear({ rolActor: entrada.rolActor, rolDestino: destino.role })) {
    return { estado: "rechazado", motivo: "NO_PERMITIDO" };
  }
  if (destino.bannedAt !== null) return { estado: "sin_cambios" };

  await db.$transaction(async (tx) => {
    await banearEnTx(tx, entrada.userId, entrada.ahora ?? new Date());
    await anotar(tx, { accion: "BAN", actorId: entrada.actorId, userId: entrada.userId });
  });
  return { estado: "hecho" };
}

/**
 * LEVANTAR la suspensión. No resucita sesiones (se borraron al suspender): el usuario vuelve a entrar,
 * que es lo correcto. Misma regla de quién puede: levantar es tan de moderación como poner.
 */
export async function levantarSuspension(
  db: PrismaClient,
  entrada: { actorId: string; rolActor: string; userId: string },
): Promise<ResultadoCuenta> {
  const destino = await cuentaDestino(db, entrada.userId);
  if (!destino) return { estado: "rechazado", motivo: "NO_ENCONTRADA" };
  if (!puedeBanear({ rolActor: entrada.rolActor, rolDestino: destino.role })) {
    return { estado: "rechazado", motivo: "NO_PERMITIDO" };
  }
  if (destino.bannedAt === null) return { estado: "sin_cambios" };

  await db.$transaction(async (tx) => {
    await desbanearEnTx(tx, entrada.userId);
    await anotar(tx, { accion: "UNBAN", actorId: entrada.actorId, userId: entrada.userId });
  });
  return { estado: "hecho" };
}
