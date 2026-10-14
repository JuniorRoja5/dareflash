/**
 * CIERRE DE RETO (Fase 4). Al vencer el `deadline`, un reto PUBLISHED se cierra: se congela quién ha
 * ganado en `ChallengeResult` y se otorgan los puntos por el ledger. De aquí beberán el palmarés del
 * perfil y el ranking; ninguno de los dos volverá a recorrer el ledger para saber quién ganó.
 *
 * ┌─ POR QUÉ EL CIERRE SON DOS PASOS Y NO UNA TRANSACCIÓN ────────────────────────────────────────┐
 * │  1. NO SE PUEDE: `applyPoints` abre su propia transacción interactiva. Prisma no las anida y   │
 * │     un `TransactionClient` no expone `$transaction`. Meterlo dentro exigiría reescribir el     │
 * │     primitivo de dinero.                                                                       │
 * │  2. NO CONVIENE: tomaría el `FOR UPDATE` de hasta 20 filas de `User` a la vez y las mantendría │
 * │     bloqueadas durante todo el cierre. La regla de orden de bloqueo del ledger existe para no  │
 * │     acumular bloqueos así.                                                                     │
 * │                                                                                                │
 * │ La garantía no es la atomicidad: es que los puntos son una PROYECCIÓN de un hecho durable.     │
 * │ PASO 1 (transacción corta): el HECHO — `ChallengeResult` + `status` + `closedAt` +             │
 * │ `motivoCierre`, todo o nada. PASO 2: los otorgamientos, con claves derivadas de ese hecho, y   │
 * │ `premiadosEn` al terminar. Si el proceso muere en medio, el barrido vuelve a coger el reto     │
 * │ (busca cerrados SIN premiar) y completa lo que falte: las claves ya aplicadas son no-op.       │
 * │ Re-ejecutar CONVERGE al mismo estado final.                                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * REGLA DE ENTRADA AL CÓMPUTO, dura y sin ramas: cuenta la participación que en el instante del
 * cierre es REAL Y VISIBLE — `Submission.status = PUBLISHED` **y** `Video.status = PUBLISHED`. Manda
 * el más restrictivo. Un vídeo en cola (PENDING) o con la codificación fallida (FAILED) no cuenta, y
 * los dos casos se tratan igual: no es que se les dé cero votos, es que no entran. Como el filtro se
 * aplica al leer, un vídeo que termine de codificar DESPUÉS ya no puede colarse: para entonces el
 * hecho está escrito y no se recalcula.
 */
import { DEFAULT_CURRENCY, POINTS } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  analizarEmpate,
  clavePremioCierre,
  clavePuntosCierre,
  decidirCierre,
  top20DeParticipaciones,
  validarResolucionEmpate,
  type DecisionCierre,
  type ParticipacionCierre,
  type RechazoEmpate,
} from "@/lib/cierre-reto";
import { avisoGanasteReto, avisoTop20 } from "@/lib/notificaciones";
import { sanearError } from "@/server/observability/sanitize-error";

import { applyPoints, applyWallet } from "./ledger";
import { emitirAviso } from "./notificaciones";
import { periodoActual, recontarVictoriasDelPeriodo, recontarVictoriasTotales } from "./ranking";

export interface ResultadoCierre {
  /** true si ESTA ejecución escribió el hecho (la primera). false si ya estaba cerrado o no tocaba. */
  cerradoAhora: boolean;
  motivo: DecisionCierre["motivo"] | null;
  ganadores: number;
  /** Otorgamientos que se aplicaron AHORA. 0 en una re-ejecución ya completa. */
  puntosAplicados: number;
  /** Premios acreditados al monedero AHORA. 0 en una re-ejecucion ya completa. */
  premiosAcreditados: number;
}

const NADA: ResultadoCierre = {
  cerradoAhora: false,
  motivo: null,
  premiosAcreditados: 0,
  ganadores: 0,
  puntosAplicados: 0,
};

/** Lo que el cierre necesita saber del reto. Un solo `select`, reutilizado. */
const CAMPOS_RETO = {
  id: true,
  status: true,
  deadline: true,
  closedAt: true,
  premiadosEn: true,
  motivoCierre: true,
  winnersCount: true,
  minParticipaciones: true,
  prizeAmountCents: true,
  prizeCurrency: true,
  eliminacionProgramadaEn: true,
  deletedAt: true,
} as const;

