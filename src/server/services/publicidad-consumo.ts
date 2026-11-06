/**
 * EL CONSUMO DE LA PUBLICIDAD (Fase 9 · P9): cobrar UN día de campaña, devolverlo, y la regla de qué
 * días se cobran. El barrido que cobra cada día está en `publicidad-cobro.ts`; esto es el primitivo que
 * comparten el barrido, activar y reanudar (que cobran HOY en el acto si empiezan hoy), y el umbral de
 * denuncias y la retirada (que lo devuelven).
 *
 * ┌─ LOS DÍAS DE ANTES DE P9 NO SE COBRAN NUNCA ───────────────────────────────────────────────────┐
 * │ Lo prometió el portal de P7 a P8 («los días que se muestren en este tiempo no se cobrarán       │
 * │ nunca»). Se cumple por DOS lados: el primer día que se cobra lo fija la BASE al desplegar (la    │
 * │ migración del cobro escribe en `SystemState` el día SIGUIENTE al despliegue), y nada cobra días │
 * │ pasados: el barrido solo cobra HOY, y activar/reanudar, el día en que empiezan. P9 no se «pone   │
 * │ al día» nunca.                                                                                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UN DÍA SE SIRVE SOLO SI SE HA PAGADO ─────────────────────────────────────────────────────────┐
 * │ La entrega pide un CONSUMO de hoy y que no se haya DEVUELTO (`filtroPagadoHoy`). Nunca un        │
 * │ anuncio servido sin cobrar: si el barrido no ha pasado todavía, la campaña espera (y la plaza   │
 * │ la ocupa el anuncio de la casa); si no le llegaba el saldo, ya no ocupa el día.                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Todo lo de aquí corre DENTRO de una transacción que YA bloqueó la Empresa como primera sentencia
 * (orden de `publicidad-cerrojos.ts`): mueve su saldo, y el primitivo de créditos la vuelve a bloquear
 * (ya es suya: no es un cerrojo nuevo).
 */
import { CLAVE_INICIO_COBRO_PUBLICIDAD } from "@/config/constants";
import type { Prisma } from "@/generated/prisma/client";
import { claveDia } from "@/lib/publicidad";
import type { Db } from "@/server/db/types";

import { aplicarCreditosEnTx, saldoCreditosEmpresa } from "./creditos";

/**
 * EL PRIMER DÍA QUE SE COBRA, el que la migración del cobro dejó en `SystemState`. `null` si no está
 * (una base que no pasó por esa migración, como la de los tests): entonces se cobra todo día que se
 * sirva, que es lo correcto para cualquier día POSTERIOR al despliegue —y a uno anterior no se llega,
 * porque nada cobra días pasados—.
 */
