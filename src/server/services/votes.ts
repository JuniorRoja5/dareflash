/**
 * VOTO — emitir, mover y quitar. Un voto por usuario y reto.
 *
 * EL MODELO: una fila `Vote` por (usuario, reto) con `submissionId` MUTABLE. Votar es un INSERT,
 * mover es un UPDATE de esa fila y quitar es un DELETE. No hay historial de a quién votaste antes.
 *
 * LA REGLA ES ESTRUCTURAL: "un voto por reto" lo impide `@@unique([userId, challengeId])` en la BD,
 * no un `if` en este archivo. Dos peticiones simultáneas a participaciones distintas del mismo reto
 * no pueden colarse las dos: una recibe el error de clave duplicada y su transacción revierte entera,
 * así que el contador tampoco sube. Un `SELECT ... FROM Vote` previo NO daría esa garantía.
 *
 * EL CONTADOR: `voteCount` se toca SIEMPRE con `{ increment/decrement }` —nunca leer-sumar-escribir—,
 * y ADEMÁS la fila se bloquea antes con `SELECT ... FOR UPDATE`.
 *
 * ┌─ POR QUÉ EL `FOR UPDATE` NO SE PUEDE QUITAR (medido, no supuesto) ─────────────────────────────┐
 * │ Parece redundante: `SET voteCount = voteCount + 1` ya es atómico y aquí no se lee el contador  │
 * │ para decidir nada (a diferencia del ledger, que LEE el saldo para ver si hay fondos). Se probó  │
 * │ a quitarlo y MariaDB devuelve **error 1020, "Record has changed since last read in table       │
 * │ 'Submission'"**, en cuanto dos transacciones tocan la misma fila a la vez: no se pierden votos, │
 * │ pero la petición REVIENTA. Se probó también con `updateMany` (UPDATE pelado, sin los SELECT que │
 * │ Prisma añade alrededor de `update`) y falla igual. Los dos tests de concurrencia de             │
 * │ `tests/vote.test.ts` lo reproducen: quitar el bloqueo los pone en rojo.                         │
 * │ Bloquear primero serializa a los votantes de UNA participación, que es exactamente lo que hace  │
 * │ falta y cuesta microsegundos.                                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL `challengeId` SE DERIVA EN SERVIDOR leyendo la Submission. Jamás llega del cliente: si llegara,
 * cualquiera podría votar N veces en un reto declarando un challengeId falso y el UNIQUE no le pararía.
 *
 * Recibe el `PrismaClient` por parámetro (testeable), como el resto de servicios. Devuelve resultados
 * TIPADOS; traducir un motivo a copy humano es cosa de la ruta, aquí no se inventa texto.
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";

import { LEDGER_TX_OPTIONS } from "./ledger";

/** Por qué se rechaza una operación de voto. La ruta los traduce a copy humano. */
export type MotivoRechazo =
  /** La participación no existe (o el id es basura). */
  | "SIN_PARTICIPACION"
  /** La participación existe pero no está publicada: no se vota lo que no se ve. */
  | "NO_PUBLICADA"
  /** El reto no está abierto: no publicado, aún sin abrir, o ya cerrado. */
  | "RETO_CERRADO"
  /** Es tu propia participación. */
  | "AUTOVOTO"
  /** Ya tienes un voto en ese reto, en OTRA participación (la ruta ofrecerá moverlo). */
  | "YA_VOTO_OTRA"
  /** No hay voto que mover o quitar. */
  | "SIN_VOTO";

export type ResultadoVoto =
  | { estado: "votado" }
  /** Ya habías votado ESA misma participación: idempotente, no se duplica ni se recuenta. */
  | { estado: "ya-votada" }
  | { estado: "movido"; desdeSubmissionId: string }
  /** Mover al sitio donde ya estaba: no-op. */
  | { estado: "sin-cambio" }
  | { estado: "quitado" }
  | { estado: "rechazado"; motivo: MotivoRechazo };

export interface EmitirVotoInput {
  userId: string;
  submissionId: string;
  /** IP hasheada (nunca en claro). Opcional: el servicio no sabe de peticiones HTTP. */
  ipHash?: string | null;
  /** "ahora" inyectable para testear la ventana del reto de forma determinista. */
  ahora?: Date;
}