/**
 * Cierra UN reto vencido, o completa el cierre de uno que quedó a medias. Idempotente de verdad:
 * llamarlo dos veces deja un solo conjunto de resultados y un solo otorgamiento de puntos.
 *
 * `now` se inyecta para poder probarlo sin esperar a que venza un deadline real.
 */
export async function cerrarRetoVencido(
  db: PrismaClient,
  challengeId: string,
  now: Date = new Date(),
): Promise<ResultadoCierre> {
  const reto = await db.challenge.findUnique({
    where: { id: challengeId },
    select: CAMPOS_RETO,
  });
  if (!reto) return NADA;
  // Un BORRADOR nunca se cierra: no llegó a estar abierto.
  if (reto.status === "DRAFT") return NADA;
  // Todavía no toca. El barrido lo recogerá cuando el reloj lo diga.
  if (reto.deadline > now) return NADA;
  // En camino de desaparecer: no se reparten premios de un reto que el admin está borrando. Si lo
  // restaura, el barrido lo recoge en la vuelta siguiente — el deadline sigue vencido.
  if (reto.eliminacionProgramadaEn !== null || reto.deletedAt !== null) return NADA;
  // Ya cerrado Y ya premiado: nada que hacer. Este corte es lo que acota la re-entrada — sin él se
  // recalcularía el top-20 en cada vuelta, y un `voteCount` reconciliado después del cierre podría
  // dar puntos a alguien que no estaba en el conjunto congelado.
  if (reto.closedAt !== null && reto.premiadosEn !== null) return NADA;

  let cerradoAhora = false;
  let motivo = reto.motivoCierre as DecisionCierre["motivo"] | null;

  if (reto.closedAt === null) {
    // ---- PASO 1: el HECHO. Transacción corta: Challenge, ChallengeResult y sus dos cachés ----
    //
    // Aquí decía "ni un User", y dejó de ser cierto cuando las victorias de por vida pasaron a
    // `User.victoriasTotales`. Lo que aquella línea protegía sigue intacto, que es lo que importa:
    //  · se tocan SOLO los GANADORES (`winnersCount`, hoy 1), no el top-20 —eso es el paso 2, y era
    //    el caso que motivaba la regla: mantener hasta 20 filas de `User` bloqueadas a la vez;
    //  · es un UPDATE normal, SIN `SELECT ... FOR UPDATE`: el orden de bloqueo del ledger —la fila
    //    del `User` SIEMPRE primero— no se contradice, porque aquí no se toma ese bloqueo, y
    //    `applyPoints` no toca `Challenge` ni `ChallengeResult`, así que no hay ciclo posible.
    const decision = await decidirDesdeBd(db, reto.id, reto);

    cerradoAhora = await db.$transaction(async (tx) => {
      // GUARDA DE LA CARRERA: solo una ejecución consigue pasar `closedAt` de NULL a una fecha. Si
      // dos barridos coinciden (dos workers, o uno lento y el tick siguiente), la segunda ve 0.
      const ganado = await tx.challenge.updateMany({
        where: { id: reto.id, closedAt: null },
        data: { status: "CLOSED", closedAt: now, motivoCierre: decision.motivo },
      });
      if (ganado.count === 0) return false;

      if (decision.ganadores.length > 0) {
        await tx.challengeResult.createMany({
          data: decision.ganadores.map((g) => ({
            challengeId: reto.id,
            userId: g.userId,
            submissionId: g.submissionId,
            rank: g.rank,
            // PREMIO CONGELADO aquí y ahora: editar el premio del reto después NO cambia lo debido.
            // El reparto entre VARIOS ganadores no está decidido, así que no se inventa una división:
            // el importe va íntegro al rank 1 y 0 al resto. Con `winnersCount` = 1 —todos los retos de
            // hoy— esto es exactamente lo correcto, no un provisional.
            prizeAmountCents: g.rank === 1 ? reto.prizeAmountCents : 0,
            currency: reto.prizeCurrency,
          })),
          skipDuplicates: true,
        });
        // Los DOS cachés de victorias se escriben en la MISMA transacción que el hecho: o están las
        // tres cosas o no está ninguna. Con valor ABSOLUTO recontado, no incrementos, para que
        // re-ejecutar el cierre converja (ver `recontarVictoriasDelPeriodo`).
        const ganadores = decision.ganadores.map((g) => g.userId);
        await recontarVictoriasDelPeriodo(tx, ganadores, periodoActual(now));
        await recontarVictoriasTotales(tx, ganadores);
      }
      return true;
    });
    if (cerradoAhora) motivo = decision.motivo;
  }

  // ---- PASO 2: la PROYECCIÓN. Se re-ejecuta sin miedo: cada otorgamiento es idempotente ----
  const proyeccion = await proyectarCierre(db, reto.id, now);

  return {
    cerradoAhora,
    motivo,
    ganadores: await db.challengeResult.count({ where: { challengeId: reto.id } }),
    puntosAplicados: proyeccion.puntosAplicados,
    premiosAcreditados: proyeccion.premiosAcreditados,
  };
}

