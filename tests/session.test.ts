import { createHash } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SESSION_MAX_PER_USER, SESSION_TTL_BY_ROLE, SESSION_TTL_MS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { banUser, changePassword, changeRole } from "../src/server/auth/account";
import {
  createSession,
  purgeExpiredSessions,
  revokeAllUserSessions,
  revokeSession,
  validateSession,
} from "../src/server/auth/session";

import { createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

async function crearUsuario(email: string, over: Record<string, unknown> = {}): Promise<string> {
  const u = await prisma.user.create({
    data: { email, emailVerified: new Date(), passwordHash: "TEST-FIXTURE-hash-viejo", ...over },
    select: { id: true },
  });
  return u.id;
}

describe("sesiones en base de datos", () => {
  it("el token es aleatorio (256 bits) y en la BD solo vive su hash", async () => {
    const userId = await crearUsuario("a@test.com");
    const { rawToken } = await createSession(prisma, userId);

    // base64url de 32 bytes -> 43 chars; alta entropia.
    expect(rawToken.length).toBeGreaterThanOrEqual(43);
    const row = await prisma.session.findFirstOrThrow({ where: { userId } });
    expect(row.sessionToken).not.toBe(rawToken);
    expect(row.sessionToken).toBe(createHash("sha256").update(rawToken).digest("hex"));
  });

  it("ROTACION: cada createSession emite un token distinto", async () => {
    const userId = await crearUsuario("a@test.com");
    const s1 = await createSession(prisma, userId);
    const s2 = await createSession(prisma, userId);
    expect(s1.rawToken).not.toBe(s2.rawToken);
    expect(await validateSession(prisma, s1.rawToken)).not.toBeNull();
    expect(await validateSession(prisma, s2.rawToken)).not.toBeNull();
  });

  it("sesion valida -> devuelve el usuario (id, rol, emailVerified)", async () => {
    const userId = await crearUsuario("a@test.com", { role: "MODERATOR" });
    const { rawToken } = await createSession(prisma, userId);
    const user = await validateSession(prisma, rawToken);
    expect(user).toEqual({
      userId,
      role: "MODERATOR",
      emailVerified: expect.any(Date),
      sessionId: expect.any(String),
    });
  });

  it("sesion REVOCADA (logout) -> denegado en la siguiente peticion", async () => {
    const userId = await crearUsuario("a@test.com");
    const { rawToken } = await createSession(prisma, userId);
    await revokeSession(prisma, rawToken);
    expect(await validateSession(prisma, rawToken)).toBeNull();
  });

  it("token CADUCADO -> denegado, igual que uno inexistente", async () => {
    const userId = await crearUsuario("a@test.com");
    // Creada en el pasado, ya caducada.
    const pasado = new Date(Date.now() - SESSION_TTL_MS - 1000);
    const { rawToken } = await createSession(prisma, userId, { now: pasado });
    expect(await validateSession(prisma, rawToken)).toBeNull(); // <- falla si se quita el check de caducidad
  });

  it("token MANIPULADO o inexistente -> denegado", async () => {
    const userId = await crearUsuario("a@test.com");
    const { rawToken } = await createSession(prisma, userId);
    expect(await validateSession(prisma, `${rawToken}x`)).toBeNull(); // manipulado
    expect(await validateSession(prisma, "no-existe")).toBeNull();
    expect(await validateSession(prisma, undefined)).toBeNull();
  });

  it("usuario BANEADO o borrado -> sus sesiones no valen", async () => {
    const userId = await crearUsuario("a@test.com");
    const { rawToken } = await createSession(prisma, userId);
    await prisma.user.update({ where: { id: userId }, data: { bannedAt: new Date() } });
    expect(await validateSession(prisma, rawToken)).toBeNull();
  });

  it("CAMBIO DE CONTRASENA -> mueren TODAS las sesiones del usuario (no solo la actual)", async () => {
    const userId = await crearUsuario("a@test.com");
    const otro = await crearUsuario("b@test.com");
    const s1 = await createSession(prisma, userId);
    const s2 = await createSession(prisma, userId);
    const sOtro = await createSession(prisma, otro);

    await changePassword(prisma, { userId, newPassword: "TEST-FIXTURE-pass-nueva-larga" });

    // Las dos del usuario, muertas.
    expect(await validateSession(prisma, s1.rawToken)).toBeNull();
    expect(await validateSession(prisma, s2.rawToken)).toBeNull();
    // La de otro usuario, intacta.
    expect(await validateSession(prisma, sOtro.rawToken)).not.toBeNull();
    // Y la contrasena cambio.
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    expect(u.passwordHash).not.toBe("TEST-FIXTURE-hash-viejo");
  });

  it("revokeAllUserSessions borra todas las de un usuario", async () => {
    const userId = await crearUsuario("a@test.com");
    await createSession(prisma, userId);
    await createSession(prisma, userId);
    await revokeAllUserSessions(prisma, userId);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  it("BANEO: marca bannedAt Y borra TODAS las filas Session (no resucitan al levantar el baneo)", async () => {
    const userId = await crearUsuario("a@test.com");
    await createSession(prisma, userId);
    await createSession(prisma, userId);

    await banUser(prisma, { userId });

    const u = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { bannedAt: true },
    });
    expect(u.bannedAt).not.toBeNull();
    // Revocacion REAL: no queda ninguna fila (si se levanta el baneo, no resucitan).
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  it("purga de sesiones caducadas: borra las vencidas y respeta las vigentes", async () => {
    const userId = await crearUsuario("a@test.com");
    const pasado = new Date(Date.now() - SESSION_TTL_MS - 1000);
    await createSession(prisma, userId, { now: pasado }); // caducada
    const viva = await createSession(prisma, userId); // vigente

    const { total: borradas } = await purgeExpiredSessions(prisma);
    expect(borradas).toBe(1);
    expect(await validateSession(prisma, viva.rawToken)).not.toBeNull();
  });

  it("UX cambio de contrasena: revoca las viejas y la sesion nueva del dispositivo SI vale", async () => {
    const userId = await crearUsuario("a@test.com");
    const vieja = await createSession(prisma, userId);

    const nueva = await changePassword(prisma, {
      userId,
      newPassword: "TEST-FIXTURE-pass-nueva-larga",
    });

    expect(await validateSession(prisma, vieja.rawToken)).toBeNull(); // la del atacante muere
    expect(await validateSession(prisma, nueva.rawToken)).not.toBeNull(); // el legitimo sigue dentro
    expect(await prisma.session.count({ where: { userId } })).toBe(1);
  });

  it("CAMBIO DE ROL revoca todas las sesiones (para coger el TTL correcto al reentrar)", async () => {
    const userId = await crearUsuario("a@test.com");
    const s = await createSession(prisma, userId);
    await changeRole(prisma, { userId, role: "ADMIN" });
    expect(await validateSession(prisma, s.rawToken)).toBeNull();
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true },
    });
    expect(u.role).toBe("ADMIN");
  });

  it("TTL por rol: createSession respeta el ttlMs pasado", async () => {
    const userId = await crearUsuario("a@test.com");
    const now = new Date("2026-01-01T00:00:00.000Z");
    const s = await createSession(prisma, userId, { now, ttlMs: SESSION_TTL_BY_ROLE.ADMIN });
    expect(s.expires.getTime()).toBe(now.getTime() + SESSION_TTL_BY_ROLE.ADMIN);
  });

  it("TOPE por usuario: al superar SESSION_MAX_PER_USER se borra la MAS ANTIGUA", async () => {
    const userId = await crearUsuario("a@test.com");
    // Crear el maximo, con createdAt crecientes.
    const tokens: string[] = [];
    for (let i = 0; i < SESSION_MAX_PER_USER; i++) {
      const s = await createSession(prisma, userId, { now: new Date(Date.now() + i * 1000) });
      tokens.push(s.rawToken);
    }
    // Una mas: debe expulsar a la primera (mas antigua).
    await createSession(prisma, userId, {
      now: new Date(Date.now() + SESSION_MAX_PER_USER * 1000),
    });

    expect(await prisma.session.count({ where: { userId } })).toBe(SESSION_MAX_PER_USER);
    expect(await validateSession(prisma, tokens[0]!)).toBeNull(); // la mas antigua, fuera
    expect(await validateSession(prisma, tokens[1]!)).not.toBeNull(); // el resto, dentro
  });
});
