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

import {
  plazosSesion,
  SESION_REFRESCO_MIN_MS,
  SESSION_MAX_PER_USER,
  SESSION_TOKEN_BYTES,
} from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
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
  // El TTL POR ROL se decide AQUI, no en quien llama: un sitio de llamada que se olvidara le daria a
  // un ADMIN los 30 dias de un espectador, y la sesion de un admin abre el panel entero. Con la
  // consulta aqui es imposible equivocarse; `options.ttlMs` sigue mandando si hace falta a medida.
  let ttlMs = options.ttlMs;
  if (ttlMs === undefined) {
    const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
    ttlMs = plazosSesion(u?.role ?? "USER").ttlMs;
  }
  const expires = new Date(nowD.getTime() + ttlMs);

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
 *
 * DOS caducidades, no una: el tope ABSOLUTO (`expires`) y la INACTIVIDAD (`lastSeenAt`). La segunda
 * es la que cierra una sesion olvidada en un ordenador ajeno, que antes seguia valiendo un mes entero
 * aunque nadie la usara. Los plazos dependen del ROL (`plazosSesion`): la sesion de un admin abre el
 * panel entero y dura mucho menos.
 *
 * Al validar con exito se refresca `lastSeenAt`, pero solo si ha pasado `SESION_REFRESCO_MIN_MS`
 * desde el ultimo refresco: si no, cada peticion escribiria en la fila de sesion.
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
      lastSeenAt: true,
      user: {
        select: { id: true, role: true, emailVerified: true, deletedAt: true, bannedAt: true },
      },
    },
  });

  if (!row) return null;
  if (row.expires.getTime() <= nowD.getTime()) return null; // caducado == inexistente
  if (row.user.deletedAt !== null || row.user.bannedAt !== null) return null;

  // INACTIVIDAD: se trata igual que el resto (null), y ademas se BORRA la fila. Una sesion muerta por
  // abandono no tiene por que seguir ocupando sitio hasta que la purga llegue a su `expires`.
  const { idleMs } = plazosSesion(row.user.role);
  if (nowD.getTime() - row.lastSeenAt.getTime() > idleMs) {
    await db.session.deleteMany({ where: { id: row.id } });
    return null;
  }

  // Refresco AMORTIGUADO de la ultima actividad (ver SESION_REFRESCO_MIN_MS). No renueva `expires`:
  // el tope absoluto no se mueve por usar la sesion, que es justo lo que lo hace un tope.
  if (nowD.getTime() - row.lastSeenAt.getTime() > SESION_REFRESCO_MIN_MS) {
    await db.session.updateMany({ where: { id: row.id }, data: { lastSeenAt: nowD } });
  }

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

/** Tope de tandas por ciclo (backstop anti-bucle). Si se alcanza, NO se drenó del todo: el
 *  llamador lo registra (`drenado: false`) y continua en el proximo ciclo. Sin tope silencioso. */
const PURGA_SESIONES_MAX_TANDAS = 1000;

/**
 * Purga de sesiones CADUCADAS (expires <= now), POR LOTES con tope: un DELETE de millones de
 * filas bloquea la tabla. Se apoya en `@@index([expires])`. La CABLEA el bucle del worker
 * (`src/server/jobs/worker.ts`), junto a la poda de Job y RateLimit. Devuelve el total borrado y
 * si se drenó del todo (para que el bucle avise si un ciclo se quedó corto).
 */
export async function purgeExpiredSessions(
  db: Db,
  now?: Date,
  lote = 1000,
): Promise<{ total: number; drenado: boolean }> {
  const nowD = now ?? new Date();
  const n = Math.floor(lote);
  let total = 0;
  for (let i = 0; i < PURGA_SESIONES_MAX_TANDAS; i += 1) {
    const borradas = await db.$executeRaw(
      Prisma.sql`DELETE FROM \`Session\` WHERE \`expires\` <= ${nowD} LIMIT ${Prisma.raw(String(n))}`,
    );
    total += borradas;
    if (borradas < n) return { total, drenado: true };
  }
  return { total, drenado: false };
}
