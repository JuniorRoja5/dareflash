/**
 * Nucleo de SESIONES en base de datos (revocables). Es la llave de la cuenta, asi
 * que se revisa con el rigor del ledger.
 *
 * Garantias:
 *  - Token de 256 bits de aleatoriedad CRIPTOGRAFICA (`randomBytes`), nunca predecible.
 *  - En la cookie viaja el token en CLARO; en la BD solo su HASH (SHA-256). Si se
 *    filtra la tabla `Session`, los tokens no sirven.
 *  - ROTACION: cada `createSession` emite un token NUEVO; jamas se reutiliza uno
 *    preexistente (previene fijacion de sesion).
 *  - `validateSession` comprueba la caducidad en CADA llamada. Token inexistente,
 *    caducado, manipulado, o de usuario baneado/borrado -> el MISMO resultado: null.
 *  - Revocacion de verdad: borrar la fila. `revokeAllUserSessions` mata TODAS las de
 *    un usuario (baneo, cambio de contrasena).
 *
 * Recibe el PrismaClient por parametro (testeable), como el resto de servicios; el
 * envoltorio de cookie (server-only) vive en `current-user.ts`.
 */
import { createHash, randomBytes } from "node:crypto";

import { SESSION_MAX_PER_USER, SESSION_TOKEN_BYTES, SESSION_TTL_MS } from "@/config/constants";
import type { Db } from "@/server/db/types";

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface CreatedSession {
  rawToken: string; // EN CLARO, solo para la cookie. En BD va el hash.
  expires: Date;
  /** Id de la fila Session recien creada (para atar un token CSRF a esta sesion). */
  sessionId: string;
}

export interface CreateSessionOptions {
  now?: Date;
  /** Caducidad a medida (p.ej. TTL por rol). Por defecto SESSION_TTL_MS (USER). */
  ttlMs?: number;
}

/**
 * Crea una sesion NUEVA (token nuevo siempre = rotacion). Solo debe llamarse tras
 * verificar la contrasena. Devuelve el token en claro para la cookie.
 *
 * Acepta `Db` (PrismaClient o TransactionClient) para participar en una transaccion
 * externa. Aplica el TOPE por usuario: tras insertar, borra las sesiones que excedan
 * SESSION_MAX_PER_USER, empezando por la MAS ANTIGUA (createdAt).
 */
export async function createSession(
  db: Db,
  userId: string,
  options: CreateSessionOptions = {},
): Promise<CreatedSession> {
  const nowD = options.now ?? new Date();
  const rawToken = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const expires = new Date(nowD.getTime() + (options.ttlMs ?? SESSION_TTL_MS));

  const created = await db.session.create({
    data: { sessionToken: hashToken(rawToken), userId, expires, createdAt: nowD },
    select: { id: true },
  });

  // Tope por usuario: conservar las SESSION_MAX_PER_USER mas recientes, borrar el resto.
  const sobrantes = await db.session.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: SESSION_MAX_PER_USER,
    select: { id: true },
  });
  if (sobrantes.length > 0) {
    await db.session.deleteMany({ where: { id: { in: sobrantes.map((s) => s.id) } } });
  }

  return { rawToken, expires, sessionId: created.id };
}

export interface SessionUser {
  userId: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  emailVerified: Date | null;
  /** Id de la fila Session (para atar el token CSRF a esta sesion concreta). */
  sessionId: string;
}

/**
 * Valida un token de sesion. Devuelve el usuario o `null`. Trata IGUAL (null):
 * token vacio, inexistente, manipulado (su hash no existe), CADUCADO, o de un
 * usuario baneado/borrado. La caducidad se comprueba en cada peticion.
 */
export async function validateSession(
  db: Db,
  rawToken: string | undefined | null,
  now?: Date,
): Promise<SessionUser | null> {
  if (!rawToken) return null;
  const nowD = now ?? new Date();

  const row = await db.session.findUnique({
    where: { sessionToken: hashToken(rawToken) },
    select: {
      id: true,
      expires: true,
      user: {
        select: { id: true, role: true, emailVerified: true, deletedAt: true, bannedAt: true },
      },
    },
  });

  if (!row) return null;
  if (row.expires.getTime() <= nowD.getTime()) return null; // caducado == inexistente
  if (row.user.deletedAt !== null || row.user.bannedAt !== null) return null;

  return {
    userId: row.user.id,
    role: row.user.role,
    emailVerified: row.user.emailVerified,
    sessionId: row.id,
  };
}

/** Revoca UNA sesion (logout). Borra la fila; el token deja de valer al instante. */
export async function revokeSession(db: Db, rawToken: string): Promise<void> {
  await db.session.deleteMany({ where: { sessionToken: hashToken(rawToken) } });
}

/**
 * Revoca TODAS las sesiones de un usuario. Se dispara en baneo y en cambio de
 * contrasena (el que la gente olvida y el que importa cuando roban una cuenta).
 * Acepta `Db` para correr DENTRO de la transaccion que banea / cambia la contrasena.
 */
export async function revokeAllUserSessions(db: Db, userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/**
 * Purga de sesiones CADUCADAS (expires <= now). La tabla no crece sin fin con filas
 * muertas. Es el handler del job de limpieza (cola en tabla `Job` + cron; se registra
 * en el Paso 8). Devuelve cuantas borro.
 */
export async function purgeExpiredSessions(db: Db, now?: Date): Promise<number> {
  const nowD = now ?? new Date();
  const { count } = await db.session.deleteMany({ where: { expires: { lte: nowD } } });
  return count;
}