/**
 * LA PROYECCIÓN ENTERA DE UN CIERRE: el dinero y los puntos. Vive FUERA de la transacción del paso 1,
 * y eso no es una preferencia de estilo — es el veto del deadlock:
 *
 * ┌─ POR QUÉ EL DINERO NO PUEDE IR DENTRO DE LA TRANSACCIÓN DEL HECHO ────────────────────────────┐
 * │ Acreditar bloquea la fila del `User` con `SELECT … FOR UPDATE` (orden de bloqueo fijo del      │
 * │ ledger: el usuario SIEMPRE primero). El paso 1 ya tiene bloqueadas filas de CONTENIDO —el      │
 * │ `Challenge` y sus `ChallengeResult`—. Anidar un bloqueo de `User` dentro de esa transacción    │
 * │ es exactamente la receta de un deadlock: dos cierres concurrentes, cada uno con una mitad.     │
 * │ Primero se escribe QUIÉN ganó; después, aparte, se le paga.                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `premiadosEn` lo marca ESTA función y no las de dentro, porque ahora el cierre promete DOS cosas y
 * la marca significa "las dos están". Si falla cualquiera —el dinero o los puntos—, no se marca y el
 * barrido vuelve a pasar: con las claves idempotentes, repetir no duplica nada y repara lo que faltó.
 *
 * EL DINERO VA PRIMERO. Da igual para la corrección (los dos lados se reintentan), pero no para lo
 * que pasa si el proceso muere en medio: es mejor que lo que quede a deber sea un marcador que una
 * transferencia.
 */
async function proyectarCierre(
  db: PrismaClient,
  challengeId: string,
  now: Date,
): Promise<{ premiosAcreditados: number; puntosAplicados: number }> {
  const premios = await acreditarPremiosDelCierre(db, challengeId);
  const puntos = await otorgarPuntosDelCierre(db, challengeId);

  if (premios.fallos === 0 && puntos.fallos === 0) {
    await db.challenge.updateMany({
      where: { id: challengeId, premiadosEn: null },
      data: { premiadosEn: now },
    });
  }
  return { premiosAcreditados: premios.acreditados, puntosAplicados: puntos.aplicados };
}

/**
 * ACREDITA EL PREMIO a cada ganador, en su monedero.
 *
 * EL IMPORTE SALE DE `ChallengeResult`, NO DEL RETO. Está congelado ahí desde el cierre justamente
 * para esto: editar el premio del reto después no cambia lo que se debe. Leerlo del `Challenge` en
 * este punto reabriría esa puerta.
 *
 * QUIEN TIENE 0, NO COBRA. No es un caso raro: es la regla del reparto, ya decidida y escrita en el
 * paso 1 —el importe va ÍNTEGRO al rank 1 y 0 al resto, porque repartir entre varios ganadores es una
 * decisión que nadie ha tomado—. Un reto con premio 0 tampoco acredita nada. Un `CREDIT` de cero
 * sería una fila de dinero que no mueve dinero: ruido en el sitio donde menos conviene.
 *
 * LA MONEDA SE COMPRUEBA ANTES DEL IMPORTE, y es el guardián de una suposición que el esquema hace
 * explícita: `User.walletBalanceCents` es UN número, así que da por hecho que todos los movimientos
 * de una persona van en la misma moneda. Un premio congelado en otra moneda no se convierte ni se
 * acredita "a ver": se deja sin acreditar y se registra, porque sumar céntimos de dos monedas en un
 * mismo saldo no falla — da un número que parece dinero y no lo es.
 *
 * UN GANADOR QUE FALLA NO TUMBA A LOS DEMÁS. Se anota y se sigue, igual que en los puntos: sin
 * `premiadosEn`, el barrido reintenta y la clave idempotente impide pagar dos veces.
 */
