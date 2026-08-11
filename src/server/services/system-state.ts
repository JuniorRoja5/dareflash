import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Acceso a `SystemState` (clave/valor durable en BD). Helpers COMPARTIDOS: los usa el worker
 * (histeresis del aviso de FAILED, marca de wake del confirm) y la ruta upload-credential (escribe
 * la marca DENTRO de su $transaction).
 *
 * El parametro se tipa con la forma MINIMA que necesita (`Pick<PrismaClient, "systemState">`) a
 * proposito: asi acepta TANTO el PrismaClient completo COMO el cliente de transaccion
 * (`Prisma.TransactionClient`), que NO es asignable a PrismaClient. Evita el `tx as PrismaClient`
 * (cast que oculta el problema).
 */
type ClienteEstado = Pick<PrismaClient, "systemState">;

/** Lee un valor de SystemState (o null si la clave no existe). */
export async function leerEstado(db: ClienteEstado, key: string): Promise<string | null> {
  const row = await db.systemState.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? null;
}

/** Escribe (upsert) un valor de SystemState. */
export async function escribirEstado(db: ClienteEstado, key: string, value: string): Promise<void> {
  await db.systemState.upsert({ where: { key }, create: { key, value }, update: { value } });
}
