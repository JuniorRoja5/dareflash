/**
 * EL REGALO SEMANAL DEL VIP (Fase 8 · P5): +1 boost por semana a cada VIP activo.
 *
 * ┌─ ES UN FAN-OUT, Y SE PARECE AL DEL ANUNCIO A PROPÓSITO ─────────────────────────────────────┐
 * │ El problema es el mismo —recorrer una audiencia que crece y escribirle algo a cada uno— y ya │
 * │ está resuelto en `anuncios`: keyset sobre `User.id` (nunca OFFSET), tramos acotados, y la     │
 * │ continuación se encola con su cursor en el payload. Lo que cambia es QUÉ se escribe y quién  │
 * │ es la audiencia; copiar la forma hace que un fallo que ya se entendió una vez no haya que    │
 * │ volver a entenderlo.                                                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LA IDEMPOTENCIA NO ES UN `if`, ES LA CLAVE ────────────────────────────────────────────────┐
 * │ `vip-weekly:${userId}:${semanaIso}` es ÚNICA en `BoostLedger`. Re-ejecutar el job, que dos   │
 * │ runs se solapen, que el worker muera a mitad de tramo y lo reanude, o que el cursor vuelva a │
 * │ pasar por alguien: nada de eso acredita un segundo boost. El cursor es solo EFICIENCIA —no   │
 * │ recorrer desde el principio—; la CORRECCIÓN la da la clave.                                  │
 * │                                                                                               │
 * │ Por eso el keyset puede ser "best effort" ante una audiencia que cambia entre tramos: quien  │
 * │ se suscribe a mitad de reparto puede quedar por detrás del cursor y no cobrar esta semana    │
 * │ (cobra la siguiente), y quien se mueva no cobra dos veces porque la clave no deja.           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ VETO DEL DEADLOCK ─────────────────────────────────────────────────────────────────────────┐
 * │ `applyBoostCredits` abre SU PROPIA transacción con `SELECT … FOR UPDATE` sobre la fila del   │
 * │ `User`, igual que la compra. Aquí se llama UNA PERSONA A LA VEZ y FUERA de cualquier otra    │
 * │ transacción: nada de envolver el lote entero en una, que mantendría N filas de `User`        │
 * │ bloqueadas a la vez y en orden distinto según por dónde fuera el cursor — el ciclo de        │
 * │ deadlock servido en bandeja. Un tramo es N transacciones cortas, no una larga.               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ACUMULA Y NO CADUCA, como cualquier otro boost: el saldo es la suma de deltas y un boost sin
 * usar es simplemente saldo. Si algún día se quisiera que el regalo caducara, eso es una columna y
 * una pieza nuevas, no un cambio aquí.
 *
 * Sin `server-only`, como el resto de lo que usa el worker.
 */
import {
  FANOUT_LOTE,
  FANOUT_LOTES_POR_EJECUCION,
  RAZON_BOOST_VIP_SEMANAL,
  REF_BOOST_VIP,
  VIP_BOOST_SEMANAL,
} from "@/config/constants";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { esVipActivo } from "@/lib/vip";
import { semanaIso } from "@/lib/periodo";
import { sanearError } from "@/server/observability/sanitize-error";

import { applyBoostCredits } from "./ledger";

export const TIPO_JOB_VIP_BOOST = "VIP_BOOST_SEMANAL";

/**
 * La clave del MOVIMIENTO: una por persona y semana. Es la que hace que todo lo demás pueda
 * reintentarse sin miedo, así que vive aquí y en ningún otro sitio.
 */
export function claveRegaloSemanal(userId: string, semana: string): string {
  return `vip-weekly:${userId}:${semana}`;
}

/** La clave de cada TRAMO del reparto: el primero ("inicio") y cada continuación, con su cursor. */
export function claveTramoSemanal(semana: string, desde: string | null): string {
  return `${TIPO_JOB_VIP_BOOST}:${semana}:${desde ?? "inicio"}`;
}

const esDuplicado = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export interface TramoRegalo {
  /** Boosts acreditados AHORA. Los que ya tenían su fila no cuentan: la clave los para. */
  acreditados: number;
  /** Suscripciones MIRADAS en este tramo, cobren o no. Para el log: dice si el barrido avanza. */
  revisados: number;
  /** Cursor para el tramo siguiente, o `null` si ya no queda audiencia. */
  siguiente: string | null;
}

/**
 * REPARTIR un tramo de la semana `semana`: desde `desde` (exclusivo), hasta `lotes` lotes.
 *
 * La audiencia se recorre sobre `Subscription`, no sobre `User`: los VIP son un puñado frente a
 * todas las cuentas, y recorrer la tabla entera para preguntar por cada una si tiene plan sería
 * pagar el censo completo cada semana. El orden es por `userId`, que es ÚNICO en esa tabla (una
 * fila por persona), así que el keyset tiene un orden total sin necesitar desempate.
 */
