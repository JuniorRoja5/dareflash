/**
 * OCULTADO AUTOMÁTICO POR UMBRAL DE DENUNCIAS (Fase 5, pieza 3).
 *
 * Cuando tres personas distintas y verificadas denuncian lo mismo, el contenido desaparece de la
 * vista EN ESE MISMO MOMENTO, sin esperar a que un moderador lo mire. Es una RED DE SEGURIDAD, no
 * un veredicto: queda pendiente, y la decisión de verdad la sigue tomando una persona.
 *
 * ┌─ UNA SOLA DIRECCIÓN ────────────────────────────────────────────────────────────────────────┐
 * │ Aquí solo se OCULTA. Levantar el velo es exclusivamente del moderador (`descartarDenuncias`),│
 * │ y por eso el auto-oculto tiene columna propia (`ocultoAutoEn`) en vez de reutilizar el       │
 * │ REMOVED de la retirada manual: si compartieran estado, levantar el auto-oculto podría        │
 * │ resucitar algo que un humano retiró a mano, en silencio y sin que nada fallara.              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NO TOCA RESULTADOS. Esto es una bandera de CONTENIDO: no escribe `Submission` ni
 * `ChallengeResult`. Un vídeo oculto sigue siendo la participación de su dueño —lo que cambia es
 * que no se ve—, así que la fuente única de la que depende la re-participación (el
 * `retiradaMotivo` de la Submission) se queda intacta. De paso respeta el veto del deadlock: no hay
 * forma de que esto escriba un `Challenge` dentro de una transacción que bloquee un `User`.
 *
 * EL CONTADOR DE COMENTARIOS BAJA CON EL OCULTADO. `Video.commentCount` es un cache de los
 * comentarios VISIBLES, y un comentario oculto deja de serlo: si no se descontara, el vídeo diría
 * "5 comentarios" y listaría 4.
 */
import "server-only";

import type { ReportTargetDenunciable } from "@/config/constants";
import { avisoContenidoAutoOculto } from "@/lib/notificaciones";
import { cruzaUmbralOculto } from "@/lib/umbral-ocultado";
import type { Db } from "@/server/db/types";

import { emitirAviso } from "./notificaciones";

/** Acción del rastro de auditoría. Sin actor: no lo decidió nadie, lo decidió el umbral. */
export const ACCION_AUTO_OCULTO = "AUTO_OCULTO_UMBRAL";
/** Tipo del job que avisa al equipo. Fuera de la transacción del ocultado por diseño. */
export const TIPO_JOB_AVISO_AUTO_OCULTO = "AVISO_AUTO_OCULTO";

export interface ObjetoDenunciado {
  targetType: ReportTargetDenunciable;
  targetId: string;
}

/** Clave del job: una por objeto. Si ya hay un aviso encolado, no se encola otro. */
export function claveAvisoAutoOculto(objeto: ObjetoDenunciado): string {
  return `${TIPO_JOB_AVISO_AUTO_OCULTO}:${objeto.targetType}:${objeto.targetId}`;
}

/** Denuncias ABIERTAS del objeto = personas distintas (lo garantiza el `@@unique` de `Report`). */
export function contarDenunciasAbiertas(tx: Db, objeto: ObjetoDenunciado): Promise<number> {
  return tx.report.count({
    where: { targetType: objeto.targetType, targetId: objeto.targetId, status: "OPEN" },
  });
}

/**
 * Oculta el objeto SI toca, dentro de la transacción que recibe. Devuelve si lo ocultó ESTA llamada.
 *
 * LA CARRERA LA DECIDE LA BASE, no un `if`: el `UPDATE ... WHERE ocultoAutoEn IS NULL` solo acierta
 * una vez, así que dos terceras denuncias simultáneas ocultan una sola vez y solo una escribe el
 * rastro y encola el aviso. Comprobar-y-luego-escribir habría dejado dos de todo.
 */
