/**
 * ACTIVAR UN BOOST — gastar un crédito para ocupar el espacio destacado.
 *
 * ┌─ TODO PASA BAJO EL MISMO BLOQUEO, Y ESO ES LA PIEZA ──────────────────────────────────────────┐
 * │ Contar las apariciones de hoy y DESPUÉS insertar es el patrón peligroso que el esquema de     │
 * │ `BoostActivation` ya avisaba: entre el SELECT y el INSERT cabe otra petición, las dos leen "2 │
 * │ hoy" y las dos pasan → 4 apariciones con un límite de 3. No es un fallo raro: es el caso      │
 * │ normal de un doble clic con red lenta.                                                        │
 * │                                                                                               │
 * │ Así que el conteo y el insert van DENTRO de `trasAplicar`, que `applyLedgerCore` ejecuta en la │
 * │ misma transacción y con la fila del `User` todavía bloqueada con FOR UPDATE. Ese bloqueo       │
 * │ serializa a los concurrentes sobre ESTE usuario, y es lo que convierte el límite en un límite │
 * │ de verdad en vez de en una comprobación optimista.                                            │
 * │                                                                                               │
 * │ LO QUE IMPORTA ES LA VENTANA, NO EL CLIENTE: contar con `db` en vez de con `tx` aquí dentro    │
 * │ sigue dando el número correcto, porque el concurrente está esperando en el FOR UPDATE. Lo que  │
 * │ rompe el límite es sacar el conteo ARRIBA, fuera de la transacción. Vale la pena saberlo al    │
 * │ revisar: el diente que hay que meter es mover el conteo, no cambiarle el cliente.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL DÉBITO Y LA APARICIÓN SON ATÓMICOS. Si el insert de la `BoostActivation` falla, `trasAplicar`
 * lanza y la transacción entera se deshace: el boost NO se gasta y no queda fila de ledger. Cobrar
 * un crédito por una aparición que no existe es un descuadre, no un fallo menor.
 *
 * EL LÍMITE RECHAZA POR LA MISMA PUERTA. Se descubre DENTRO de la transacción (es el único sitio
 * donde el número es fiable), así que la única forma de abortar es lanzar. Se lanza una sentinela
 * privada y se traduce aquí a un resultado limpio: quien llama no ve una excepción por un caso de
 * uso normal.
 *
 * EL SALDO LO VIGILA EL LEDGER. `applyBoostCredits` va con `allowNegative: false`, así que gastar
 * sin saldo es `INSUFFICIENT_BALANCE` y no hace falta comprobarlo aquí — comprobarlo además, fuera
 * del bloqueo, sería una segunda verdad con una ventana de carrera propia.
 *
 * LA IDEMPOTENCIA ES POR INTENCIÓN Y LA CLAVE LA TRAE EL CLIENTE. Ver `claveActivacion`.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import {
  BOOST_DAILY_LIMIT,
  BOOST_DURACION_MIN,
  RAZON_BOOST_ACTIVACION,
  REF_BOOST_ACTIVACION,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
// EL DÍA UTC VIENE DE `lib/racha`, que ya lo define para la racha. Una segunda función `diaUTC` es
// como se acaba teniendo dos definiciones de "hoy" que discrepan en el borde del día.
import { diaUTC } from "@/lib/racha";

import { applyBoostCredits, LedgerError, type LedgerTestSeams } from "./ledger";

const DIA_MS = 24 * 60 * 60 * 1000;

export type ResultadoActivacion =
  /** Se gastó un boost y la aparición ya está vigente. */
  | {
      estado: "activado";
      activacionId: string;
      empiezaEnMs: number;
      expiraEnMs: number;
      saldo: number;
      /** Incluida ESTA. Es lo que la pantalla enseña como "2 de 3 hoy". */
      usadasHoy: number;
    }
  /** Misma intención reenviada (doble clic, red caída a medias): no se gastó nada otra vez. */
  | { estado: "repetida" }
  /** No hay crédito. No es un error: es el caso que lleva a comprar. */
  | { estado: "sin-saldo" }
  /** Ya se usaron las del día (UTC). Tampoco es un error. */
  | { estado: "limite"; limite: number };

/**
 * Sentinela PRIVADA. Solo existe para abortar la transacción desde dentro de `trasAplicar` cuando el
 * límite ya está gastado; nunca sale de este módulo.
 */
class LimiteDiarioAlcanzado extends Error {
  constructor() {
    super("LIMITE_DIARIO");
    this.name = "LimiteDiarioAlcanzado";
  }
}

/**
 * La clave de idempotencia de una activación.
 *
 * LA TRAE EL CLIENTE (un token por INTENCIÓN de destacar, no por envío), igual que el ajuste de
 * puntos del panel: un reintento de la misma intención llega con el mismo token y es un no-op, y
 * destacar otra vez es otra intención con otro token. Generarla en el servidor haría que cada
 * reintento fuera una activación nueva, que es precisamente lo que un doble clic produce.
 *
 * VA NAMESPACEADA POR USUARIO. Sin el `userId`, el token lo elige quien llama y podría coincidir con
 * el de otra persona: su activación aparecería como "repetida" y se quedaría sin destacar sin que
 * nada fallara. Con el usuario dentro, dos personas pueden mandar el mismo token sin pisarse.
 */
export function claveActivacion(userId: string, token: string): string {
  return `boost:activar:${userId}:${token}`;
}

export interface EntradaActivacion {
  userId: string;
  /** Token de la intención, generado por el cliente. Ver `claveActivacion`. */
  token: string;
  /** Reloj inyectable: el día UTC y el `expiresAt` se derivan de aquí. Por defecto, ahora. */
  ahora?: Date;
  /**
   * Id explícito de la aparición, para operaciones deterministas (y para que un test pueda forzar
   * el fallo del insert con un id que ya existe). Por defecto se genera uno.
   */
  activacionId?: string;
}