export async function repartirBoostSemanal(
  db: PrismaClient,
  entrada: { semana: string; desde?: string | null; ahora?: Date },
  opciones: { lote?: number; lotes?: number; log?: (m: string) => void } = {},
): Promise<TramoRegalo> {
  const lote = opciones.lote ?? FANOUT_LOTE;
  const lotes = opciones.lotes ?? FANOUT_LOTES_POR_EJECUCION;
  const ahora = entrada.ahora ?? new Date();

  let cursor = entrada.desde ?? null;
  let acreditados = 0;
  let revisados = 0;

  for (let i = 0; i < lotes; i += 1) {
    const filas = await db.subscription.findMany({
      where: {
        // El filtro por fecha va EN LA CONSULTA para no traer las vencidas, pero quien DECIDE es
        // `esVipActivo` justo abajo: aquí no se interpreta el estado, igual que en el chokepoint.
        periodoFin: { gt: ahora },
        ...(cursor ? { userId: { gt: cursor } } : {}),
      },
      orderBy: { userId: "asc" },
      take: lote,
      select: { userId: true, estado: true, periodoFin: true },
    });
    if (filas.length === 0) return { acreditados, revisados, siguiente: null };

    for (const f of filas) {
      revisados += 1;
      // EL CHOKEPOINT, no un flag: una CORTADA con el periodo por delante no cobra, y una ACTIVA
      // vencida tampoco (esa ya no llega hasta aquí, pero la decisión es de `esVipActivo`).
      if (!esVipActivo(f, ahora)) continue;
      try {
        const r = await applyBoostCredits(db, {
          userId: f.userId,
          delta: VIP_BOOST_SEMANAL,
          reason: RAZON_BOOST_VIP_SEMANAL,
          // SIN IMPORTE NI MONEDA: es un REGALO, no una compra. El "valor 5 $" del documento
          // maestro es copy de venta; meterlo aquí convertiría el regalo en un movimiento de
          // dinero que nadie ha cobrado y descuadraría cualquier cuenta que sume importes.
          refType: REF_BOOST_VIP,
          refId: entrada.semana,
          idempotencyKey: claveRegaloSemanal(f.userId, entrada.semana),
        });
        if (r.applied) acreditados += 1;
      } catch (e) {
        // UNA PERSONA QUE FALLA NO TUMBA EL TRAMO. Su fila no se escribió, así que la clave sigue
        // libre y el próximo barrido —o el reintento del job— la recoge. Tumbar el tramo entero
        // por una fila dejaría sin boost a todos los que vienen detrás del cursor.
        opciones.log?.(`[vip-boost] ${f.userId} falló (${sanearError(e)}); se reintenta luego.`);
      }
    }

    cursor = filas[filas.length - 1]!.userId;
    if (filas.length < lote) return { acreditados, revisados, siguiente: null };
  }
  return { acreditados, revisados, siguiente: cursor };
}

/**
 * Encola un tramo. Su clave lleva la SEMANA y el CURSOR, así que ni se arranca dos veces la misma
 * semana ni se encolan dos continuaciones del mismo tramo. Devuelve `false` si ya estaba.
 */
export async function encolarTramoSemanal(
  db: PrismaClient,
  semana: string,
  desde: string | null,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    await db.job.create({
      data: {
        type: TIPO_JOB_VIP_BOOST,
        payload: { semana, ...(desde ? { desde } : {}) },
        runAt: now,
        idempotencyKey: claveTramoSemanal(semana, desde),
      },
    });
    return true;
  } catch (e) {
    if (esDuplicado(e)) return false;
    throw e;
  }
}

/**
 * EL DISPARADOR, que corre en el barrido del worker: ¿ya se arrancó el reparto de esta semana?
 *
 * No hay cron ni calendario: se intenta crear el job de cabeza con la clave de la semana, y la
 * UNIQUE decide. La primera vez de la semana lo crea; las demás, no-op. Eso es lo que hace que un
 * worker apagado el lunes reparta solo al volver el martes —nadie pierde su boost— y que dos
 * workers a la vez no arranquen dos repartos.
 */
export async function arrancarRepartoSemanal(
  db: PrismaClient,
  ahora: Date = new Date(),
): Promise<{ semana: string; arrancado: boolean }> {
  const semana = semanaIso(ahora);
  return { semana, arrancado: await encolarTramoSemanal(db, semana, null, ahora) };
}
