/**
 * LAS CUENTAS VISTAS DESDE EL PANEL (Fase 5) — listar, abrir una ficha y pedir su email.
 *
 * DOS MANERAS DE LLEGAR A UNA CUENTA, UNA SOLA FILA. Escribir un nombre usa el buscador de verdad
 * (`buscarCuentas`, el mismo motor que el público); no escribir nada recorre el censo por keyset. Las
 * dos devuelven `CuentaPanel`, así que la pantalla pinta lo mismo en los dos casos — si cada camino
 * trajera sus campos, el moderador vería dos verdades según cómo hubiera llegado.
 *
 * KEYSET, NUNCA OFFSET, y aquí con un matiz que se paga en el esquema: los tres órdenes numéricos
 * —alta, puntos, victorias— van contra su propio índice `(columna, id)`, y las victorias de por vida
 * existen como COLUMNA precisamente porque un `COUNT` no se pagina por cursor (misma lección que
 * `RankingMensual`, escrita en su docblock).
 *
 * EL EMAIL NO ESTÁ EN LA LISTA. Es PII, y una pantalla que lista a cien personas a la vez no es sitio
 * para cien direcciones: se pide de UNA en una, desde la ficha, y la petición deja rastro en
 * `AuditLog` ANTES de devolver nada. Sin rastro no hay email — ese es el orden, no al revés.
 *
 * LA FRONTERA DE ROL. Esta pantalla es del MODERADOR. Lo que enseña de puntos es un RESUMEN DE SOLO
 * LECTURA, reutilizando `fichaDareUp`: ni el ajuste ni el historial del ledger entran aquí. Eso sigue
 * viviendo en `/panel/ranking`, que es ADMIN. La ficha de una cuenta no es una puerta trasera al
 * dinero.
 */
import "server-only";

import { CUENTAS_PAGINA } from "@/config/constants";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  codificarCursorCuentas,
  decodificarCursorCuentas,
  type EstadoCuenta,
  type OrdenCuentas,
  type PosicionCuentas,
  type RolFiltro,
} from "@/lib/cuentas-listado";

import { buscarCuentas, type CuentaPanel } from "./buscar";
import { fichaDareUp } from "./dareup-admin";

export type { CuentaPanel };

/** Qué se pide al listado. Todo opcional: sin nada, las últimas altas. */
export interface ConsultaCuentas {
  /** Término de búsqueda. Vacío = listado del censo. */
  q?: string;
  cursor?: string | null;
  limite?: number;
  orden: OrdenCuentas;
  rol?: RolFiltro | null;
  estado?: EstadoCuenta | null;
}

export interface PaginaCuentas {
  items: CuentaPanel[];
  proximoCursor: string | null;
  /**
   * Cómo se ha resuelto la página. La pantalla lo necesita para no mentir: buscando, el orden es la
   * RELEVANCIA y no el que el moderador tenga elegido en el desplegable.
   */
  modo: "busqueda" | "listado";
}

/** Las columnas de `CuentaPanel`, tal cual las pide Prisma. Un solo sitio. */
const CAMPOS = {
  id: true,
  username: true,
  displayName: true,
  image: true,
  role: true,
  bannedAt: true,
  createdAt: true,
  pointsBalance: true,
  victoriasTotales: true,
} as const;

type FilaCuenta = {
  id: string;
  username: string;
  displayName: string | null;
  image: string | null;
  role: string;
  bannedAt: Date | null;
  createdAt: Date;
  pointsBalance: number;
  victoriasTotales: number;
};

function aCuenta(f: FilaCuenta): CuentaPanel {
  return {
    id: f.id,
    username: f.username,
    displayName: f.displayName,
    image: f.image,
    rol: f.role,
    suspendida: f.bannedAt !== null,
    alta: f.createdAt,
    puntos: f.pointsBalance,
    victorias: f.victoriasTotales,
  };
}

/**
 * EL ORDEN, en un solo sitio y en las dos direcciones que necesita el keyset: cómo se ordena y cómo
 * se dice "estrictamente después de aquí".
 *
 * Las dos columnas de cada orden van en la MISMA dirección (DESC, DESC) para que sea un recorrido de
 * una pasada del índice `(columna, id)`; con direcciones mezcladas InnoDB ordena en memoria. El
 * alfabético es la excepción y no necesita desempate: `username` es UNIQUE, o sea orden total por sí
 * solo.
 */
