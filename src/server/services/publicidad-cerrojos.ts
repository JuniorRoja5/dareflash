/**
 * EL ORDEN DE CERROJOS DE LA PUBLICIDAD (Fase 9 · P9) — UNO solo para TODAS las operaciones sobre una
 * campaña: activar, reanudar, pausar, terminar, cobrar el día, denunciar, absolver y retirar.
 *
 *     Empresa → Report → Publicidad → ZonaOcupacion → PublicidadCiudad → CreditoLedger
 *
 * Una operación puede SALTARSE tablas (pausar no toca la Empresa), pero nunca VOLVER a una anterior
 * después de tocar una posterior: dos transacciones que cogen dos filas en orden contrario se esperan
 * la una a la otra, y MariaDB mata a una con un deadlock (1213). Con un solo orden no hay ciclo posible.
 * Volver a tocar una fila que la operación YA tiene (la Empresa al escribir el saldo, la campaña al
 * cambiar su estado) no es coger un cerrojo nuevo: ya es suyo.
 *
 * POR QUÉ ESTE ORDEN:
 *  - La EMPRESA, la primera y como PRIMERA sentencia de la transacción: serializa todo lo que mueve o
 *    compromete su saldo, y la instantánea se toma DESPUÉS de esperarla (lo comprometido se lee con lo
 *    que la otra transacción acaba de confirmar). Por eso su id se lee ANTES, fuera de la transacción
 *    (una campaña no cambia de empresa).
 *  - Las DENUNCIAS antes que la campaña porque así va `denunciar` desde la Fase 5: crea la denuncia y,
 *    si cruza el umbral, pausa. Retirar iba al revés (campaña y luego denuncias): una retirada y una
 *    denuncia a la vez se esperaban la una a la otra. Lo cerró P9.
 *  - El LEDGER el último: el cobro y la devolución de un día se escriben cuando la campaña y su
 *    ocupación ya están decididas.
 *
 * Las tablas de solo inserción que no comparten filas (AuditLog, Job, Notification) quedan fuera:
 * cada operación escribe filas nuevas suyas, y no hay nada que esperar.
 *
 * LO VIGILA `tests/publicidad-cerrojos.test.ts`, que EJECUTA cada operación con un cliente que apunta
 * qué tablas bloquea y en qué orden: invertirlo en cualquiera la pone en rojo.
 */
import type { Db } from "@/server/db/types";

export const ORDEN_CERROJOS_PUBLICIDAD = [
  "Empresa",
  "Report",
  "Publicidad",
  "ZonaOcupacion",
  "PublicidadCiudad",
  "CreditoLedger",
] as const;

/**
 * BLOQUEA LA FILA DE LA EMPRESA (FOR UPDATE). Va lo PRIMERO de toda transacción que mueve o compromete
 * saldo: serializa a las operaciones de una misma empresa, y como es la primera sentencia, la
 * instantánea de la transacción se toma DESPUÉS de esperar a este cerrojo. Sin él, dos activaciones a
 * la vez leerían las dos «nada comprometido» y entrarían las dos con el saldo de una.
 */
export async function bloquearEmpresa(tx: Db, empresaId: string): Promise<void> {
  await tx.$queryRaw`SELECT \`id\` FROM \`Empresa\` WHERE \`id\` = ${empresaId} FOR UPDATE`;
}

function esReintentable(e: unknown): boolean {
  const texto = e instanceof Error ? e.message : String(e);
  return (
    texto.includes("Record has changed since last read") ||
    texto.includes("Code: `1020`") ||
    texto.includes("Deadlock found") ||
    texto.includes("Code: `1213`")
  );
}

/** Cuántas veces se reintenta ante un 1020/1213. Con 3 plazas por zona, sobra para una avalancha. */
const REINTENTOS = 12;

/**
 * REINTENTA LA TRANSACCIÓN ENTERA ante un 1020 (instantánea vieja, ver CLAUDE.md) o un 1213 (deadlock).
 * Solo es seguro porque la transacción fallida se deshizo entera y todo lo que escribe es idempotente
 * (claves únicas). Si se agotan los intentos, el error SUBE: uno que se traga es peor que uno que se ve.
 */
export async function conReintentos<T>(fn: () => Promise<T>): Promise<T> {
  for (let intento = 0; ; intento += 1) {
    try {
      return await fn();
    } catch (e) {
      if (!esReintentable(e) || intento >= REINTENTOS) throw e;
      await new Promise((r) => setTimeout(r, 5 * (intento + 1) + Math.floor(Math.random() * 5)));
    }
  }
}