async function acreditarPremiosDelCierre(
  db: PrismaClient,
  challengeId: string,
): Promise<{ acreditados: number; fallos: number }> {
  const ganadores = await db.challengeResult.findMany({
    where: { challengeId },
    select: { userId: true, prizeAmountCents: true, currency: true },
  });

  let acreditados = 0;
  let fallos = 0;
  for (const g of ganadores) {
    if (g.prizeAmountCents <= 0) continue;
    if (g.currency !== DEFAULT_CURRENCY) {
      fallos += 1;
      console.error(
        `[cierre] premio de ${g.userId} en ${challengeId} congelado en ${g.currency} y el monedero` +
          ` es ${DEFAULT_CURRENCY}: no se acredita`,
      );
      continue;
    }
    try {
      const r = await applyWallet(db, {
        userId: g.userId,
        amountCents: g.prizeAmountCents,
        currency: g.currency,
        entryType: "CREDIT",
        refType: "CHALLENGE",
        refId: challengeId,
        idempotencyKey: clavePremioCierre({ challengeId, userId: g.userId }),
      });
      if (!r.applied) continue;
      acreditados += 1;
      // LA AUDITORÍA, SOLO CUANDO SE ACREDITÓ DE VERDAD. `AuditLog` no tiene clave única, así que
      // escribirla siempre llenaría la traza de duplicados en cada reintento del barrido. Atada a
      // `applied`, hay exactamente una línea por pago — que es lo que se va a leer el día que
      // alguien pregunte por qué tiene ese saldo. El actor es el SISTEMA (`null`): no lo hizo nadie.
      await db.auditLog.create({
        data: {
          actorId: null,
          action: "WALLET_PRIZE_CREDIT",
          targetType: "USER",
          targetId: g.userId,
          metadata: { challengeId, amountCents: g.prizeAmountCents, currency: g.currency },
        },
      });
    } catch (e) {
      fallos += 1;
      console.error(`[cierre] premio de ${g.userId} en ${challengeId}: ${sanearError(e)}`);
    }
  }
  return { acreditados, fallos };
}

/**
 * Lee las participaciones que CUENTAN y decide. La regla de entrada vive entera en este `where`, en un
 * solo sitio: Submission publicada Y su Video publicado.
 */
async function participacionesQueCuentan(
  db: PrismaClient,
  challengeId: string,
): Promise<ParticipacionCierre[]> {
  const filas = await db.submission.findMany({
    where: {
      challengeId,
      status: "PUBLISHED",
      // El más restrictivo manda. Sin esta condición, una Submission publicada cuyo vídeo se retiró o
      // falló después seguiría contando, y el reto premiaría algo que nadie puede ver.
      video: { is: { status: "PUBLISHED" } },
    },
    select: { id: true, userId: true, voteCount: true, createdAt: true },
  });
  return filas.map((f) => ({
    submissionId: f.id,
    userId: f.userId,
    voteCount: f.voteCount,
    createdAt: f.createdAt,
  }));
}

async function decidirDesdeBd(
  db: PrismaClient,
  challengeId: string,
  reglas: { winnersCount: number; minParticipaciones: number | null },
): Promise<DecisionCierre> {
  return decidirCierre({
    participaciones: await participacionesQueCuentan(db, challengeId),
    ...reglas,
  });
}

/**
 * Otorga los puntos del cierre y marca `premiadosEn`.
 *
 * Las VICTORIAS salen de `ChallengeResult` —el hecho ya escrito, fuente única— y no de recalcular: si
 * el admin resuelve un empate añadiendo filas, volver a pasar por aquí le da sus puntos sin tocar a
 * nadie más. El top-20 se recalcula, y puede hacerlo con seguridad porque su entrada está congelada:
 * los votos ya no cambian (el deadline pasó) y ninguna participación nueva puede publicarse ya.
 *
 * YA NO MARCA `premiadosEn`: lo hace `proyectarCierre`, porque la marca significa "el cierre está
 * proyectado entero" y ahora eso incluye el DINERO. Si lo marcara aquí, unos puntos correctos con un
 * premio fallido darían el cierre por terminado y nadie volvería a intentar el pago. Esta función
 * devuelve sus fallos y deja la decisión arriba, donde se ven los dos lados.
 */
