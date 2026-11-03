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

// Ni `BOOST_MAX_SIMULTANEOS` ni `BOOST_CARRILES` se importan aquí, y eso es la pieza: el máximo no
// se comprueba contra una constante, lo imponen las filas de `BoostPlaza`; y el carril no se
// calcula, lo trae la plaza que se ocupó. Las dos cifras viven en `constants` para la pantalla y
// para los tests, no para esta decisión.
import {
  BOOST_DAILY_LIMIT,
  BOOST_DURACION_MIN,
  RAZON_BOOST_ACTIVACION,
  REF_BOOST_ACTIVACION,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";
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
  | { estado: "limite"; limite: number }
  /**
   * El cupo global está lleno. NO se debitó nada: el crédito sigue en la cuenta.
   * `minutosParaHueco` son los que faltan para que caduque la aparición más antigua.
   */
  | { estado: "agotado"; maximo: number; minutosParaHueco: number };

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
 * Sentinela PRIVADA del cupo global lleno. Lanzar es lo que deshace la transacción entera, y por
 * eso el crédito NO se gasta: el débito ya está escrito cuando corre `trasAplicar`, así que la
 * única forma de no cobrarle a quien no va a salir es tirar de aquí. Lleva los minutos que faltan
 * porque el copy los necesita y este es el único sitio donde se saben.
 */
class CupoLleno extends Error {
  constructor() {
    super("CUPO_LLENO");
    this.name = "CupoLleno";
  }
}

/**
 * ¿Es el rechazo de MariaDB por conflicto de instantánea (error 1020)?
 *
 * ┌─ QUÉ ES ESTO Y POR QUÉ HAY QUE REINTENTAR ─────────────────────────────────────────────────────┐
 * │ MariaDB 11.6 estrenó `innodb_snapshot_isolation`, y en 11.8 —la versión de producción— viene   │
 * │ ACTIVADO. Con él, una transacción en REPEATABLE READ que intenta escribir una fila que ha      │
 * │ cambiado DESPUÉS de su instantánea ya no lee en silencio una versión vieja: falla con el 1020  │
 * │ y te dice que reintentes. Es una mejora —antes esa misma situación era una anomalía silenciosa │
 * │ de las que se descubren con el saldo descuadrado—, pero obliga a que quien escriba bajo        │
 * │ concurrencia sepa reintentar.                                                                   │
 * │                                                                                                 │
 * │ Aquí pasa en cuanto dos personas destacan a la vez: las dos van a por la misma plaza libre.    │
 * │ Reintentar es SEGURO porque la activación es idempotente por `token`: la transacción fallida   │
 * │ se deshizo entera (ni ledger ni aparición), y el reintento vuelve con la misma clave.          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function esConflictoDeInstantanea(e: unknown): boolean {
  const texto = e instanceof Error ? `${e.message}` : String(e);
  return texto.includes("Record has changed since last read") || texto.includes("Code: `1020`");
}

/**
 * Cuántas veces se reintenta ante un 1020 antes de rendirse.
 *
 * Con el cupo lleno de 60 y una avalancha, cada reintento ve una plaza menos; el número tiene que
 * dar para atravesar un empujón razonable sin convertirse en una espera eterna si algo va mal de
 * verdad. Si se agotan, el error sube: un fallo que se traga es peor que uno que se ve.
 */
const REINTENTOS_INSTANTANEA = 12;

/**
 * Minutos que faltan para que se libere el primer hueco, hacia ARRIBA y mínimo 1.
 *
 * Redondear hacia abajo diría "vuelve en 0 min" cuando aún faltan 40 segundos, y quien vuelve y se
 * lo encuentra lleno otra vez deja de creerse el número. Es puro para poder atarlo con un test.
 */
export function minutosParaHueco(expiraMasAntiguoMs: number, ahoraMs: number): number {
  return Math.max(1, Math.ceil((expiraMasAntiguoMs - ahoraMs) / 60_000));
}

/**
 * El carril MENOS cargado de los vigentes. Con el cupo de `BOOST_MAX_SIMULTANEOS` puesto, esto es
 * lo que garantiza que ningún carril pase de `BOOST_DESTACADOS_PORTADA` apariciones — y de ahí sale
 * la promesa de los minutos en portada (ver `lib/boost-rotacion`).
 *
 * Empates: gana el carril de índice más bajo. Da igual cuál, pero tiene que ser DETERMINISTA, o dos
 * ejecuciones del mismo escenario repartirían distinto y la simulación no probaría nada.
 */
/** Lo que `/boosts` necesita saber del cupo ANTES de que nadie pulse nada. */
export interface EstadoCupo {
  vigentes: number;
  maximo: number;
  lleno: boolean;
  /** Solo cuando está lleno: minutos hasta el primer hueco. */
  minutosParaHueco: number | null;
}

/**
 * ¿Hay sitio ahora mismo?
 *
 * SE LEE SIN CERROJO, y es correcto: esto solo pinta el estado de la pantalla. La decisión de
 * verdad la toma `activarBoost` dentro de su transacción, con el cerrojo puesto. Si entre esta
 * lectura y el clic se ocupa el último hueco, el rechazo llega igual y sin cobrar — la pantalla se
 * habrá quedado un segundo desactualizada, que es el precio correcto por no serializar cada visita
 * a `/boosts` contra las activaciones.
 *
 * Lo que NO se hace es al revés: dejar que la pantalla decida. Un botón habilitado no autoriza
 * nada.
 */
export async function estadoCupo(db: Db, ahora: Date = new Date()): Promise<EstadoCupo> {
  // Se miran las PLAZAS, no las apariciones: son la misma verdad (una plaza ocupada es una
  // aparición vigente) y así la pantalla cuenta exactamente lo mismo que decide el UPDATE que las
  // reclama. Contar apariciones aquí sería una segunda forma de saber lo mismo, y las dos se
  // separan en cuanto una cambie.
  const [libres, total] = await Promise.all([
    db.boostPlaza.count({ where: { libreDesde: { lte: ahora } } }),
    db.boostPlaza.count(),
  ]);
  if (libres > 0) {
    return { vigentes: total - libres, maximo: total, lleno: false, minutosParaHueco: null };
  }
  const siguiente = await db.boostPlaza.findFirst({
    orderBy: { libreDesde: "asc" },
    select: { libreDesde: true },
  });
  return {
    vigentes: total,
    maximo: total,
    lleno: true,
    minutosParaHueco: minutosParaHueco(
      siguiente?.libreDesde.getTime() ?? ahora.getTime(),
      ahora.getTime(),
    ),
  };
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
 * No lanza por los casos esperables —sin saldo, límite del día, intención repetida, cupo lleno—:
 * los devuelve. Sí lanza si el usuario no existe o si la base de datos falla de verdad.
 *
 * REINTENTA ante el 1020 de MariaDB (conflicto de instantánea). Ver `esConflictoDeInstantanea`:
 * es seguro porque la operación es idempotente por `token` y la transacción fallida se deshace
 * entera.
 */
export async function activarBoost(
  db: PrismaClient,
  entrada: EntradaActivacion,
  seams?: LedgerTestSeams,
): Promise<ResultadoActivacion> {
  for (let intento = 0; ; intento += 1) {
    try {
      return await intentarActivar(db, entrada, seams);
    } catch (e) {
      if (!esConflictoDeInstantanea(e) || intento >= REINTENTOS_INSTANTANEA) throw e;
      // Espera MUY corta y creciente: lo que hace falta es que los contendientes no vuelvan todos
      // en el mismo instante, no frenar a nadie.
      await new Promise((r) => setTimeout(r, 5 * (intento + 1)));
    }
  }
}

async function intentarActivar(
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

          // ┌─ EL CUPO SE OCUPA, NO SE COMPRUEBA ─────────────────────────────────────────────────┐
          // │ Un UPDATE que reclama UNA plaza libre. Si no quedaba ninguna, afecta a 0 filas y    │
          // │ eso ES el "lleno": no hay nada que contar, y no puede haber 61 destacados porque no │
          // │ hay 61 plazas.                                                                       │
          // │                                                                                      │
          // │ POR QUÉ UN UPDATE Y NO UN CONTEO (costó dos intentos descubrirlo):                   │
          // │  - Con un cerrojo de una fila + `COUNT`, las 61 simultáneas entraban las 61. El      │
          // │    nivel por defecto es REPEATABLE READ: la lectura normal devuelve el SNAPSHOT de   │
          // │    la transacción, fijado ANTES de esperar al cerrojo. Esperabas tu turno y al       │
          // │    entrar veías el mundo de antes de esperar.                                        │
          // │  - Con una lectura BLOQUEANTE del rango, MariaDB responde error 1020 ("record has    │
          // │    changed since last read") en cuanto esas filas cambiaron tras el snapshot.        │
          // │  - Un UPDATE no tiene ese problema: para escribir, InnoDB lee SIEMPRE la última      │
          // │    versión confirmada. Por eso esto es exacto SIN cerrojo propio.                    │
          // │                                                                                      │
          // │ `ORDER BY posicion, carril`: se llena una plaza de cada carril antes de repetir      │
          // │ carril. Eso reparte la gente entre los doce carriles, que es lo que mantiene la      │
          // │ portada llena cuando hay pocos (ver `lib/boost-rotacion`).                           │
          // └──────────────────────────────────────────────────────────────────────────────────────┘
          const ocupadas = await tx.$executeRaw`
            UPDATE \`BoostPlaza\`
               SET \`libreDesde\` = ${expiresAt}, \`activacionId\` = ${activacionId}
             WHERE \`libreDesde\` <= ${ahora}
             ORDER BY \`posicion\`, \`carril\`
             LIMIT 1`;

          // LLENO. Los minutos que faltan NO se calculan aquí: una lectura normal dentro de esta
          // transacción devuelve la instantánea de antes de que nadie ocupara nada —vería las
          // plazas libres y diría "vuelve en 1 min"—. Se miran FUERA, tras el rollback.
          if (ocupadas === 0) throw new CupoLleno();

          // Qué plaza tocó: de ahí sale el carril de esta aparición, y ya no cambia.
          const plaza = await tx.boostPlaza.findFirstOrThrow({
            where: { activacionId },
            select: { carril: true },
          });

          await tx.boostActivation.create({
            data: {
              id: activacionId,
              userId: entrada.userId,
              startsAt: ahora,
              expiresAt,
              carril: plaza.carril,
            },
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
    if (e instanceof CupoLleno) {
      // Ya FUERA de la transacción abortada, así que esta lectura ve el mundo real y el minutaje
      // es el de verdad. Dentro habría devuelto la instantánea de antes de esperar.
      const cupo = await estadoCupo(db, ahora);
      return {
        estado: "agotado",
        maximo: cupo.maximo,
        minutosParaHueco: cupo.minutosParaHueco ?? 1,
      };
    }
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
