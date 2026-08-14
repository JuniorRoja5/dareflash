/**
 * CONSULTAS de PERFIL (Rama 3 — capa de datos reales). Devuelve SOLO campos PUBLICOS de un usuario,
 * mas su palmares (retos ganados) y su rejilla de videos PUBLISHED.
 *
 * SEGURIDAD (por que cambiar el id/username JAMAS filtra datos privados):
 *   1. El `select` de Prisma (`SELECT_USUARIO_PUBLICO`) enumera EXPLICITAMENTE solo columnas publicas.
 *      email, birthDate, walletBalanceCents, boostBalance y passwordHash NUNCA se piden a la BD: no
 *      viajan en la consulta, asi que no pueden salir por mucho que cambie el identificador de entrada.
 *   2. El mapeo a DTO (`aPerfilPublico`) copia campo a campo solo lo publico: aunque a la funcion le
 *      llegara una fila con datos privados, el DTO resultante no los incluiria.
 *   3. Las dos vias de acceso (por id de sesion y por username de la URL) pasan por el MISMO `select`
 *      y el MISMO mapeo: no hay una ruta "ancha" para unos y "estrecha" para otros.
 *
 * NOTA sobre `pointsBalance`: es la PUNTUACION de juego (mueve el nivel y se muestra en el ranking),
 * publica por diseno. Los saldos PRIVADOS son el monedero (`walletBalanceCents`) y los creditos de
 * Boost (`boostBalance`): esos no se exponen jamas.
 */
import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";

/** Un video de la rejilla del perfil. Solo lo necesario para pintarlo y firmar su reproduccion. */
export interface VideoPublico {
  id: string;
  bunnyVideoId: string;
  title: string | null;
}

/** Perfil PUBLICO. Contrato: aqui NUNCA hay email, birthDate, saldo del monedero, Boost ni hash. */
export interface PerfilPublico {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  /** Puntuacion de juego (publica: alimenta el nivel y el ranking). */
  pointsBalance: number;
  /** Retos ganados (numero de filas ChallengeResult del usuario). */
  retosGanados: number;
  videos: VideoPublico[];
}

/**
 * Columnas PUBLICAS del usuario. Es la barrera dura: anadir aqui una columna privada (email, saldo...)
 * la expondria, y por eso el test con dientes falla si esta lista deja de ser exactamente la publica.
 */
export const SELECT_USUARIO_PUBLICO = {
  id: true,
  username: true,
  displayName: true,
  image: true,
  pointsBalance: true,
} satisfies Prisma.UserSelect;

const SELECT_VIDEO_PUBLICO = {
  id: true,
  bunnyVideoId: true,
  title: true,
} satisfies Prisma.VideoSelect;

/** Fila publica del usuario tal cual la devuelve el `select` de arriba (sin datos privados). */
type FilaUsuarioPublico = {
  id: string;
  username: string | null;
  displayName: string | null;
  image: string | null;
  pointsBalance: number;
};

/**
 * Mapeo PURO fila->DTO. Copia SOLO lo publico. Segunda barrera: aunque `fila` trajera campos privados,
 * el DTO no los propaga (se prueba pasandole una fila "contaminada" en el test con dientes).
 */
export function aPerfilPublico(
  fila: FilaUsuarioPublico,
  retosGanados: number,
  videos: VideoPublico[],
): PerfilPublico {
  return {
    id: fila.id,
    username: fila.username,
    displayName: fila.displayName,
    image: fila.image,
    pointsBalance: fila.pointsBalance,
    retosGanados,
    videos,
  };
}

/** Carga comun: resuelve la fila publica por `where` y agrega videos PUBLISHED + retos ganados. */
async function cargarPerfil(db: Db, where: Prisma.UserWhereInput): Promise<PerfilPublico | null> {
  // No se muestran perfiles de cuentas borradas ni baneadas.
  const usuario = await db.user.findFirst({
    where: { ...where, deletedAt: null, bannedAt: null },
    select: SELECT_USUARIO_PUBLICO,
  });
  if (!usuario) return null;

  const [videos, retosGanados] = await Promise.all([
    db.video.findMany({
      where: { userId: usuario.id, status: "PUBLISHED" },
      select: SELECT_VIDEO_PUBLICO,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    // ChallengeResult no tiene FK a User (sobrevive a la anonimizacion): se cuenta por userId.
    db.challengeResult.count({ where: { userId: usuario.id } }),
  ]);

  return aPerfilPublico(usuario, retosGanados, videos);
}

/**
 * Perfil por ID. Lo consume `/perfil` con el id de la SESION (de la cookie, de confianza), NUNCA con
 * un id que venga del cliente: la propiedad no se decide por un identificador enviado por el navegador.
 */
export function perfilPublicoPorId(db: Db, userId: string): Promise<PerfilPublico | null> {
  return cargarPerfil(db, { id: userId });
}

/**
 * Perfil por USERNAME. Lo consume la ruta publica `/u/[username]`. Devuelve solo campos publicos, asi
 * que probar distintos usernames nunca revela datos privados de nadie.
 */
export function perfilPublicoPorUsername(db: Db, username: string): Promise<PerfilPublico | null> {
  return cargarPerfil(db, { username });
}