export async function ocultarSiCruzaEnTx(
  tx: Db,
  objeto: ObjetoDenunciado,
  ahora: Date,
): Promise<boolean> {
  const abiertas = await contarDenunciasAbiertas(tx, objeto);
  const { yaOculto, descartadoEn } = await estadoDelObjeto(tx, objeto);
  // La inmunidad entra aquí dentro, en la decisión pura: si un moderador absolvió esto hace poco,
  // las denuncias se quedan registradas y el objeto vuelve a la cola, pero NO se esconde solo.
  if (!cruzaUmbralOculto({ abiertas, yaOculto, descartadoEn, ahora })) return false;

  const ocultado =
    objeto.targetType === "VIDEO"
      ? await ocultarVideo(tx, objeto.targetId, ahora)
      : await ocultarComentario(tx, objeto.targetId, ahora);
  if (!ocultado) return false; // otra petición llegó antes: su llamada hace el resto.

  await tx.auditLog.create({
    data: {
      // SIN ACTOR a propósito: `actorId` es nullable y esto no lo decidió una persona. Poner aquí
      // al denunciante que cruzó el umbral sería atribuirle una decisión que no tomó.
      actorId: null,
      action: ACCION_AUTO_OCULTO,
      targetType: objeto.targetType,
      targetId: objeto.targetId,
      // Cuántas lo cruzaron. Ni quiénes: el rastro dice qué pasó, no abre la lista de denunciantes.
      metadata: { denunciasAbiertas: abiertas },
    },
  });

  // EL AVISO VA POR LA COLA, no aquí: notificar a todo el equipo son N escrituras y un fallo suyo
  // no puede tumbar el ocultado, que es lo que de verdad protege. `createMany` con `skipDuplicates`
  // en vez de `create` porque un choque de clave dentro de una transacción la abortaría entera.
  await tx.job.createMany({
    data: [
      {
        type: TIPO_JOB_AVISO_AUTO_OCULTO,
        payload: { targetType: objeto.targetType, targetId: objeto.targetId },
        runAt: ahora,
        idempotencyKey: claveAvisoAutoOculto(objeto),
      },
    ],
    skipDuplicates: true,
  });

  return true;
}

/**
 * AVISA AL EQUIPO de que el umbral ha escondido algo. Lo ejecuta el job, nunca la petición.
 *
 * A TODOS LOS QUE PUEDEN ACTUAR (ADMIN y MODERATOR), porque no hay un buzón del equipo: los avisos
 * de este producto van a UNA persona. Son pocas cuentas y el `@@unique` de `Notification` hace que
 * cada una reciba uno y solo uno por objeto, así que reintentar el job es seguro — de ahí el
 * REQUEUE de su política.
 *
 * Las cuentas borradas o suspendidas se saltan: avisar a quien ya no entra es escribir por escribir.
 */
export async function repartirAvisoAutoOculto(
  db: Db,
  objeto: ObjetoDenunciado,
): Promise<{ avisados: number }> {
  const equipo = await db.user.findMany({
    where: { role: { in: ["ADMIN", "MODERATOR"] }, deletedAt: null, bannedAt: null },
    select: { id: true },
  });
  let avisados = 0;
  for (const m of equipo) {
    const nuevo = await emitirAviso(
      db,
      m.id,
      avisoContenidoAutoOculto({ targetType: objeto.targetType, targetId: objeto.targetId }),
    );
    if (nuevo) avisados += 1;
  }
  return { avisados };
}

/** Lo que el umbral necesita saber del objeto: si ya está escondido y cuándo lo absolvieron. */
async function estadoDelObjeto(
  tx: Db,
  objeto: ObjetoDenunciado,
): Promise<{ yaOculto: boolean; descartadoEn: Date | null }> {
  const fila =
    objeto.targetType === "VIDEO"
      ? await tx.video.findUnique({
          where: { id: objeto.targetId },
          select: { ocultoAutoEn: true, descartadoEn: true },
        })
      : await tx.comment.findUnique({
          where: { id: objeto.targetId },
          select: { ocultoAutoEn: true, descartadoEn: true },
        });
  return { yaOculto: fila?.ocultoAutoEn != null, descartadoEn: fila?.descartadoEn ?? null };
}