/** Lo que hay que saber de la participación destino para decidir si se puede votar. */
type DestinoValido = { ok: true; challengeId: string } | { ok: false; motivo: MotivoRechazo };

/**
 * GUARDAS de destino, TODAS dentro de la transacción y leyendo las filas ACTUALES. Comprobarlas fuera
 * sería una condición de carrera: el reto puede cerrarse, o la participación retirarse, entre la
 * comprobación y la escritura.
 *
 * Se exige también que el VÍDEO esté publicado, no solo la Submission: es la "regla del más
 * restrictivo" que usa el resto del sistema para decidir qué se ve. Si no se ve, no se vota.
 */
async function destinoVotable(
  tx: Db,
  userId: string,
  submissionId: string,
  ahora: Date,
): Promise<DestinoValido> {
  const sub = await tx.submission.findUnique({
    where: { id: submissionId },
    select: {
      challengeId: true,
      userId: true,
      status: true,
      video: { select: { status: true } },
      challenge: { select: { status: true, startsAt: true, deadline: true } },
    },
  });

  if (!sub) return { ok: false, motivo: "SIN_PARTICIPACION" };
  if (sub.status !== "PUBLISHED" || sub.video.status !== "PUBLISHED") {
    return { ok: false, motivo: "NO_PUBLICADA" };
  }
  // El autovoto se corta ANTES que la ventana: si es tuya, el motivo útil es ese, no "cerrado".
  if (sub.userId === userId) return { ok: false, motivo: "AUTOVOTO" };

  const c = sub.challenge;
  const abierto =
    c.status === "PUBLISHED" && c.startsAt.getTime() <= ahora.getTime() && c.deadline > ahora;
  if (!abierto) return { ok: false, motivo: "RETO_CERRADO" };

  return { ok: true, challengeId: sub.challengeId };
}

/** ¿El reto de este voto sigue abierto? (para mover/quitar, donde el destino puede no aplicar). */
async function retoAbierto(tx: Db, challengeId: string, ahora: Date): Promise<boolean> {
  const c = await tx.challenge.findUnique({
    where: { id: challengeId },
    select: { status: true, startsAt: true, deadline: true },
  });
  if (!c) return false;
  return c.status === "PUBLISHED" && c.startsAt.getTime() <= ahora.getTime() && c.deadline > ahora;
}

function esViolacionDeUnicidad(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Bloquea las filas de `Submission` cuyo contador se va a tocar, SIEMPRE EN ORDEN DE `id`.
 *
 * El orden no es cosmético: `moverVoto` escribe en DOS filas (baja una, sube otra) y es la única
 * operación que puede INTERBLOQUEARSE — si A mueve su voto de S1 a S2 mientras B lo mueve de S2 a S1,
 * cada transacción tendría bloqueada la fila que la otra necesita. Con un orden TOTAL y compartido,
 * las dos piden los bloqueos en la misma secuencia y una espera a la otra en vez de trabarse. Es la
 * misma regla que el ledger aplica bloqueando siempre primero la fila del User.
 *
 * Se emite un `SELECT ... FOR UPDATE` por fila (en vez de uno con `IN`) para que el orden sea el que
 * dice este código y no el que decida el plan de ejecución.
 */
async function bloquearSubmissions(tx: Db, ids: string[]): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$executeRaw(
      Prisma.sql`SELECT \`id\` FROM \`Submission\` WHERE \`id\` = ${id} FOR UPDATE`,
    );
  }
}

/**
 * EMITIR el voto. Si el usuario ya tiene voto en ese reto:
 *  - en ESTA misma participación -> `ya-votada` (idempotente: el doble clic no recuenta).
 *  - en OTRA -> `rechazado/YA_VOTO_OTRA`. NO se mueve solo: mover el voto de alguien sin que lo pida
 *    es una decisión suya, no nuestra. La ruta ofrecerá "mover" y llamará a `moverVoto`.
 */
