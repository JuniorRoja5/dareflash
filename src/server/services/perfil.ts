/**
 * Servicio de PERFIL (server-only). Reúne DOS responsabilidades del lote de Fase 1:
 *
 *  A) CONSULTAS PÚBLICAS (Rama 3 — datos reales). Devuelve SOLO campos PÚBLICOS de un usuario, más su
 *     palmarés (retos ganados) y su rejilla de vídeos PUBLISHED. Por qué cambiar el id/username JAMÁS
 *     filtra datos privados:
 *       1. El `select` (`SELECT_USUARIO_PUBLICO`) enumera EXPLÍCITAMENTE solo columnas públicas. email,
 *          birthDate, walletBalanceCents, boostBalance y passwordHash NUNCA se piden a la BD.
 *       2. El mapeo a DTO (`aPerfilPublico`) copia campo a campo solo lo público (aunque llegara una
 *          fila "contaminada", el DTO no la propaga — probado con dientes).
 *       3. Las dos vías (por id de sesión y por username de la URL) pasan por el MISMO select y mapeo.
 *     `pointsBalance` es la PUNTUACIÓN de juego (pública: nivel + ranking); los saldos privados son el
 *     monedero y los créditos de Boost, que no se exponen jamás.
 *
 *  B) ACTUALIZACIÓN del propio perfil (Rama 5). AUTORIZACIÓN POR CONSTRUCCIÓN: recibe el `userId` de la
 *     SESIÓN (nunca del cliente) y actualiza EXACTAMENTE esa fila; la ruta pasa `user.userId` del
 *     `mutatingRoute`. La validación del nombre vive aquí como esquema Zod (el gate real de servidor).
 */
import "server-only";

import { z } from "zod";

import {
  BIO_MAX,
  type EstadoVideo,
  NOMBRE_MAX,
  NOMBRE_MIN,
  PATRON_INSTAGRAM,
  PATRON_NOMBRE,
  PATRON_YOUTUBE,
  WEBSITE_MAX,
  normalizarNombre,
  normalizarYoutube,
} from "@/app/(app)/(shell)/perfil/perfil-logic";
import { VideoFailureReasonSchema } from "@/config/constants";
import { type ModerationStatus, Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";

// ============================================================================
// A) CONSULTAS PÚBLICAS (Rama 3)
// ============================================================================

/** Un video de la rejilla del perfil. Solo lo necesario para pintarlo y firmar su reproduccion. */
export interface VideoPublico {
  id: string;
  bunnyVideoId: string;
  title: string | null;
}

/** Perfil PUBLICO. Contrato: aqui NUNCA hay email, birthDate, saldo del monedero, Boost ni hash. */
export interface PerfilPublico {
  id: string;
  username: string;
  displayName: string | null;
  image: string | null;
  /** Bio y enlaces (v1): informacion PUBLICA del perfil. `instagram`/`youtube` son HANDLES. */
  bio: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
  /** Puntuacion de juego (publica: alimenta el nivel y el ranking). */
  pointsBalance: number;
  /** Retos ganados (numero de filas ChallengeResult del usuario). */
  retosGanados: number;
  videos: VideoPublico[];
}

/**
 * Columnas PUBLICAS del usuario. Es la barrera dura: anadir aqui una columna privada (email, saldo...)
 * la expondria, y por eso el test con dientes falla si esta lista deja de ser exactamente la publica.
 * bio/website/instagram/youtube SON publicos (informacion de perfil que el usuario elige mostrar).
 */
export const SELECT_USUARIO_PUBLICO = {
  id: true,
  username: true,
  displayName: true,
  image: true,
  bio: true,
  website: true,
  instagram: true,
  youtube: true,
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
  username: string;
  displayName: string | null;
  image: string | null;
  bio: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
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
    bio: fila.bio,
    website: fila.website,
    instagram: fila.instagram,
    youtube: fila.youtube,
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

// ============================================================================
// B) ACTUALIZACIÓN DEL PROPIO PERFIL (Rama 5)
// ============================================================================

/**
 * Esquema del nombre visible. `transform` NORMALIZA (recorta + colapsa espacios) ANTES de medir y de
 * comprobar la whitelist, así se valida lo que de verdad se guardaría. El orden importa: primero
 * normaliza, luego longitud, luego caracteres. Un nombre vacío o de solo espacios cae por longitud.
 */
export const displayNameSchema = z
  .string()
  .transform(normalizarNombre)
  .pipe(
    z
      .string()
      .min(NOMBRE_MIN, "El nombre es demasiado corto.")
      .max(NOMBRE_MAX, "El nombre es demasiado largo.")
      .regex(PATRON_NOMBRE, "El nombre tiene caracteres no permitidos."),
  );

/** Sin caracteres de control (U+0000-U+001F, U+007F)? El salto de linea tambien queda fuera. */
function sinControles(v: string): boolean {
  for (const c of v) {
    const n = c.charCodeAt(0);
    if (n < 0x20 || n === 0x7f) return false;
  }
  return true;
}

/** URL http/https válida (el sitio web SÍ es una URL libre; se pinta con rel="nofollow noopener"). */
const urlHttp = z
  .url("El sitio web debe ser una URL válida.")
  .refine((u) => /^https?:\/\//i.test(u), "El sitio web debe empezar por http:// o https://");

/**
 * Campos de perfil v1. Cada uno acepta VACÍO -> `null` (borrar el campo). bio: <=300 sin controles.
 * website: URL http/https o vacío. instagram/youtube: HANDLE (no URL; el frontend construye el enlace);
 * youtube se normaliza quitando un `@` inicial. Todos OPCIONALES: si no vienen, ese campo no se toca.
 */
const bioSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .max(BIO_MAX, `La biografía no puede pasar de ${BIO_MAX} caracteres.`)
      .refine(sinControles, "La biografía tiene caracteres no permitidos."),
  )
  .transform((s) => s || null);

const websiteSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.union([z.literal(""), urlHttp]))
  // Tope = ancho de columna (VARCHAR(191)): sin el, una URL válida larga reventaría en la BD (500).
  .pipe(z.string().max(WEBSITE_MAX, `El sitio web no puede pasar de ${WEBSITE_MAX} caracteres.`))
  .transform((s) => s || null);

const instagramSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z.union([
      z.literal(""),
      z.string().regex(PATRON_INSTAGRAM, "El usuario de Instagram no es válido."),
    ]),
  )
  .transform((s) => s || null);