async function otorgarPuntosDelCierre(
  db: PrismaClient,
  challengeId: string,
): Promise<{ aplicados: number; fallos: number }> {
  const reto = await db.challenge.findUnique({
    where: { id: challengeId },
    select: {
      motivoCierre: true,
      winnersCount: true,
      minParticipaciones: true,
      // Foto del reto para el texto de los avisos (GANASTE_RETO / TOP20).
      title: true,
      publicCode: true,
      slug: true,
    },
  });
  if (!reto) return { aplicados: 0, fallos: 0 };
  const foto = { titulo: reto.title, codigo: reto.publicCode, slug: reto.slug };

  const ganadores = await db.challengeResult.findMany({
    where: { challengeId },
    select: { userId: true },
  });
  const ganaron = new Set(ganadores.map((g) => g.userId));

  // El top-20 solo se reparte en un cierre CON GANADORES: un reto que no alcanzó el mínimo, o que
  // sigue esperando al admin, no reparte NADA.
  //
  // El derecho a cobrarlo se decide por el motivo GUARDADO, no por uno recalculado. La diferencia no
  // es teórica: tras resolver el admin un empate, recalcular la decisión sobre unos votos que siguen
  // empatados devuelve "EMPATE_PENDIENTE" para siempre, y el ganador se quedaba sin sus 10 puntos.
  // El hecho lo dice la columna; la lista es solo un orden.
  const top20 =
    reto.motivoCierre === "CON_GANADORES"
      ? top20DeParticipaciones(await participacionesQueCuentan(db, challengeId))
      : [];

  // Ganar y estar en el top-20 son razones DISTINTAS: quien hace las dos cosas cobra las dos, en dos
  // filas de ledger. Esto es una decisión, no un descuido — de ahí que se recorran por separado.
  //
  // Los AVISOS, en cambio, no se duplican: el ganador recibe su GANASTE_RETO y NO un TOP20 del mismo
  // reto —"has ganado" ya lo dice todo y el segundo sería ruido (decisión de producto)—. Sus 10 puntos
  // del top-20 los cobra igual: el aviso cuenta el hecho, no reparte.
  const otorgamientos = [
    ...ganadores.map((g) => ({
      userId: g.userId,
      delta: POINTS.WIN_CHALLENGE,
      razon: "WIN_CHALLENGE",
      aviso: avisoGanasteReto({ challengeId, reto: foto, puntos: POINTS.WIN_CHALLENGE }),
    })),
    ...top20.map((userId) => ({
      userId,
      delta: POINTS.TOP20,
      razon: "TOP20",
      aviso: ganaron.has(userId)
        ? null
        : avisoTop20({ challengeId, reto: foto, puntos: POINTS.TOP20 }),
    })),
  ];

  let aplicados = 0;
  let fallos = 0;
  for (const o of otorgamientos) {
    try {
      const r = await applyPoints(db, {
        userId: o.userId,
        delta: o.delta,
        reason: o.razon,
        refType: "CHALLENGE",
        refId: challengeId,
        idempotencyKey: clavePuntosCierre({ challengeId, userId: o.userId, razon: o.razon }),
      });
      if (r.applied) aplicados += 1;
      // EL AVISO del otorgamiento, justo detrás y con la MISMA disciplina: clave derivada del hecho
      // (este usuario, este tipo, este reto). Se intenta SIEMPRE, no solo cuando los puntos se
      // aplicaron ahora, y es a propósito: en una re-ejecución —el barrido reparando un cierre a medias,
      // o `resolverEmpate`— lo que impide el segundo "Has ganado" es el UNIQUE de la tabla, no un `if`.
      // Y así se repara solo un aviso que se perdiera: si el proceso muere entre los puntos y el aviso,
      // `premiadosEn` no se marca y la siguiente pasada lo escribe.
      if (o.aviso) await emitirAviso(db, o.userId, o.aviso);
    } catch (e) {
      // Un usuario que ya no existe no puede tumbar el cierre de los demás: se anota y se sigue. Sin
      // `premiadosEn`, el barrido reintentará; la clave idempotente impide que se duplique lo dado.
      fallos += 1;
      console.error(
        `[cierre] puntos ${o.razon} de ${o.userId} en ${challengeId}: ${sanearError(e)}`,
      );
    }
  }

  return { aplicados, fallos };
}