export async function emitirVoto(db: PrismaClient, input: EmitirVotoInput): Promise<ResultadoVoto> {
  const ahora = input.ahora ?? new Date();
  // Se guarda fuera de la transacción para poder usarlo en el `catch`: cuando salta el UNIQUE, la
  // transacción ya revirtió, pero necesitamos saber EN QUÉ RETO para buscar el voto que ya existía.
  let challengeIdDestino: string | null = null;
  try {
    return await db.$transaction(async (tx) => {
      await bloquearSubmissions(tx, [input.submissionId]);
      const destino = await destinoVotable(tx, input.userId, input.submissionId, ahora);
      if (!destino.ok) return { estado: "rechazado", motivo: destino.motivo };
      challengeIdDestino = destino.challengeId;

      await tx.vote.create({
        data: {
          userId: input.userId,
          submissionId: input.submissionId,
          challengeId: destino.challengeId,
          ipHash: input.ipHash ?? null,
        },
      });
      await tx.submission.update({
        where: { id: input.submissionId },
        data: { voteCount: { increment: 1 } },
      });
      return { estado: "votado" };
    }, LEDGER_TX_OPTIONS);
  } catch (e) {
    if (!esViolacionDeUnicidad(e)) throw e;
    // El UNIQUE saltó: ya hay voto de este usuario EN ESTE RETO. Se mira DÓNDE está para distinguir
    // "has vuelto a pulsar en la misma" (idempotente) de "tienes el voto en otra" (ofrecer mover).
    // La transacción ya revirtió, así que el contador no subió.
    //
    // La búsqueda va por la clave ÚNICA (userId + challengeId), nunca solo por userId: un usuario
    // tiene un voto en CADA reto en el que participe, y quedarse con "el último" devolvería el de
    // otro reto y respondería "ya-votada" a quien no ha votado esta.
    if (challengeIdDestino === null) throw e; // el UNIQUE no puede saltar sin haber pasado por aquí
    const existente = await db.vote.findUnique({
      where: { userId_challengeId: { userId: input.userId, challengeId: challengeIdDestino } },
      select: { submissionId: true },
    });
    return existente?.submissionId === input.submissionId
      ? { estado: "ya-votada" }
      : { estado: "rechazado", motivo: "YA_VOTO_OTRA" };
  }
}

export interface MoverVotoInput {
  userId: string;
  /** Participación DESTINO. El origen se deduce del voto que ya existe. */
  submissionId: string;
  /** IP hasheada del momento de mover: refresca la evidencia antifraude del voto vivo. */
  ipHash?: string | null;
  ahora?: Date;
}

/**
 * MOVER el voto a otra participación del MISMO reto. Es la operación que hace útil el "un voto por
 * reto": cambiar de opinión sin quedarte sin voto.
 *
 * Toca DOS filas de `Submission` (baja una, sube otra), así que las bloquea las dos en orden de `id`
 * antes de escribir — ver `bloquearSubmissions`.
 *
 * PERO hay un huevo y gallina: para saber QUÉ bloquear hace falta leer el reto del destino y el voto
 * actual, y leer una fila DENTRO de la transacción antes de bloquearla es justo lo que provoca el 1020.
 * Por eso esa lectura se hace FUERA de la transacción y sirve SOLO para elegir las filas a bloquear:
 * todo se vuelve a leer y a validar dentro, ya con los bloqueos puestos. Una lectura previa obsoleta
 * no puede colar nada: como mucho, se bloquea de más.
 */