function ordenPrisma(orden: OrdenCuentas): Prisma.UserOrderByWithRelationInput[] {
  switch (orden) {
    case "alfabetico":
      return [{ username: "asc" }];
    case "puntos":
      return [{ pointsBalance: "desc" }, { id: "desc" }];
    case "victorias":
      return [{ victoriasTotales: "desc" }, { id: "desc" }];
    case "alta":
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

function condicionKeyset(orden: OrdenCuentas, pos: PosicionCuentas): Prisma.UserWhereInput {
  if (orden === "alfabetico") return { username: { gt: pos.valor } };
  if (orden === "alta") {
    const alta = new Date(Number(pos.valor));
    return { OR: [{ createdAt: { lt: alta } }, { createdAt: alta, id: { lt: pos.id } }] };
  }
  const n = Number(pos.valor);
  const campo = orden === "puntos" ? "pointsBalance" : "victoriasTotales";
  return { OR: [{ [campo]: { lt: n } }, { [campo]: n, id: { lt: pos.id } }] };
}

/** El valor que identifica la posición de una fila en el orden vigente. */
function valorDe(orden: OrdenCuentas, c: CuentaPanel): string {
  switch (orden) {
    case "alfabetico":
      return c.username;
    case "puntos":
      return String(c.puntos);
    case "victorias":
      return String(c.victorias);
    case "alta":
      return String(c.alta.getTime());
  }
}

/**
 * Una página de cuentas. Con término, es la búsqueda (ordenada por relevancia); sin él, el censo por
 * el orden elegido. Los filtros de rol y estado se aplican en los DOS casos: buscar dentro de un
 * filtro tiene que seguir respetándolo, o el filtro sería mentira en cuanto alguien escribe algo.
 *
 * LO BORRADO NO SALE nunca, ni buscando ni listando: para el sistema esa cuenta ya no existe.
 */
export async function listarCuentas(
  db: PrismaClient,
  consulta: ConsultaCuentas,
): Promise<PaginaCuentas> {
  const limite = Math.min(Math.max(consulta.limite ?? CUENTAS_PAGINA, 1), CUENTAS_PAGINA);
  const filtros = { rol: consulta.rol ?? null, estado: consulta.estado ?? null };
  const q = consulta.q?.trim() ?? "";

  if (q !== "") {
    const p = await buscarCuentas(db, q, consulta.cursor ?? null, limite, filtros);
    return { items: p.items, proximoCursor: p.proximoCursor, modo: "busqueda" };
  }

  const orden = consulta.orden;
  // Un cursor de OTRO orden (o manipulado) devuelve `null` y la lista empieza por el principio: es la
  // garantía de `decodificarCursorCuentas`, y por eso la pantalla no tiene que acordarse de limpiarlo.
  const pos = decodificarCursorCuentas(consulta.cursor, orden);

  const filas = await db.user.findMany({
    where: {
      deletedAt: null,
      ...(filtros.rol ? { role: filtros.rol } : {}),
      ...(filtros.estado === "suspendida"
        ? { bannedAt: { not: null } }
        : filtros.estado === "activa"
          ? { bannedAt: null }
          : {}),
      ...(pos ? condicionKeyset(orden, pos) : {}),
    },
    orderBy: ordenPrisma(orden),
    select: CAMPOS,
    // Una de más para saber si hay página siguiente sin un COUNT aparte.
    take: limite + 1,
  });

  const hayMas = filas.length > limite;
  const items = (hayMas ? filas.slice(0, limite) : filas).map(aCuenta);
  const ultima = items[items.length - 1];

  return {
    items,
    proximoCursor:
      hayMas && ultima
        ? codificarCursorCuentas({ orden, valor: valorDe(orden, ultima), id: ultima.id })
        : null,
    modo: "listado",
  };
}

/** La ficha de una cuenta: lo mismo que su fila de la lista, más el resumen de puntos. */
export interface FichaCuenta {
  cuenta: CuentaPanel;
  /** Puntos y nada más: el nivel se deriva al pintar (`InsigniaNivel`). SOLO LECTURA. */
  puntos: number;
}

/**
 * Abre la ficha de una cuenta. `null` si no existe o está borrada — el mismo resultado para las dos
 * cosas, como en el resto del panel: no se confirma la existencia de nada.
 *
 * Los puntos se leen con `fichaDareUp`, el lector del módulo de DareUp, en vez de volver a sacar
 * `pointsBalance` por nuestra cuenta. No es por ahorrar una columna: es que "cuántos puntos tiene
 * alguien" debe tener UNA definición, y el día que deje de ser el saldo denormalizado, esta pantalla
 * se entera sola.
 */
export async function fichaCuenta(db: PrismaClient, userId: string): Promise<FichaCuenta | null> {
  const fila = await db.user.findFirst({ where: { id: userId, deletedAt: null }, select: CAMPOS });
  if (!fila) return null;
  const dareup = await fichaDareUp(db, userId);
  return { cuenta: aCuenta(fila), puntos: dareup?.puntos ?? 0 };
}

export type ResultadoEmail =
  { estado: "hecho"; email: string | null } | { estado: "rechazado"; motivo: "NO_ENCONTRADA" };

/**
 * EL EMAIL DE UNA CUENTA, con rastro. Se lee y se anota en la MISMA transacción, y en ese orden: si
 * la anotación falla, la transacción revierte y nadie se lleva la dirección. Un registro de accesos
 * que se pueda saltar cuando algo va mal no es un registro de accesos.
 *
 * Puede devolver `email: null` legítimamente: una cuenta de OAuth sin dirección, o una anonimizada.
 * Se anota igual — lo que se registra es QUE SE MIRÓ, no qué había.
 */
export async function emailDeCuenta(
  db: PrismaClient,
  entrada: { actorId: string; userId: string },
): Promise<ResultadoEmail> {
  return db.$transaction(async (tx): Promise<ResultadoEmail> => {
    const fila = await tx.user.findFirst({
      where: { id: entrada.userId, deletedAt: null },
      select: { email: true },
    });
    if (!fila) return { estado: "rechazado", motivo: "NO_ENCONTRADA" };

    await tx.auditLog.create({
      data: {
        actorId: entrada.actorId,
        action: "EMAIL_VIEW",
        targetType: "USER",
        targetId: entrada.userId,
        // El rastro dice quién miró y a quién. La dirección NO se copia aquí: duplicar la PII en la
        // tabla de auditoría multiplicaría el problema que el registro existe para vigilar.
        metadata: {},
      },
    });
    return { estado: "hecho", email: fila.email };
  });
}