const youtubeSchema = z
  .string()
  .transform(normalizarYoutube)
  .pipe(
    z.union([
      z.literal(""),
      z.string().regex(PATRON_YOUTUBE, "El usuario de YouTube no es válido."),
    ]),
  )
  .transform((s) => s || null);

/** Cuerpo aceptado por la actualización de perfil: nombre + (opcionales) bio y enlaces. */
export const actualizarPerfilSchema = z.object({
  displayName: displayNameSchema,
  bio: bioSchema.optional(),
  website: websiteSchema.optional(),
  instagram: instagramSchema.optional(),
  youtube: youtubeSchema.optional(),
});
export type ActualizarPerfilInput = z.infer<typeof actualizarPerfilSchema>;

/**
 * Actualiza el perfil del usuario `userId` (el de la SESIÓN). Fija el nombre (siempre) y, para cada
 * enlace/bio PRESENTE, su valor ya normalizado (`null` si venía vacío -> borra el campo). Un campo
 * AUSENTE (`undefined`) no se toca. `userId` NUNCA sale del cuerpo de la petición. Devuelve lo guardado.
 */
export async function actualizarPerfil(
  db: Db,
  userId: string,
  datos: ActualizarPerfilInput,
): Promise<{ displayName: string }> {
  const data: Prisma.UserUpdateInput = { displayName: datos.displayName };
  if (datos.bio !== undefined) data.bio = datos.bio;
  if (datos.website !== undefined) data.website = datos.website;
  if (datos.instagram !== undefined) data.instagram = datos.instagram;
  if (datos.youtube !== undefined) data.youtube = datos.youtube;
  const actualizado = await db.user.update({
    where: { id: userId },
    data,
    select: { displayName: true },
  });
  return { displayName: actualizado.displayName ?? datos.displayName };
}

