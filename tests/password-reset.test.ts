/**
 * RESTABLECER contrasena ("olvide mi contrasena") — tests CON DIENTES.
 *
 *  - forgot-password NO ENUMERA: la RESPUESTA (status + cuerpo) es identica exista o no la cuenta.
 *  - reset-password: un token valido cambia la contrasena y BORRA todas las Session del usuario;
 *    un token YA USADO / CADUCADO / de OTRO PROPOSITO no cambia NADA.
 *
 * La ruta consume env/BD por import DINAMICO en tiempo de llamada; vitest iza los vi.mock por encima
 * de los imports, asi que las llamadas a POST() ven los dobles (mismo patron que reproduccion-firmada).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { createEmailToken } from "../src/server/auth/email-token";
import { requestPasswordReset, resetPassword } from "../src/server/auth/password-reset";

import { createTestPrisma, resetDb } from "./helpers/db";

// Ref perezosa a la BD de test: el getter la lee en tiempo de llamada (beforeAll ya la habra puesto).
const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { AUTH_SECRET: "forgot-test-secret-xyz", APP_URL: "https://x.test" },
}));

// Import tras los mocks (la ruta usa imports dinamicos, pero el import estatico del handler es seguro).
import { POST as forgotPOST } from "../src/app/api/auth/forgot-password/route";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

const TTL = 30 * 60 * 1000;
const HASH_ORIGINAL = "TEST-FIXTURE-hash-original";
const NUEVA = "NUEVA-contrasena-de-prueba-suficientemente-larga";

async function crearUsuario(email: string): Promise<string> {
  const u = await prisma.user.create({
    data: { email, passwordHash: HASH_ORIGINAL },
    select: { id: true },
  });
  return u.id;
}

/** Deja que el trabajo fire-and-forget de la ruta (findUnique + token + encolado) termine. */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 60));
}

function reqForgot(email: string): Request {
  return new Request("http://test/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("forgot-password: respuesta UNIFORME (sin enumeracion)", () => {
  it("email EXISTENTE e INEXISTENTE dan el MISMO status y el MISMO cuerpo", async () => {
    await crearUsuario("existe@test.com");

    const resExiste = await forgotPOST(reqForgot("existe@test.com"));
    const bodyExiste = await resExiste.json();
    const resNo = await forgotPOST(reqForgot("noexiste@test.com"));
    const bodyNo = await resNo.json();

    // La garantia anti-enumeracion: nada en la respuesta delata si la cuenta existe.
    expect(resExiste.status).toBe(200);
    expect(resNo.status).toBe(resExiste.status);
    expect(bodyNo).toEqual(bodyExiste);

    await flush(); // que el trabajo en segundo plano acabe antes del resetDb del siguiente test
  });

  it("DIENTES del efecto: solo la cuenta EXISTENTE acaba con token PASSWORD_RESET + correo encolado", async () => {
    await crearUsuario("existe@test.com");

    await forgotPOST(reqForgot("existe@test.com"));
    await forgotPOST(reqForgot("noexiste@test.com"));
    await flush();

    // Existe -> un token de reset y un job de correo. Inexistente -> nada (pero la RESPUESTA fue igual).
    const tokens = await prisma.verificationToken.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.identifier).toBe("existe@test.com");
    expect(tokens[0]?.purpose).toBe("PASSWORD_RESET");
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(1);
  });
});

describe("requestPasswordReset (servicio)", () => {
  it("crea un token PASSWORD_RESET y encola UN correo con enlace a /restablecer", async () => {
    await requestPasswordReset(prisma, { email: "a@test.com", appUrl: "https://x.test" });

    const tok = await prisma.verificationToken.findFirstOrThrow({
      where: { identifier: "a@test.com" },
    });
    expect(tok.purpose).toBe("PASSWORD_RESET");

    const job = await prisma.job.findFirstOrThrow({ where: { type: "SEND_EMAIL" } });
    const payload = job.payload as { to: string; text: string };
    expect(payload.to).toBe("a@test.com");
    expect(payload.text).toContain("/restablecer?token=");
  });
});

