/**
 * Servicio de LEDGER: el primitivo de dinero/puntos/boosts del que dependen las
 * Fases 4, 6 y 7. Es puro y autocontenido.
 *
 * GARANTIAS (documento de arquitectura, seccion 6):
 *  - Ledgers de SOLO-INSERCION: una fila por movimiento.
 *  - El saldo denormalizado del User se ajusta en la MISMA transaccion que la
 *    insercion del movimiento, bloqueando la fila del User con SELECT ... FOR UPDATE.
 *  - `idempotencyKey` UNICA: una operacion no se aplica dos veces.
 *  - Dinero en enteros (centimos).
 *
 * ┌─ REGLA DE ORDEN DE BLOQUEO (no romper) ────────────────────────────────────┐
 * │ SIEMPRE se bloquea PRIMERO la fila del User (FOR UPDATE), en TODAS las       │
 * │ operaciones y en el MISMO orden. Los interbloqueos (deadlocks) aparecen      │
 * │ cuando dos transacciones toman los mismos bloqueos en orden distinto; son de │
 * │ los errores mas dificiles de reproducir. Como los tres saldos viven en la    │
 * │ fila del User, un unico bloqueo (el del User, siempre el primero) los cubre.  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Este modulo NO importa el singleton `server-only`: recibe el `PrismaClient` por
 * parametro (inyeccion de dependencia). Asi es testeable desde Node/Vitest y
 * reutilizable desde los jobs.
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Opciones de la transaccion interactiva. EXPLICITAS a proposito: bajo contencion,
 * los valores por defecto de Prisma cortan transacciones legitimas y provocan
 * fallos intermitentes en produccion que no se reproducen en local.
 *  - maxWait: cuanto esperar para OBTENER una conexion/empezar la transaccion.
 *  - timeout: cuanto puede DURAR la transaccion una vez empezada.
 */
export const LEDGER_TX_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000,
} as const;

export type LedgerErrorCode = "USER_NOT_FOUND" | "INSUFFICIENT_BALANCE";

export class LedgerError extends Error {
  constructor(
    public readonly code: LedgerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

/** Columnas de saldo denormalizado en la fila del User. */
type BalanceColumn = "pointsBalance" | "walletBalanceCents" | "boostBalance";

export interface LedgerResult {
  /** true si se aplico ahora; false si la idempotencyKey ya existia (no-op). */
  applied: boolean;
  /** Saldo resultante de esa columna tras la operacion. */
  balance: number;
}

/**
 * Semillas de test (NO usar en produccion): permiten ensanchar la ventana de carrera
 * y forzar fallos para verificar que los tests tienen dientes. Por defecto, inertes.
 */
export interface LedgerTestSeams {
  /** Pausa (ms) entre la lectura bloqueada y la escritura del saldo. */
  holdMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CoreParams {
  userId: string;
  balanceColumn: BalanceColumn;
  delta: number;
  allowNegative: boolean;
  /** Comprueba si la idempotencyKey ya existe en la tabla del movimiento. */
  idempotencyExists: (tx: Prisma.TransactionClient) => Promise<boolean>;
  /** Inserta la fila del movimiento en su tabla. */
  insertMovement: (tx: Prisma.TransactionClient) => Promise<void>;
}

/**
 * Nucleo comun: bloquea el User, comprueba idempotencia, valida el saldo, inserta
 * el movimiento y escribe el saldo, TODO en una transaccion.
 */
async function applyLedgerCore(
  db: PrismaClient,
  params: CoreParams,
  seams: LedgerTestSeams = {},
): Promise<LedgerResult> {
  const { userId, balanceColumn, delta, allowNegative, idempotencyExists, insertMovement } = params;
  const col = Prisma.raw(`\`${balanceColumn}\``);

  return db.$transaction(async (tx) => {
    // 1) BLOQUEO: la fila del User, SIEMPRE lo primero (ver regla de orden).
    //    FOR UPDATE serializa a los concurrentes sobre este usuario y devuelve el
    //    saldo actual ya bloqueado.
    const locked = await tx.$queryRaw<Array<{ balance: number | bigint }>>(
      Prisma.sql`SELECT ${col} AS balance FROM \`User\` WHERE \`id\` = ${userId} FOR UPDATE`,
    );
    if (locked.length === 0 || locked[0] === undefined) {
      throw new LedgerError("USER_NOT_FOUND", `Usuario ${userId} no existe.`);
    }
    const current = Number(locked[0].balance);

    // 2) IDEMPOTENCIA (despues del bloqueo): si ya se aplico, no-op.
    if (await idempotencyExists(tx)) {
      return { applied: false, balance: current };
    }

    // (semilla de test) ensancha la ventana lectura->escritura.
    if (seams.holdMs) await sleep(seams.holdMs);

    // 3) VALIDACION de saldo.
    const next = current + delta;
    if (!allowNegative && next < 0) {
      throw new LedgerError(
        "INSUFFICIENT_BALANCE",
        `Saldo insuficiente para ${userId}: ${current} + (${delta}) < 0.`,
      );
    }

    // 4) INSERCION del movimiento (solo-insercion).
    await insertMovement(tx);

    // 5) ESCRITURA del saldo (valor absoluto calculado). Se escribe el valor
    //    computado, no un INCREMENT: por eso el FOR UPDATE es imprescindible; sin el,
    //    dos operaciones concurrentes perderian actualizaciones.
    await tx.$executeRaw(Prisma.sql`UPDATE \`User\` SET ${col} = ${next} WHERE \`id\` = ${userId}`);

    return { applied: true, balance: next };
  }, LEDGER_TX_OPTIONS);
}

// ============================================================================
// Operaciones publicas
// ============================================================================

export interface PointsInput {
  userId: string;
  delta: number; // +/- puntos
  reason: string; // union en constants (WIN_CHALLENGE, INVITE_FRIEND...)
  refType?: string;
  refId?: string;
  idempotencyKey: string;
  /** id explicito del movimiento (opcional; util para operaciones deterministas). */
  movementId?: string;
}

export function applyPoints(
  db: PrismaClient,
  input: PointsInput,
  seams?: LedgerTestSeams,
): Promise<LedgerResult> {
  return applyLedgerCore(
    db,
    {
      userId: input.userId,
      balanceColumn: "pointsBalance",
      delta: input.delta,
      allowNegative: false, // los puntos nunca son negativos
      idempotencyExists: async (tx) =>
        (await tx.pointsLedger.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true },
        })) !== null,
      insertMovement: (tx) =>
        tx.pointsLedger
          .create({
            data: {
              ...(input.movementId ? { id: input.movementId } : {}),
              userId: input.userId,
              delta: input.delta,
              reason: input.reason,
              refType: input.refType ?? null,
              refId: input.refId ?? null,
              idempotencyKey: input.idempotencyKey,
            },
          })
          .then(() => undefined),
    },
    seams,
  );
}