// ============================================================================
// C) MIS VÍDEOS CON ESTADO (Pieza C — SOLO el perfil PROPIO)
// ============================================================================
//
// CAMINO SEPARADO del público a propósito. El público (`cargarPerfil`) filtra `status: "PUBLISHED"`
// y su DTO (`VideoPublico`) ni siquiera tiene un campo de estado: por construcción no puede filtrar
// un vídeo no-publicado de nadie. Este camino es del DUEÑO: recibe el `userId` de la SESIÓN (la ruta
// `/perfil` lo saca de la cookie, NUNCA de la URL) y añade a la rejilla los vídeos en proceso/fallidos
// CON su estado ya HUMANIZADO. `MiVideo` expone `estado` (semántico), no el `failureReason` crudo:
// aunque este DTO se filtrara, no revelaría el código interno del fallo.

/** Estados que el DUEÑO ve en su rejilla. REJECTED/REMOVED (moderación) quedan fuera de esta pieza. */
const ESTADOS_MIS_VIDEOS = ["PENDING", "PUBLISHED", "FAILED"] as const;

const SELECT_MI_VIDEO = {
  id: true,
  bunnyVideoId: true,
  title: true,
  status: true,
  failureReason: true,
} satisfies Prisma.VideoSelect;

/**
 * Deriva el estado VISIBLE de un vídeo a partir de `status` + `failureReason`. PURA y total. El
 * `failureReason` se valida con el MISMO Zod que lo escribe (`VideoFailureReasonSchema`): TOO_LONG se
 * distingue como sobreduración; OBJETO_INEXISTENTE (degradado por la reconciliación Parte C: estuvo
 * publicado pero su objeto en Bunny desapareció) como "no-disponible" —NO "error": el vídeo no falló al
 * procesar, simplemente ya no está—; cualquier otro fallo (o motivo desconocido) cae en "error"
 * genérico. PENDING -> "procesando". Un estado no esperado (la consulta ya los excluye) se trata como
 * "error", nunca como "procesando" (mentir diciendo que sigue en curso sería peor que un fallo honesto).
 */
export function estadoDeVideo(status: ModerationStatus, failureReason: string | null): EstadoVideo {
  switch (status) {
    case "PUBLISHED":
      return "publicado";
    case "PENDING":
      return "procesando";
    case "FAILED": {
      const motivo = VideoFailureReasonSchema.safeParse(failureReason);
      if (motivo.success && motivo.data === "TOO_LONG") return "demasiado-largo";
      if (motivo.success && motivo.data === "OBJETO_INEXISTENTE") return "no-disponible";
      return "error";
    }
    default:
      return "error";
  }
}

/** Un vídeo de MI rejilla: lo público para pintarlo + su `estado` ya humanizado (sin el motivo crudo). */
export interface MiVideo {
  id: string;
  bunnyVideoId: string;
  title: string | null;
  estado: EstadoVideo;
}

/** MI perfil: identidad + stats públicas (reutiliza el select público) + vídeos CON estado. */
export interface MiPerfil {
  id: string;
  username: string;
  displayName: string | null;
  image: string | null;
  bio: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
  pointsBalance: number;
  retosGanados: number;
  videos: MiVideo[];
}

/**
 * MI perfil (el de la SESIÓN). Lo consume `/perfil` con `user.userId` de la cookie. A diferencia del
 * camino público, la rejilla incluye PENDING/FAILED con su estado. `userId` NUNCA sale del cliente.
 */
export async function miPerfil(db: Db, userId: string): Promise<MiPerfil | null> {
  const usuario = await db.user.findFirst({
    where: { id: userId, deletedAt: null, bannedAt: null },
    select: SELECT_USUARIO_PUBLICO,
  });
  if (!usuario) return null;

  const [videos, retosGanados] = await Promise.all([
    db.video.findMany({
      where: { userId: usuario.id, status: { in: [...ESTADOS_MIS_VIDEOS] } },
      select: SELECT_MI_VIDEO,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    db.challengeResult.count({ where: { userId: usuario.id } }),
  ]);

  return {
    id: usuario.id,
    username: usuario.username,
    displayName: usuario.displayName,
    image: usuario.image,
    bio: usuario.bio,
    website: usuario.website,
    instagram: usuario.instagram,
    youtube: usuario.youtube,
    pointsBalance: usuario.pointsBalance,
    retosGanados,
    videos: videos.map((v) => ({
      id: v.id,
      bunnyVideoId: v.bunnyVideoId,
      title: v.title,
      estado: estadoDeVideo(v.status, v.failureReason),
    })),
  };
}