describe("resetPassword: consumo del token", () => {
  it("token VALIDO cambia la contrasena y BORRA todas las sesiones del usuario", async () => {
    const email = "user@test.com";
    const userId = await crearUsuario(email);
    await prisma.session.create({
      data: { sessionToken: "sess-1", userId, expires: new Date(Date.now() + 1_000_000) },
    });
    await prisma.session.create({
      data: { sessionToken: "sess-2", userId, expires: new Date(Date.now() + 1_000_000) },
    });

    const { rawToken } = await createEmailToken(prisma, {
      identifier: email,
      purpose: "PASSWORD_RESET",
      ttlMs: TTL,
    });

    const r = await resetPassword(prisma, { rawToken, newPassword: NUEVA });
    expect(r.ok).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).not.toBe(HASH_ORIGINAL); // cambio real
    expect(user.passwordHash).toMatch(/^\$argon2id\$/); // Argon2id
    // REVOCACION: ninguna sesion del usuario sobrevive al reset.
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    // Un solo uso: el token ya no existe.
    expect(await prisma.verificationToken.count()).toBe(0);
  });

  it("token YA USADO no cambia NADA la segunda vez (un solo uso)", async () => {
    const email = "user@test.com";
    const userId = await crearUsuario(email);
    const { rawToken } = await createEmailToken(prisma, {
      identifier: email,
      purpose: "PASSWORD_RESET",
      ttlMs: TTL,
    });

    const primera = await resetPassword(prisma, { rawToken, newPassword: NUEVA });
    expect(primera.ok).toBe(true);
    const hashTrasPrimera = (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
      .passwordHash;

    // Una sesion NUEVA creada despues del reset legitimo NO debe morir en un re-uso fallido.
    await prisma.session.create({
      data: { sessionToken: "sess-nueva", userId, expires: new Date(Date.now() + 1_000_000) },
    });

    const segunda = await resetPassword(prisma, {
      rawToken,
      newPassword: "OTRA-distinta-larga-xyz",
    });
    expect(segunda).toEqual({ ok: false, reason: "INVALID" });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).toBe(hashTrasPrimera); // NO se re-aplico
    expect(await prisma.session.count({ where: { userId } })).toBe(1); // la sesion nueva sigue viva
  });

  it("token CADUCADO no cambia NADA (y se limpia por higiene)", async () => {
    const email = "user@test.com";
    const userId = await crearUsuario(email);
    await prisma.session.create({
      data: { sessionToken: "sess-1", userId, expires: new Date(Date.now() + 1_000_000) },
    });
    // Emitido en el pasado con TTL corto -> ya caducado respecto a "ahora".
    const { rawToken } = await createEmailToken(prisma, {
      identifier: email,
      purpose: "PASSWORD_RESET",
      ttlMs: 1000,
      now: new Date(Date.now() - 60_000),
    });

    const r = await resetPassword(prisma, { rawToken, newPassword: NUEVA });
    expect(r).toEqual({ ok: false, reason: "EXPIRED" });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).toBe(HASH_ORIGINAL); // sin cambios
    expect(await prisma.session.count({ where: { userId } })).toBe(1); // sesion intacta
    expect(await prisma.verificationToken.count()).toBe(0); // el caducado se borro (un solo uso)
  });

  it("PROPOSITO CRUZADO: un token EMAIL_VERIFY no vale para reset y no toca nada", async () => {
    const email = "user@test.com";
    const userId = await crearUsuario(email);
    // Token de OTRO proposito para la misma direccion.
    const { rawToken } = await createEmailToken(prisma, {
      identifier: email,
      purpose: "EMAIL_VERIFY",
      ttlMs: TTL,
    });

    const r = await resetPassword(prisma, { rawToken, newPassword: NUEVA });
    expect(r).toEqual({ ok: false, reason: "INVALID" }); // el purpose va en el WHERE: no casa

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).toBe(HASH_ORIGINAL); // sin cambios
    // El token de EMAIL_VERIFY sigue INTACTO (reset no consume tokens de otro proposito).
    const tok = await prisma.verificationToken.findFirstOrThrow({ where: { identifier: email } });
    expect(tok.purpose).toBe("EMAIL_VERIFY");
  });
});
