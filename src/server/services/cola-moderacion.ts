/**
 * LA COLA DE MODERACIÓN (Fase 5, pieza 2) — qué hay denunciado y esperando decisión.
 *
 * AGRUPA POR OBJETO, no por denuncia: lo que el moderador revisa es un vídeo o un comentario, no
 * quince filas del mismo hecho. El orden es por DENUNCIANTES DISTINTOS (desc), que es la señal de
 * gravedad que tenemos; el id desempata para que el orden sea total.
 *
 * SOLO CUENTAN LAS ABIERTAS (`OPEN`). Lo ya resuelto o descartado no vuelve a subir: un objeto que se
 * descartó reaparece solo si alguien NUEVO lo denuncia. Y gracias al UNIQUE de `Report` (una denuncia
 * por denunciante y objeto), `COUNT(*)` YA ES el número de denunciantes distintos: no hace falta
 * `COUNT(DISTINCT)`, y no puede inflarse.
 *
 * SQL CRUDO, y aquí sí está justificado: hay un AGREGADO en el orden, y el keyset se compara sobre él
 * (`HAVING (COUNT(*), targetId) < (cursor)`). Con Prisma eso solo se pagina con OFFSET, que es
 * exactamente lo que no queremos. La hidratación (quién es el autor, qué dice el comentario, cómo se
 * reproduce el vídeo) va DESPUÉS, en dos consultas por página: nunca una por fila.
 *
 * La FIRMA de reproducción se inyecta (como en el feed): así el servicio se testea sin entorno.
 */
import "server-only";

import type { ReportReason, ReportTargetDenunciable } from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import { codificarCursorCola, decodificarCursorCola } from "@/lib/cursor-cola";
import type { Db } from "@/server/db/types";

import type { Firmante } from "./feed";

/** Un objeto denunciado, listo para revisar. */
export interface FilaCola {
  targetType: ReportTargetDenunciable;
  targetId: string;
  /** Personas distintas que lo han denunciado (denuncias abiertas). */
  denunciantes: number;
  /** Los motivos alegados, sin repetir. */
  motivos: ReportReason[];
  /** Quién publicó lo denunciado. */
  autor: { username: string; displayName: string | null; image: string | null };
  /**
   * Contenido a inspeccionar: uno de los dos, según el tipo. Del vídeo va SOLO el póster firmado; la
   * reproducción la resuelve el reproductor por id cuando el moderador abre el vídeo, así que no se
   * reparten URLs firmadas de vídeos que quizá nadie llegue a ver.
   */
  video: { poster: string; titulo: string | null; retirado: boolean } | null;
  comentario: { texto: string; retirado: boolean; videoId: string } | null;
}

export interface PaginaCola {
  items: FilaCola[];
  nextCursor: string | null;
}

export const COLA_LIMITE_DEFECTO = 20;
export const COLA_LIMITE_MAX = 50;

/** Fila cruda del agregado. `denunciantes` llega como BigInt del COUNT en MariaDB. */
interface FilaAgregada {
  targetType: string;
  targetId: string;
  denunciantes: bigint | number;
  motivos: string;
}

/**
 * Restringe la cola a las participaciones de UN reto (y a los comentarios de sus vídeos): es lo que
 * pinta la ficha del reto en el panel. Sin reto, la cola entera.
 */
function filtroDeReto(challengeId: string | null) {
  if (!challengeId) return Prisma.empty;
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM \`Submission\` s
    WHERE s.videoId = COALESCE(v.id, vc.id) AND s.challengeId = ${challengeId}
  )`;
}

/**
 * El interior común de la cola: agrupa las denuncias ABIERTAS por objeto y resuelve a qué vídeo
 * pertenece cada una (el propio, o el del comentario). Un objeto que ya no existe queda fuera: no se
 * modera lo que no está.
 */
function agregado(challengeId: string | null) {
  return Prisma.sql`
    FROM \`Report\` r
    LEFT JOIN \`Video\` v ON r.targetType = 'VIDEO' AND v.id = r.targetId
    LEFT JOIN \`Comment\` c ON r.targetType = 'COMMENT' AND c.id = r.targetId
    LEFT JOIN \`Video\` vc ON vc.id = c.videoId
    WHERE r.status = 'OPEN'
      AND (v.id IS NOT NULL OR c.id IS NOT NULL)
      ${filtroDeReto(challengeId)}`;
}

/**
 * Una PÁGINA de la cola. `cursor` es opaco para quien la consume (ver `lib/cursor-cola`).
 */