export async function moverVoto(db: PrismaClient, input: MoverVotoInput): Promise<ResultadoVoto> {
  const ahora = input.ahora ?? new Date();

  // --- FUERA de la transacción: solo para saber qué bloquear (se revalida todo dentro). ---
  const previo = await db.submission.findUnique({
    where: { id: input.submissionId },
    select: { challengeId: true },
  });
  if (!previo) return { estado: "rechazado", motivo: "SIN_PARTICIPACION" };
  const votoPrevio = await db.vote.findUnique({
    where: { userId_challengeId: { userId: input.userId, challengeId: previo.challengeId } },
    select: { submissionId: true },
  });
  if (!votoPrevio) return { estado: "rechazado", motivo: "SIN_VOTO" };
  if (votoPrevio.submissionId === input.submissionId) return { estado: "sin-cambio" };

  return db.$transaction(async (tx) => {
    // Las dos filas cuyo contador cambia, en orden de id. PRIMERO bloquear, luego leer.
    await bloquearSubmissions(tx, [votoPrevio.submissionId, input.submissionId]);

    const destino = await destinoVotable(tx, input.userId, input.submissionId, ahora);
    if (!destino.ok) return { estado: "rechazado", motivo: destino.motivo };

    const actual = await tx.vote.findUnique({
      where: { userId_challengeId: { userId: input.userId, challengeId: destino.challengeId } },
      select: { id: true, submissionId: true },
    });
    if (!actual) return { estado: "rechazado", motivo: "SIN_VOTO" };
    if (actual.submissionId === input.submissionId) return { estado: "sin-cambio" };
    // El voto ya no está donde decía la lectura previa: otra petición DEL MISMO USUARIO lo movió
    // mientras tanto. No se toca nada: el origen real no es una de las filas que se bloquearon, y
    // descontarle un voto sin haberla bloqueado corrompería su contador.
    if (actual.submissionId !== votoPrevio.submissionId) return { estado: "sin-cambio" };

    await tx.vote.update({
      where: { id: actual.id },
      data: {
        submissionId: input.submissionId,
        // `createdAt` NO se toca: sigue siendo cuándo votó en este reto, que es lo que miran las
        // señales antifraude por antigüedad. El `ipHash` SÍ, porque describe el voto que está vivo.
        ...(input.ipHash === undefined ? {} : { ipHash: input.ipHash }),
      },
    });

    // Los dos contadores. El orden ya quedo fijado al bloquear.
    const deltas = new Map<string, number>([
      [actual.submissionId, -1],
      [input.submissionId, 1],
    ]);
    for (const id of [...deltas.keys()].sort()) {
      await tx.submission.update({
        where: { id },
        data: { voteCount: { increment: deltas.get(id)! } },
      });
    }

    return { estado: "movido", desdeSubmissionId: actual.submissionId };
  }, LEDGER_TX_OPTIONS);
}

export interface QuitarVotoInput {
  userId: string;
  /** La participación que crees tener votada. Si tu voto está en otra, NO se toca nada. */
  submissionId: string;
  ahora?: Date;
}

/**
 * QUITAR el voto. El `submissionId` no es decorativo: se exige que el voto esté EN ESA participación.
 * Si no se exigiera, bastaría con mandar cualquier id para borrar el voto que el usuario tenga puesto
 * donde sea — un id equivocado en el cliente no puede tener ese efecto.
 *
 * Solo con el reto ABIERTO: cerrado el plazo, los votos son el resultado y no se retiran.
 */
export async function quitarVoto(db: PrismaClient, input: QuitarVotoInput): Promise<ResultadoVoto> {
  const ahora = input.ahora ?? new Date();
  return db.$transaction(async (tx) => {
    // PRIMERO bloquear, luego leer: al revés, si otra transacción tocó el contador entre la lectura y
    // el bloqueo, MariaDB responde 1020 (ver la nota de la cabecera).
    await bloquearSubmissions(tx, [input.submissionId]);

    const sub = await tx.submission.findUnique({
      where: { id: input.submissionId },
      select: { challengeId: true },
    });
    if (!sub) return { estado: "rechazado", motivo: "SIN_PARTICIPACION" };
    if (!(await retoAbierto(tx, sub.challengeId, ahora))) {
      return { estado: "rechazado", motivo: "RETO_CERRADO" };
    }

    // Condicionado a userId + challengeId + submissionId: si el voto está en otra participación,
    // `count` es 0 y no se borra ni se descuenta nada.
    const borrados = await tx.vote.deleteMany({
      where: {
        userId: input.userId,
        challengeId: sub.challengeId,
        submissionId: input.submissionId,
      },
    });
    if (borrados.count === 0) return { estado: "rechazado", motivo: "SIN_VOTO" };

    await tx.submission.update({
      where: { id: input.submissionId },
      data: { voteCount: { decrement: 1 } },
    });
    return { estado: "quitado" };
  }, LEDGER_TX_OPTIONS);
}