/**
 * EL ADMIN RESUELVE UN EMPATE. Recibe las participaciones ganadoras EN ORDEN (la primera es el rank 1)
 * y cierra lo que el sistema se negó a decidir.
 *
 * Reutiliza el mismo camino idempotente: escribe `ChallengeResult`, pasa el motivo a CON_GANADORES y
 * deja que la proyección otorgue los puntos. No hay una segunda implementación del reparto.
 *
 * Solo actúa sobre un reto que de verdad está esperando: si no está en EMPATE_PENDIENTE devuelve
 * `false` sin tocar nada, para que esto no pueda usarse como puerta trasera para reescribir el
 * resultado de un reto ya resuelto.
 */
export async function resolverEmpate(
  db: PrismaClient,
  challengeId: string,
  elegidasEnOrden: readonly string[],
  now: Date = new Date(),
): Promise<ResultadoResolucion> {
  const reto = await db.challenge.findUnique({
    where: { id: challengeId },
    select: { motivoCierre: true, winnersCount: true, prizeAmountCents: true, prizeCurrency: true },
  });
  if (!reto || reto.motivoCierre !== "EMPATE_PENDIENTE") {
    return { resuelto: false, rechazo: "NO_ESPERA", ganadores: 0 };
  }

  // Se recalcula sobre las participaciones que CUENTAN, no sobre lo que mande el cliente. La
  // validación decide qué es admisible; la UI no es la autoridad de nada.
  const validacion = validarResolucionEmpate({
    participaciones: await participacionesQueCuentan(db, challengeId),
    winnersCount: reto.winnersCount,
    elegidas: elegidasEnOrden,
  });
  if (!validacion.ok) return { resuelto: false, rechazo: validacion.rechazo, ganadores: 0 };

  await db.$transaction(async (tx) => {
    await tx.challengeResult.createMany({
      data: validacion.ganadores.map((g) => ({
        challengeId,
        userId: g.userId,
        submissionId: g.submissionId,
        rank: g.rank,
        // Mismo criterio que el cierre automático: íntegro al rank 1, 0 al resto. Resolver un empate
        // no es ocasión de inventar un reparto que nadie ha decidido.
        prizeAmountCents: g.rank === 1 ? reto.prizeAmountCents : 0,
        currency: reto.prizeCurrency,
      })),
      skipDuplicates: true,
    });
    // Mismos cachés, misma transacción: resolver un empate produce victorias como cualquier cierre.
    const ganadores = validacion.ganadores.map((g) => g.userId);
    await recontarVictoriasDelPeriodo(tx, ganadores, periodoActual(now));
    await recontarVictoriasTotales(tx, ganadores);
    // La guarda de la carrera, igual que en el cierre: dos admins pulsando a la vez, uno solo escribe.
    await tx.challenge.updateMany({
      where: { id: challengeId, motivoCierre: "EMPATE_PENDIENTE" },
      data: { motivoCierre: "CON_GANADORES" },
    });
  });

  // LA MISMA PROYECCIÓN que el cierre automático, no una copia: resolver un empate produce ganadores
  // igual que cualquier cierre, así que cobran igual —premio y puntos—. Si esto llamara solo a los
  // puntos, los retos que el admin desempata se cerrarían sin pagar a nadie, y nada fallaría.
  await proyectarCierre(db, challengeId, now);
  return { resuelto: true, rechazo: null, ganadores: validacion.ganadores.length };
}

/**
 * El empate pendiente de UN reto, o `null` si no tiene ninguno. Lo usa la ficha del panel para pintar
 * el bloque de decisión.
 *
 * Devuelve `null` también si el reto está marcado en empate pero el empate ya no existe: no se ofrece
 * una acción vacía. Puede ocurrir si una participación se retira por moderación después del cierre.
 */
export async function empatePendienteDe(
  db: PrismaClient,
  challengeId: string,
): Promise<{ plazas: number; limpios: number; empatados: string[] } | null> {
  const reto = await db.challenge.findUnique({
    where: { id: challengeId },
    select: { motivoCierre: true, winnersCount: true },
  });
  if (!reto || reto.motivoCierre !== "EMPATE_PENDIENTE") return null;

  const empate = analizarEmpate({
    participaciones: await participacionesQueCuentan(db, challengeId),
    winnersCount: reto.winnersCount,
  });
  if (!empate) return null;
  return {
    plazas: empate.plazas,
    limpios: empate.limpios.length,
    empatados: empate.empatados.map((p) => p.submissionId),
  };
}