export async function listarColaModeracion(
  db: Db,
  opts: {
    cursor?: string | null;
    limite?: number;
    /** Solo lo de este reto (la ficha del panel del reto). */
    challengeId?: string | null;
    firmar: Firmante;
  },
): Promise<PaginaCola> {
  const limite = Math.min(
    Math.max(1, Math.floor(opts.limite ?? COLA_LIMITE_DEFECTO)),
    COLA_LIMITE_MAX,
  );
  const desde = decodificarCursorCola(opts.cursor);
  // KEYSET sobre la tupla (denunciantes, targetId): "estrictamente después" en el orden de la lista.
  const keyset = desde
    ? Prisma.sql`HAVING denunciantes < ${desde.denunciantes}
        OR (denunciantes = ${desde.denunciantes} AND r.targetId < ${desde.targetId})`
    : Prisma.empty;

  const filas = await db.$queryRaw<FilaAgregada[]>(Prisma.sql`
    SELECT r.targetType AS targetType,
           r.targetId AS targetId,
           COUNT(*) AS denunciantes,
           GROUP_CONCAT(DISTINCT r.reason ORDER BY r.reason SEPARATOR ',') AS motivos
    ${agregado(opts.challengeId ?? null)}
    GROUP BY r.targetType, r.targetId
    ${keyset}
    ORDER BY denunciantes DESC, r.targetId DESC
    LIMIT ${limite + 1}`);

  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;
  const items = await hidratar(db, pagina, opts.firmar);

  const ultima = pagina[pagina.length - 1];
  return {
    items,
    nextCursor:
      hayMas && ultima
        ? codificarCursorCola({
            denunciantes: Number(ultima.denunciantes),
            targetId: ultima.targetId,
          })
        : null,
  };
}

/**
 * Cuántas denuncias ABIERTAS hay (filas, no objetos): es la cifra de la ficha del reto. Se cuenta
 * sobre el MISMO interior que la lista, así que la tarjeta y la cola no pueden contradecirse.
 */
export async function contarDenunciasAbiertas(
  db: Db,
  opts: { challengeId?: string | null } = {},
): Promise<number> {
  const filas = await db.$queryRaw<{ total: bigint | number }[]>(Prisma.sql`
    SELECT COUNT(*) AS total ${agregado(opts.challengeId ?? null)}`);
  return Number(filas[0]?.total ?? 0);
}

/** Pone cara a cada fila: autor y contenido, en DOS consultas por página (nunca una por fila). */
async function hidratar(db: Db, filas: FilaAgregada[], firmar: Firmante): Promise<FilaCola[]> {
  const idsVideo = filas.filter((f) => f.targetType === "VIDEO").map((f) => f.targetId);
  const idsComentario = filas.filter((f) => f.targetType === "COMMENT").map((f) => f.targetId);

  const [videos, comentarios] = await Promise.all([
    idsVideo.length === 0
      ? Promise.resolve([])
      : db.video.findMany({
          where: { id: { in: idsVideo } },
          select: {
            id: true,
            bunnyVideoId: true,
            thumbnailFileName: true,
            title: true,
            status: true,
            user: { select: { username: true, displayName: true, image: true } },
          },
        }),
    idsComentario.length === 0
      ? Promise.resolve([])
      : db.comment.findMany({
          where: { id: { in: idsComentario } },
          select: {
            id: true,
            texto: true,
            retiradoEn: true,
            videoId: true,
            user: { select: { username: true, displayName: true, image: true } },
          },
        }),
  ]);

  const porVideo = new Map(videos.map((v) => [v.id, v]));
  const porComentario = new Map(comentarios.map((c) => [c.id, c]));

  const items: FilaCola[] = [];
  for (const f of filas) {
    const motivos = f.motivos.split(",").filter(Boolean) as ReportReason[];
    const denunciantes = Number(f.denunciantes);

    if (f.targetType === "VIDEO") {
      const v = porVideo.get(f.targetId);
      if (!v) continue; // desapareció entre el agregado y la hidratación: no se inventa una fila
      const { poster } = firmar(v.bunnyVideoId, v.thumbnailFileName);
      items.push({
        targetType: "VIDEO",
        targetId: f.targetId,
        denunciantes,
        motivos,
        autor: v.user,
        video: { poster, titulo: v.title, retirado: v.status === "REMOVED" },
        comentario: null,
      });
      continue;
    }

    const c = porComentario.get(f.targetId);
    if (!c) continue;
    items.push({
      targetType: "COMMENT",
      targetId: f.targetId,
      denunciantes,
      motivos,
      autor: c.user,
      video: null,
      comentario: { texto: c.texto, retirado: c.retiradoEn !== null, videoId: c.videoId },
    });
  }
  return items;
}