/**
 * SELLA el juicio del moderador: este objeto queda absuelto AHORA. Lo llama solo el descarte.
 *
 * Se escribe aunque el objeto ya estuviera absuelto antes: el plazo cuenta desde el ÚLTIMO
 * descarte, no desde el primero. Si se conservara el primero, un objeto denunciado en oleadas
 * perdería la inmunidad en mitad de la siguiente.
 */
export async function sellarDescarteEnTx(
  tx: Db,
  objeto: ObjetoDenunciado,
  ahora: Date,
): Promise<void> {
  if (objeto.targetType === "VIDEO") {
    await tx.video.updateMany({ where: { id: objeto.targetId }, data: { descartadoEn: ahora } });
    return;
  }
  await tx.comment.updateMany({ where: { id: objeto.targetId }, data: { descartadoEn: ahora } });
}

async function ocultarVideo(tx: Db, id: string, ahora: Date): Promise<boolean> {
  const r = await tx.video.updateMany({
    where: { id, ocultoAutoEn: null },
    data: { ocultoAutoEn: ahora },
  });
  return r.count > 0;
}

async function ocultarComentario(tx: Db, id: string, ahora: Date): Promise<boolean> {
  const c = await tx.comment.findUnique({ where: { id }, select: { videoId: true } });
  if (!c) return false;
  // La fila del VÍDEO se bloquea ANTES de tocar su contador, igual que al publicar o retirar un
  // comentario: mismo orden de bloqueo en todos los caminos, que es como no se fabrican deadlocks.
  await tx.$executeRaw`SELECT \`id\` FROM \`Video\` WHERE \`id\` = ${c.videoId} FOR UPDATE`;
  const r = await tx.comment.updateMany({
    // `retiradoEn: null` además del auto-oculto: lo que ya retiró una persona no se vuelve a
    // esconder, y sobre todo no se le descuenta otra vez al contador.
    where: { id, ocultoAutoEn: null, retiradoEn: null },
    data: { ocultoAutoEn: ahora },
  });
  if (r.count === 0) return false;
  await tx.video.update({
    where: { id: c.videoId },
    data: { commentCount: { decrement: 1 } },
  });
  return true;
}

/**
 * LEVANTA el auto-oculto. Lo llama SOLO el moderador, por dos caminos:
 *
 *  - DESCARTAR: el contenido vuelve y ahí acaba todo.
 *  - CONFIRMAR: se levanta y acto seguido se retira de verdad. Parece un rodeo y no lo es — hace
 *    que el contador de comentarios baje UNA sola vez. Si se retirara sin levantar, el ocultado
 *    habría descontado uno y la retirada descontaría otro, y el vídeo acabaría diciendo que tiene
 *    menos comentarios de los que tiene. Así el núcleo de retirar se queda sin tocar.
 *
 * Devuelve si había algo que levantar.
 */
export async function levantarAutoOcultoEnTx(tx: Db, objeto: ObjetoDenunciado): Promise<boolean> {
  if (objeto.targetType === "VIDEO") {
    const r = await tx.video.updateMany({
      where: { id: objeto.targetId, ocultoAutoEn: { not: null } },
      data: { ocultoAutoEn: null },
    });
    return r.count > 0;
  }

  const c = await tx.comment.findUnique({
    where: { id: objeto.targetId },
    select: { videoId: true, retiradoEn: true },
  });
  if (!c) return false;
  await tx.$executeRaw`SELECT \`id\` FROM \`Video\` WHERE \`id\` = ${c.videoId} FOR UPDATE`;
  const r = await tx.comment.updateMany({
    where: { id: objeto.targetId, ocultoAutoEn: { not: null } },
    data: { ocultoAutoEn: null },
  });
  if (r.count === 0) return false;
  // El contador solo vuelve a subir si el comentario pasa a estar VISIBLE. Si además estaba
  // retirado a mano, sigue sin verse y sumarlo sería contar algo que nadie lee.
  if (c.retiradoEn === null) {
    await tx.video.update({
      where: { id: c.videoId },
      data: { commentCount: { increment: 1 } },
    });
  }
  return true;
}
