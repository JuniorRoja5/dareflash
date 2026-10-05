/**
 * DENUNCIAS (Fase 5, pieza 1: la ingesta) — el PUNTO ÚNICO donde nace una fila `Report`.
 *
 * QUÉ GARANTIZA, y por qué así:
 *
 *  - EL OBJETO EXISTE Y SE PUEDE DENUNCIAR. El `targetType` no se cree: se resuelve contra la tabla
 *    que toca y se comprueba con la MISMA regla de visibilidad que usa el feed (`VIDEO_VISIBLE`). Un
 *    id inventado, un vídeo retirado o un comentario borrado dan `NO_DISPONIBLE` — el mismo resultado
 *    para "no existe" y "ya no se ve", que si no sería un oráculo para enumerar lo oculto.
 *  - NADIE SE DENUNCIA A SÍ MISMO. Para lo propio están borrar (comentario) y retirar (vídeo).
 *  - UNA DENUNCIA POR DENUNCIANTE Y OBJETO. Lo impone el UNIQUE de la BD, no un `if`: dos peticiones
 *    a la vez del mismo usuario no pueden dejar dos filas. La segunda es un NO-OP silencioso, que la
 *    ruta convierte en "ya nos habías avisado" — nunca en un error.
 *  - Y ESE NO-OP CUBRE SOLO ESA COLISIÓN: se captura la violación de ESA constraint única. Un
 *    `INSERT IGNORE` se habría tragado también una FK inválida o un truncado, escondiendo un fallo
 *    real detrás de un "gracias".
 *
 * Y DESDE LA PIEZA 3, AQUÍ SE CRUZA EL UMBRAL. La denuncia que hace la tercera esconde el contenido
 * EN EL MISMO ACTO y en la MISMA TRANSACCIÓN: se evalúa al insertar, no en un barrido, porque esto
 * es una red de seguridad y lo que vale es la inmediatez. Atómico de verdad — si el ocultado
 * fallara, la denuncia tampoco se escribe, y no queda un contenido con tres avisos a la vista.
 *
 * Lo que sigue sin pasar aquí: DES-ocultar. Eso es del moderador y de nadie más.
 */
import type { ReportReason, ReportTargetDenunciable } from "@/config/constants";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { objetivoDeViolacionUnica } from "@/server/db/errores";

import { COMENTARIO_VISIBLE } from "./comentario-visible";
import { ocultarSiCruzaEnTx } from "./ocultado-automatico";
import { VIDEO_VISIBLE } from "./video-visible";

export type ResultadoDenuncia =
  /** `ocultado` = ESTA denuncia fue la que cruzó el umbral. La 4ª y las siguientes dicen `false`. */
  | { estado: "registrada"; ocultado: boolean }
  /** Ya la había denunciado: no se escribe nada y no es un error. */
  | { estado: "repetida" }
  | { estado: "rechazada"; motivo: "NO_DISPONIBLE" | "PROPIO" };

/**
 * ¿De quién es el objeto denunciado? `null` si no existe o ya no se ve. Aquí es donde el `targetType`
 * del cliente se convierte en una fila real: cada tipo denunciable trae su propia comprobación, y un
 * tipo sin comprobación no puede existir (el `switch` es exhaustivo sobre la unión).
 */
async function duenoDelObjeto(
  db: PrismaClient,
  targetType: ReportTargetDenunciable,
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case "VIDEO": {
      const v = await db.video.findFirst({
        where: { id: targetId, ...VIDEO_VISIBLE },
        select: { userId: true },
      });
      return v?.userId ?? null;
    }
    case "COMMENT": {
      const c = await db.comment.findFirst({
        // Un comentario retirado, YA AUTO-OCULTO, o de un vídeo que ya no se ve, no se denuncia: no
        // hay nada que mirar. Lo oculto deja de ser denunciable por este mismo camino.
        where: { id: targetId, ...COMENTARIO_VISIBLE, video: VIDEO_VISIBLE },
        select: { userId: true },
      });
      return c?.userId ?? null;
    }
  }
}

/** ¿Es el choque con el UNIQUE de `Report`, y solo ese? Ver la cabecera. */
function esDenunciaRepetida(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  const objetivo = objetivoDeViolacionUnica(e);
  // El índice se llama `Report_reporterId_targetType_targetId_key`; con la forma clásica de Prisma
  // llegarían los campos. Las dos nombran `reporterId`, y ninguna otra constraint del esquema lo hace.
  return /reporterId/i.test(objetivo);
}

export async function denunciar(
  db: PrismaClient,
  entrada: {
    reporterId: string;
    targetType: ReportTargetDenunciable;
    targetId: string;
    reason: ReportReason;
    /** Inyectable solo para test: el instante del ocultado si esta denuncia cruza el umbral. */
    ahora?: Date;
  },
): Promise<ResultadoDenuncia> {
  const dueno = await duenoDelObjeto(db, entrada.targetType, entrada.targetId);
  if (dueno === null) return { estado: "rechazada", motivo: "NO_DISPONIBLE" };
  if (dueno === entrada.reporterId) return { estado: "rechazada", motivo: "PROPIO" };

  const objeto = { targetType: entrada.targetType, targetId: entrada.targetId };
  const ahora = entrada.ahora ?? new Date();

  try {
    // UNA TRANSACCIÓN para la denuncia y el ocultado. El `catch` va FUERA: una denuncia repetida
    // choca con el UNIQUE, la transacción se deshace entera —no había nada más que deshacer— y se
    // responde "ya nos habías avisado", que nunca fue un error.
    return await db.$transaction(async (tx) => {
      await tx.report.create({
        data: {
          reporterId: entrada.reporterId,
          targetType: entrada.targetType,
          targetId: entrada.targetId,
          reason: entrada.reason,
          // `status` lo pone la BD ("OPEN"): el estado inicial no lo elige quien denuncia.
        },
        select: { id: true },
      });
      // Se cuenta DESPUÉS de insertar y dentro de la misma transacción, así que la propia denuncia
      // que se acaba de escribir entra en el recuento: la tercera se ve a sí misma cruzar.
      const ocultado = await ocultarSiCruzaEnTx(tx, objeto, ahora);
      return { estado: "registrada" as const, ocultado };
    });
  } catch (e) {
    if (esDenunciaRepetida(e)) return { estado: "repetida" };
    throw e;
  }
}