export async function inicioDelCobro(db: Db): Promise<Date | null> {
  const f = await db.systemState.findUnique({
    where: { key: CLAVE_INICIO_COBRO_PUBLICIDAD },
    select: { value: true },
  });
  if (!f) return null;
  const d = new Date(`${f.value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ¿Se cobra ese día? Los anteriores al inicio del cobro, no (se mostraron gratis). */
export function seCobra(dia: Date, inicio: Date | null): boolean {
  return inicio === null || dia >= inicio;
}

export const claveConsumo = (publicidadId: string, dia: Date) =>
  `consumo:${publicidadId}:${claveDia(dia)}`;
export const claveDevolucion = (publicidadId: string, dia: Date) =>
  `devolucion:${publicidadId}:${claveDia(dia)}`;

export type ResultadoCobroDia = "COBRADO" | "YA_COBRADO" | "SIN_SALDO" | "NO_SE_COBRA";

/**
 * COBRA UN DÍA DE UNA CAMPAÑA: una fila de ledger CONSUMO con clave `consumo:{publicidadId}:{dia}` (y
 * la UNIQUE de campaña, día y motivo detrás). No decide qué hacer si no hay saldo: lo dice
 * (`SIN_SALDO`) y no escribe nada, y quien llama pausa y avisa. Idempotente: un día ya cobrado es
 * `YA_COBRADO`.
 */
export async function cobrarDiaEnTx(
  tx: Db,
  e: { empresaId: string; publicidadId: string; dia: Date; tarifa: number; inicio: Date | null },
): Promise<ResultadoCobroDia> {
  if (!seCobra(e.dia, e.inicio)) return "NO_SE_COBRA";
  if (!(e.tarifa > 0)) {
    // Una campaña que sale tiene su tarifa congelada al activar. Sin ella, servirla gratis sería el
    // error que no se ve: mejor que se note.
    throw new Error(`[consumo] la campaña ${e.publicidadId} no tiene tarifa: no se puede cobrar.`);
  }
  const ya = await tx.creditoLedger.findFirst({
    where: { publicidadId: e.publicidadId, dia: e.dia, reason: "CONSUMO" },
    select: { id: true },
  });
  if (ya) return "YA_COBRADO";
  // La Empresa ya está bloqueada (primera sentencia de la transacción): este saldo es el de verdad.
  if ((await saldoCreditosEmpresa(tx, e.empresaId)) < e.tarifa) return "SIN_SALDO";
  await aplicarCreditosEnTx(tx, {
    empresaId: e.empresaId,
    delta: -e.tarifa,
    reason: "CONSUMO",
    refType: "PUBLICIDAD",
    refId: e.publicidadId,
    idempotencyKey: claveConsumo(e.publicidadId, e.dia),
    publicidadId: e.publicidadId,
    dia: e.dia,
  });
  return "COBRADO";
}

/**
 * DEVUELVE EL DÍA YA COBRADO (P9, regla 7): una campaña que ESE día pausa el umbral de denuncias o
 * retira el admin no se cobra ese día. Devuelve exactamente lo que se cobró, con su propia clave; si ese
 * día no se cobró (o ya se devolvió), no hace nada. `true` si devolvió ahora.
 */
export async function devolverDiaEnTx(
  tx: Db,
  e: { empresaId: string; publicidadId: string; dia: Date },
): Promise<boolean> {
  const cobro = await tx.creditoLedger.findFirst({
    where: { publicidadId: e.publicidadId, dia: e.dia, reason: "CONSUMO" },
    select: { delta: true },
  });
  if (!cobro) return false;
  const r = await aplicarCreditosEnTx(tx, {
    empresaId: e.empresaId,
    delta: -cobro.delta,
    reason: "DEVOLUCION",
    refType: "PUBLICIDAD",
    refId: e.publicidadId,
    idempotencyKey: claveDevolucion(e.publicidadId, e.dia),
    publicidadId: e.publicidadId,
    dia: e.dia,
  });
  return r.aplicado;
}

/**
 * ¿Se le devolvió ese día? Un día devuelto no vuelve a mostrarse: si la absuelven o la reanudan ese
 * mismo día, sale al siguiente (servir el resto de un día que se le devolvió sería servirlo gratis).
 */
export async function diaDevuelto(tx: Db, publicidadId: string, dia: Date): Promise<boolean> {
  const d = await tx.creditoLedger.findFirst({
    where: { publicidadId, dia, reason: "DEVOLUCION" },
    select: { id: true },
  });
  return d !== null;
}

/**
 * LA CAMPAÑA HA PAGADO ESE DÍA: tiene su CONSUMO y no se le ha devuelto. Es un `where` de Publicidad, y
 * lo añade la entrega a la regla de qué se sirve (`PUBLICIDAD_SERVIBLE`) para los días que se cobran.
 */
export function filtroPagadoEl(dia: Date): Prisma.PublicidadWhereInput {
  return {
    movimientos: { some: { dia, reason: "CONSUMO" } },
    NOT: { movimientos: { some: { dia, reason: "DEVOLUCION" } } },
  };
}