/**
 * Los retos que están esperando a que el admin rompa un empate, con el reparto pendiente ya analizado.
 * Es lo que alimenta la bandeja del panel: exactamente los `EMPATE_PENDIENTE`, no todos los cerrados.
 */
export async function listarEmpatesPendientes(db: PrismaClient): Promise<EmpatePendiente[]> {
  const retos = await db.challenge.findMany({
    where: { motivoCierre: "EMPATE_PENDIENTE", deletedAt: null },
    select: { id: true, title: true, publicCode: true, winnersCount: true, closedAt: true },
    orderBy: { closedAt: "asc" }, // el que lleva más tiempo atascado, primero
  });

  const salida: EmpatePendiente[] = [];
  for (const r of retos) {
    const empate = analizarEmpate({
      participaciones: await participacionesQueCuentan(db, r.id),
      winnersCount: r.winnersCount,
    });
    // Un reto marcado en empate cuyo empate ya no existe sería una incoherencia: no se pinta como si
    // se pudiera resolver, porque no habría nada que elegir.
    if (!empate) continue;
    salida.push({
      challengeId: r.id,
      title: r.title,
      publicCode: r.publicCode,
      cerradoMs: r.closedAt ? r.closedAt.getTime() : null,
      plazas: empate.plazas,
      limpios: empate.limpios.length,
      empatados: empate.empatados.map((p) => p.submissionId),
    });
  }
  return salida;
}

export interface ResultadoBarridoCierre {
  revisados: number;
  cerrados: number;
}

/**
 * Resultado de resolver un empate. Cuando NO se resuelve dice POR QUÉ: la ruta lo traduce a un
 * mensaje honesto en vez de fingir éxito, que es lo que haría un booleano suelto.
 */
export interface ResultadoResolucion {
  resuelto: boolean;
  /** `NO_ESPERA` = el reto no está en empate (ya resuelto, o nunca lo estuvo). */
  rechazo: RechazoEmpate | "NO_ESPERA" | null;
  ganadores: number;
}

/** Un reto atascado esperando decisión, con lo justo para pintarlo y resolverlo. */
export interface EmpatePendiente {
  challengeId: string;
  title: string;
  publicCode: string;
  cerradoMs: number | null;
  /** Plazas de premio en disputa. */
  plazas: number;
  /** Cuántos ganaron limpio por encima (su posición no se toca). */
  limpios: number;
  /** submissionIds del grupo empatado, en orden canónico. */
  empatados: string[];
}

/**
 * BARRIDO: el disparador REAL del cierre. Lo dispara el RELOJ, no una acción de usuario ni un job
 * encolado al crear el reto (que habría que re-encolar si cambia el deadline y limpiar si el reto se
 * borra; esto solo mira la hora y es auto-reparable).
 *
 * Recoge DOS cosas, y la segunda es la que hace real la auto-reparación: los retos vencidos sin
 * cerrar, y los ya cerrados cuyos puntos quedaron a medias (`premiadosEn` a NULL). Sin lo segundo, un
 * proceso que muera entre el hecho y los premios dejaría esos puntos sin dar para siempre.
 */
export async function cerrarRetosVencidos(
  db: PrismaClient,
  now: Date = new Date(),
  lote = 50,
): Promise<ResultadoBarridoCierre> {
  const pendientes = await db.challenge.findMany({
    where: {
      deadline: { lte: now },
      eliminacionProgramadaEn: null,
      deletedAt: null,
      OR: [
        // Cubierto por @@index([status, deadline]): no hay escaneo aunque no haya nada que cerrar.
        { status: "PUBLISHED", closedAt: null },
        { closedAt: { not: null }, premiadosEn: null },
      ],
    },
    select: { id: true },
    orderBy: { deadline: "asc" }, // los más antiguos primero: nadie se queda atrás indefinidamente
    take: lote,
  });

  let cerrados = 0;
  for (const r of pendientes) {
    try {
      const res = await cerrarRetoVencido(db, r.id, now);
      if (res.cerradoAhora) cerrados += 1;
    } catch (e) {
      // Independiente por reto: que uno falle no puede dejar sin cerrar a los demás.
      console.error(`[cierre] reto ${r.id}: ${sanearError(e)}`);
    }
  }
  return { revisados: pendientes.length, cerrados };
}