/**
 * Borra los votos de una participación y pone su contador a 0. Lo llama el SWAP de reemplazo DENTRO de
 * su transacción: los votos son del vídeo que la comunidad vio, no de la participación como etiqueta,
 * así que no se heredan al cambiar el vídeo.
 *
 * Recibe el cliente de TRANSACCIÓN (`Db`), no el `PrismaClient`, justamente para que no pueda llamarse
 * suelto: si el reset ocurriera fuera de la transacción del swap, un fallo entre medias dejaría una
 * participación con vídeo nuevo y los votos del viejo.
 */
export async function resetearVotosDeParticipacion(tx: Db, submissionId: string): Promise<number> {
  const { count } = await tx.vote.deleteMany({ where: { submissionId } });
  await tx.submission.update({ where: { id: submissionId }, data: { voteCount: 0 } });
  return count;
}

/** Filas por tanda del barrido de retención. Igual que las purgas del worker: tandas pequeñas. */
const RETENCION_LOTE = 1000;
/** Tope de tandas por ciclo: si no drena, sigue en el siguiente (nunca un bucle sin fin). */
const RETENCION_MAX_TANDAS = 1000;

/**
 * RETENCIÓN de la IP hasheada de los votos: pone `ipHash = NULL` en los votos más viejos que la
 * ventana. **Borra la IP, NO el voto**: la fila sobrevive —cuenta para el reto— y lo único que caduca
 * es el dato personal.
 *
 * Por qué existe: el esquema documentaba "retención de 90 días" y NO había nada que la aplicara. El
 * tipo de job `RETENTION_PURGE` estaba en la unión sin handler, sin cadencia y sin llamante: una
 * protección escrita que no existía. Esto la hace real, y se cablea como los demás barridos del
 * worker (poda de Job, de RateLimit, de sesiones), no como job de cola: es mantenimiento periódico
 * del sistema, no un trabajo sobre una entidad concreta.
 *
 * POR TANDAS, como el resto: un solo `UPDATE` sobre millones de filas bloquearía la tabla. Devuelve
 * cuántas anonimizó y si drenó del todo, para que el worker lo DIGA en el log si se quedó corto en
 * vez de callarse.
 *
 * IDEMPOTENTE por construcción: la condición incluye `ipHash IS NOT NULL`, así que una fila ya
 * anonimizada deja de cumplirla. Correr el barrido dos veces seguidas da 0 la segunda. Ese `IS NOT
 * NULL` no es cosmético: sin él las mismas filas seguirían casando para siempre y el bucle de tandas
 * no terminaría nunca de "drenar".
 *
 * NOTA DE ESCALA (medir antes de actuar): la condición no tiene índice propio. Con la tabla `Vote`
 * grande y casi toda ya anonimizada, cada barrido recorrerá el tramo ya purgado antes de encontrar
 * trabajo. Hoy da igual (barrido diario, tabla pequeña). Cuando se note, la respuesta es un índice
 * `[ipHash, createdAt]` —que acota el recorrido a las filas que AÚN tienen IP— o un cursor en
 * `SystemState` como el de la reconciliación de publicados.
 */
export async function purgarIpHashDeVotos(
  db: PrismaClient,
  input: { now?: Date; retenerMs: number },
): Promise<{ total: number; drenado: boolean }> {
  const limite = new Date((input.now ?? new Date()).getTime() - input.retenerMs);
  let total = 0;
  for (let i = 0; i < RETENCION_MAX_TANDAS; i += 1) {
    const anonimizadas = await db.$executeRaw(
      Prisma.sql`UPDATE \`Vote\` SET \`ipHash\` = NULL
                 WHERE \`ipHash\` IS NOT NULL AND \`createdAt\` < ${limite}
                 LIMIT ${Prisma.raw(String(RETENCION_LOTE))}`,
    );
    total += anonimizadas;
    if (anonimizadas < RETENCION_LOTE) return { total, drenado: true };
  }
  return { total, drenado: false };
}