export interface WalletInput {
  userId: string;
  amountCents: number; // +/- centimos
  currency: string;
  entryType: string; // CREDIT | DEBIT (union en constants)
  status?: string; // por defecto COMPLETED
  refType?: string;
  refId?: string;
  idempotencyKey: string;
  movementId?: string;
  /** Permitir saldo negativo (p.ej. ajustes administrativos). Por defecto no. */
  allowNegative?: boolean;
}

export function applyWallet(
  db: PrismaClient,
  input: WalletInput,
  seams?: LedgerTestSeams,
): Promise<LedgerResult> {
  return applyLedgerCore(
    db,
    {
      userId: input.userId,
      balanceColumn: "walletBalanceCents",
      delta: input.amountCents,
      allowNegative: input.allowNegative ?? false,
      idempotencyExists: async (tx) =>
        (await tx.walletLedger.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true },
        })) !== null,
      insertMovement: (tx) =>
        tx.walletLedger
          .create({
            data: {
              ...(input.movementId ? { id: input.movementId } : {}),
              userId: input.userId,
              amountCents: input.amountCents,
              currency: input.currency,
              entryType: input.entryType,
              ...(input.status ? { status: input.status } : {}),
              refType: input.refType ?? null,
              refId: input.refId ?? null,
              idempotencyKey: input.idempotencyKey,
            },
          })
          .then(() => undefined),
    },
    seams,
  );
}

export interface BoostCreditsInput {
  userId: string;
  delta: number; // +N al obtener, -1 al activar
  reason: string; // PURCHASE | VIP_WEEKLY | ACTIVATION | REFUND | ADMIN_ADJUST
  amountCents?: number; // solo en compras
  currency?: string; // solo en compras
  refType?: string;
  refId?: string;
  idempotencyKey: string;
  movementId?: string;
}

export function applyBoostCredits(
  db: PrismaClient,
  input: BoostCreditsInput,
  seams?: LedgerTestSeams,
): Promise<LedgerResult> {
  return applyLedgerCore(
    db,
    {
      userId: input.userId,
      balanceColumn: "boostBalance",
      delta: input.delta,
      allowNegative: false, // no se puede gastar mas boosts de los que se tienen
      idempotencyExists: async (tx) =>
        (await tx.boostLedger.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true },
        })) !== null,
      insertMovement: (tx) =>
        tx.boostLedger
          .create({
            data: {
              ...(input.movementId ? { id: input.movementId } : {}),
              userId: input.userId,
              delta: input.delta,
              reason: input.reason,
              amountCents: input.amountCents ?? null,
              currency: input.currency ?? null,
              refType: input.refType ?? null,
              refId: input.refId ?? null,
              idempotencyKey: input.idempotencyKey,
            },
          })
          .then(() => undefined),
    },
    seams,
  );
}