/**
 * Gasta un boost y crea la aparición destacada. Idempotente por `token`.
 *
 * No lanza por los casos esperables —sin saldo, límite del día, intención repetida—: los devuelve.
 * Sí lanza si el usuario no existe o si la base de datos falla, que no son casos de uso.
 */
export async function activarBoost(
  db: PrismaClient,
  entrada: EntradaActivacion,
  seams?: LedgerTestSeams,
): Promise<ResultadoActivacion> {
  const ahora = entrada.ahora ?? new Date();
  const activacionId = entrada.activacionId ?? randomUUID();
  // LA DURACIÓN SALE DE LA CONSTANTE, nunca de un número aquí: el mismo valor que lee el copy.
  const expiresAt = new Date(ahora.getTime() + BOOST_DURACION_MIN * 60_000);
  const desde = diaUTC(ahora);
  const hasta = new Date(desde.getTime() + DIA_MS);

  let usadasHoy = 0;

  try {
    const r = await applyBoostCredits(
      db,
      {
        userId: entrada.userId,
        delta: -1,
        reason: RAZON_BOOST_ACTIVACION,
        refType: REF_BOOST_ACTIVACION,
        // La fila de ledger apunta a LA APARICIÓN que pagó, así que el id se decide antes de gastar.
        refId: activacionId,
        idempotencyKey: claveActivacion(entrada.userId, entrada.token),
        trasAplicar: async (tx) => {
          // ┌─ EL CONTEO VA AQUÍ DENTRO, Y ESO ES EL INVARIANTE ──────────────────────────────────┐
          // │ Lo que lo hace correcto es la VENTANA, no el cliente: esto corre con la fila del    │
          // │ `User` bloqueada, así que una segunda petición está esperando en el FOR UPDATE y     │
          // │ cuando llegue a contar ya verá esta aparición. Sacar el conteo ARRIBA, antes de      │
          // │ `applyBoostCredits`, es lo que lo rompe: las dos cuentan antes de que ninguna        │
          // │ bloquee, las dos leen el mismo número y cuela una 4ª. Ese es el diente.              │
          // │                                                                                     │
          // │ Y se cuenta con `tx`, no con `db`, aunque para el límite diera igual (el bloqueo ya  │
          // │ serializa): pedirle una conexión NUEVA al pool mientras esta transacción tiene una   │
          // │ tomada y locks puestos es la forma de agotar el pool y de esperar a uno mismo.       │
          // └─────────────────────────────────────────────────────────────────────────────────────┘
          // `startsAt` en el día UTC [medianoche, +24h) — el índice [userId, startsAt] lo sirve.
          const yaHoy = await tx.boostActivation.count({
            where: { userId: entrada.userId, startsAt: { gte: desde, lt: hasta } },
          });
          if (yaHoy >= BOOST_DAILY_LIMIT) throw new LimiteDiarioAlcanzado();

          await tx.boostActivation.create({
            data: { id: activacionId, userId: entrada.userId, startsAt: ahora, expiresAt },
          });
          usadasHoy = yaHoy + 1;
        },
      },
      seams,
    );

    return r.applied
      ? {
          estado: "activado",
          activacionId,
          empiezaEnMs: ahora.getTime(),
          expiraEnMs: expiresAt.getTime(),
          saldo: r.balance,
          usadasHoy,
        }
      : { estado: "repetida" };
  } catch (e) {
    if (e instanceof LimiteDiarioAlcanzado) return { estado: "limite", limite: BOOST_DAILY_LIMIT };
    if (e instanceof LedgerError && e.code === "INSUFFICIENT_BALANCE") {
      return { estado: "sin-saldo" };
    }
    throw e;
  }
}

/** Lo que la pantalla de /boosts necesita saber del estado de MIS apariciones. */
export interface MiEstadoBoost {
  /** Apariciones que ya he gastado en el día UTC de `ahora`. */
  usadasHoy: number;
  /** Fin de mi aparición vigente, o `null` si no estoy destacado ahora mismo. */
  vigenteHastaMs: number | null;
}

/**
 * Mis apariciones de hoy y si estoy destacado ahora mismo, en UNA consulta.
 *
 * EL `OR` NO ES PEREZA: una aparición que empezó ayer a las 23:40 sigue vigente a las 00:10 de hoy y
 * NO cuenta para el límite de hoy. Las dos preguntas necesitan ventanas distintas, así que se traen
 * las filas de las dos y se separan aquí. El resultado está acotado por el propio límite diario
 * (unas pocas filas por persona), así que no hay nada que paginar.
 */
export async function miEstadoBoost(
  db: PrismaClient,
  userId: string,
  ahora: Date = new Date(),
): Promise<MiEstadoBoost> {
  const desde = diaUTC(ahora);
  const hasta = new Date(desde.getTime() + DIA_MS);

  const filas = await db.boostActivation.findMany({
    where: {
      userId,
      OR: [{ startsAt: { gte: desde, lt: hasta } }, { expiresAt: { gt: ahora } }],
    },
    orderBy: { startsAt: "desc" },
    select: { startsAt: true, expiresAt: true },
  });

  const deHoy = filas.filter((f) => f.startsAt >= desde && f.startsAt < hasta);
  const vigente = filas.find((f) => f.expiresAt > ahora);

  return {
    usadasHoy: deHoy.length,
    vigenteHastaMs: vigente ? vigente.expiresAt.getTime() : null,
  };
}
