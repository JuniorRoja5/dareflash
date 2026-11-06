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
import { bloquearEmpresa, conReintentos } from "./publicidad-cerrojos";
import { PUBLICIDAD_SERVIBLE } from "./publicidad-visible";
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
    case "PUBLICIDAD": {
      // Fase 9 · P8. Se denuncia lo que SE SIRVE: activa, sin pausa del umbral y de una empresa
      // verificada (lo mismo que mira `campanasDeHoy`). Una campaña que ya no sale no tiene nada que
      // mirar. El «dueño» es quien tiene la cuenta de la empresa —que además no puede denunciar: las
      // cuentas de empresa no mutan nada de participación—.
      const p = await db.publicidad.findFirst({
        // LA MISMA regla que decide qué se sirve: solo se denuncia lo que se ve.
        where: { id: targetId, ...PUBLICIDAD_SERVIBLE },
        select: { empresa: { select: { ownerUserId: true } } },
      });
      return p?.empresa.ownerUserId ?? null;
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

/**
 * EL AVISO AL ADMIN cuando una CAMPAÑA cruza el umbral (Fase 9 · P8). Un correo a ADMIN_EMAIL en la
 * MISMA transacción que el ocultado (un hecho, un correo, con su clave). Sin ADMIN_EMAIL no se encola
 * nada y se deja una línea en el log: perder el aviso en silencio es peor que no tenerlo configurado.
 */
async function avisarAdminPublicidadEnTx(
  tx: Prisma.TransactionClient,
  publicidadId: string,
  ahora: Date,
  aviso: AvisoUmbralPublicidad | undefined,
): Promise<void> {
  if (!aviso?.adminEmail) {
    aviso?.log?.(
      `[denuncias] una campaña (${publicidadId}) se ha pausado por denuncias, pero no hay ADMIN_EMAIL: no se avisa.`,
    );
    return;
  }
  const p = await tx.publicidad.findUnique({
    where: { id: publicidadId },
    select: { nombre: true, empresa: { select: { nombre: true } } },
  });
  const { enqueueEmail } = await import("@/server/email/send");
  const { renderCorreoHtml } = await import("@/server/email/plantilla");
  const titulo = "Una campaña se ha pausado por denuncias";
  // Solo el nombre comercial y el de la campaña: nada de correos, ni datos fiscales, ni quién denunció.
  const cuerpo = `«${p?.nombre ?? "Una campaña"}», de ${p?.empresa.nombre ?? "una empresa"}, ha llegado a las denuncias que la pausan sola. Está en revisión: decide si la retiras o la absuelves.`;
  await enqueueEmail(
    tx,
    {
      to: aviso.adminEmail,
      subject: titulo,
      text: [cuerpo, "", `Revisarla: ${aviso.urlPanel}`].join("\n"),
      html: renderCorreoHtml({
        preheader: cuerpo,
        titulo,
        intro: cuerpo,
        cta: { texto: "Revisar la campaña", href: aviso.urlPanel },
        notas: ["La campaña ya no se muestra y sus días por venir quedaron libres."],
      }),
    },
    // UNA por ocultado: si la absuelven y, pasada la inmunidad, vuelve a cruzar, es otro hecho.
    { idempotencyKey: `publicidad-umbral:${publicidadId}:${ahora.getTime()}`, runAt: ahora },
  );
}

/** A quién y adónde avisar si una campaña cruza el umbral. Lo pone la ruta (lee `env`). */
export interface AvisoUmbralPublicidad {
  adminEmail: string | null;
  urlPanel: string;
  log?: (mensaje: string) => void;
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
    /** Solo para PUBLICIDAD: el aviso al admin si esta denuncia cruza el umbral (P8). */
    avisoPublicidad?: AvisoUmbralPublicidad;
  },
): Promise<ResultadoDenuncia> {
  const dueno = await duenoDelObjeto(db, entrada.targetType, entrada.targetId);
  if (dueno === null) return { estado: "rechazada", motivo: "NO_DISPONIBLE" };
  if (dueno === entrada.reporterId) return { estado: "rechazada", motivo: "PROPIO" };

  const objeto = { targetType: entrada.targetType, targetId: entrada.targetId };
  const ahora = entrada.ahora ?? new Date();
  // P9: si la denuncia de una CAMPAÑA cruza el umbral, se le devuelve el día ya cobrado, y eso mueve el
  // saldo de su empresa. El orden único de la publicidad (`publicidad-cerrojos.ts`) pone la Empresa
  // ANTES que la denuncia: se bloquea como primera sentencia, con su id leído fuera (no cambia).
  const empresaId =
    entrada.targetType === "PUBLICIDAD"
      ? ((
          await db.publicidad.findUnique({
            where: { id: entrada.targetId },
            select: { empresaId: true },
          })
        )?.empresaId ?? null)
      : null;

  try {
    // UNA TRANSACCIÓN para la denuncia y el ocultado. El `catch` va FUERA: una denuncia repetida
    // choca con el UNIQUE, la transacción se deshace entera —no había nada más que deshacer— y se
    // responde "ya nos habías avisado", que nunca fue un error. Reintenta ante 1020/1213 (la repetida
    // no es reintentable: sube al `catch`).
    const resultado = await conReintentos(() =>
      db.$transaction(async (tx) => {
        if (empresaId !== null) await bloquearEmpresa(tx, empresaId);
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
        if (ocultado && entrada.targetType === "PUBLICIDAD") {
          await avisarAdminPublicidadEnTx(tx, entrada.targetId, ahora, entrada.avisoPublicidad);
        }
        return { estado: "registrada" as const, ocultado };
      }),
    );
    // UNA CAMPAÑA OCULTA DEJA DE SERVIRSE AL MOMENTO: se vacía la caché de campañas servibles, y
    // DESPUÉS de confirmar (dentro de la transacción, otra petición podría volver a llenarla con lo
    // de antes y servirla 60 s más).
    if (resultado.ocultado && entrada.targetType === "PUBLICIDAD") {
      const { olvidarCacheDeHoy } = await import("./publicidad-entrega");
      olvidarCacheDeHoy();
    }
    return resultado;
  } catch (e) {
    if (esDenunciaRepetida(e)) return { estado: "repetida" };
    throw e;
  }
}
