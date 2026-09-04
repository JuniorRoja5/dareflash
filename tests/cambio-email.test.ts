/**
 * CAMBIO DE CORREO — control de seguridad, no un campo más del perfil.
 *
 * El correo ES la identidad de acceso: con él se entra y con él se recupera la cuenta. Un `UPDATE`
 * directo tendría dos agujeros, y estos tests fijan las dos defensas:
 *  - la dirección NUEVA se verifica antes de aplicarse (hasta entonces manda la vieja);
 *  - se avisa a la dirección ANTIGUA, que es la única forma de que el dueño real se entere si el que
 *    pidió el cambio fue otro.
 * (La tercera —exigir la contraseña— vive en el endpoint, con su rate-limit de argon2.)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { createEmailToken } from "../src/server/auth/email-token";
import { createSession, validateSession } from "../src/server/auth/session";
import {
  cancelarCambioEmail,
  confirmarCambioEmail,
  solicitarCambioEmail,
} from "../src/server/services/cambio-email";

import { createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;

const APP = "https://dareflash.test";
const VIEJO = "vieja@example.com";
const NUEVO = "nueva@example.com";

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  const u = await prisma.user.create({
    data: { username: "duenio", email: VIEJO, emailVerified: new Date() },
    select: { id: true },
  });
  userId = u.id;
});

/** El token en claro no vuelve del servicio (va al correo): se crea uno igual para poder confirmar. */
async function tokenPara(email: string): Promise<string> {
  const { rawToken } = await createEmailToken(prisma, {
    identifier: email,
    purpose: "EMAIL_CHANGE",
    ttlMs: 60_000,
  });
  return rawToken;
}

describe("pedir el cambio NO lo aplica", () => {
  it("la cuenta sigue con la dirección vieja hasta confirmar", async () => {
    expect(await solicitarCambioEmail(prisma, { userId, nuevoEmail: NUEVO, appUrl: APP })).toEqual({
      ok: true,
    });

    const u = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailPendiente: true },
    });
    // Esto es lo que impide que robar una sesión baste para llevarse la cuenta.
    expect(u.email).toBe(VIEJO);
    expect(u.emailPendiente).toBe(NUEVO);
  });

  it("avisa a la dirección ANTIGUA, no solo a la nueva", async () => {
    await solicitarCambioEmail(prisma, { userId, nuevoEmail: NUEVO, appUrl: APP });

    const correos = await prisma.job.findMany({ where: { type: "SEND_EMAIL" } });
    const destinos = correos.map((j) => JSON.stringify(j.payload));
    // Sin el aviso al viejo, el dueño real no se entera de nada mientras aún puede reaccionar.
    expect(destinos.some((d) => d.includes(NUEVO))).toBe(true);
    expect(destinos.some((d) => d.includes(VIEJO))).toBe(true);
  });

  it("no deja pedir una dirección que ya es la suya", async () => {
    expect(await solicitarCambioEmail(prisma, { userId, nuevoEmail: VIEJO, appUrl: APP })).toEqual({
      ok: false,
      motivo: "MISMA",
    });
  });

  it("no deja pedir una dirección de otra cuenta", async () => {
    await prisma.user.create({ data: { username: "otro", email: NUEVO } });

    expect(await solicitarCambioEmail(prisma, { userId, nuevoEmail: NUEVO, appUrl: APP })).toEqual({
      ok: false,
      motivo: "OCUPADA",
    });
  });
});

describe("confirmar la aplica", () => {
  it("cambia el correo y lo deja verificado", async () => {
    await solicitarCambioEmail(prisma, { userId, nuevoEmail: NUEVO, appUrl: APP });
    const token = await tokenPara(NUEVO);

    expect(await confirmarCambioEmail(prisma, { rawToken: token })).toEqual({
      ok: true,
      email: NUEVO,
    });

    const u = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailPendiente: true, emailVerified: true },
    });
    expect(u.email).toBe(NUEVO);
    expect(u.emailPendiente).toBeNull();
    // Llega verificada: acaba de demostrar que controla la dirección abriendo el enlace.
    expect(u.emailVerified).toBeInstanceOf(Date);
  });

  it("CIERRA las sesiones abiertas", async () => {
    const s = await createSession(prisma, userId);
    await solicitarCambioEmail(prisma, { userId, nuevoEmail: NUEVO, appUrl: APP });

    await confirmarCambioEmail(prisma, { rawToken: await tokenPara(NUEVO) });

    // El correo es la identidad de acceso: cambiarlo merece el mismo trato que cambiar la contraseña.
    expect(await validateSession(prisma, s.rawToken)).toBeNull();
  });

  it("un token de OTRO propósito no sirve para cambiar el correo", async () => {
    await solicitarCambioEmail(prisma, { userId, nuevoEmail: NUEVO, appUrl: APP });
    const { rawToken } = await createEmailToken(prisma, {
      identifier: NUEVO,
      purpose: "EMAIL_VERIFY",
      ttlMs: 60_000,
    });

    expect(await confirmarCambioEmail(prisma, { rawToken })).toEqual({
      ok: false,
      motivo: "INVALID",
    });
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    expect(u.email).toBe(VIEJO);
  });

  it("si la dirección se ocupó mientras tanto, NO revienta el UNIQUE", async () => {
    await solicitarCambioEmail(prisma, { userId, nuevoEmail: NUEVO, appUrl: APP });
    const token = await tokenPara(NUEVO);
    // Entre pedir y confirmar pueden pasar 24 h; en ese hueco alguien puede registrarla.
    await prisma.user.create({ data: { username: "rapido", email: NUEVO } });

    expect(await confirmarCambioEmail(prisma, { rawToken: token })).toEqual({
      ok: false,
      motivo: "OCUPADA",
    });
  });

  it("un token válido sin cambio pendiente no hace nada", async () => {
    const token = await tokenPara(NUEVO);
    expect(await confirmarCambioEmail(prisma, { rawToken: token })).toEqual({
      ok: false,
      motivo: "SIN_PENDIENTE",
    });
  });

  it("es de UN SOLO USO", async () => {
    await solicitarCambioEmail(prisma, { userId, nuevoEmail: NUEVO, appUrl: APP });
    const token = await tokenPara(NUEVO);

    expect((await confirmarCambioEmail(prisma, { rawToken: token })).ok).toBe(true);
    expect(await confirmarCambioEmail(prisma, { rawToken: token })).toEqual({
      ok: false,
      motivo: "INVALID",
    });
  });
});

describe("cancelar", () => {
  it("quita el pendiente y deja la cuenta como estaba", async () => {
    await solicitarCambioEmail(prisma, { userId, nuevoEmail: NUEVO, appUrl: APP });

    await cancelarCambioEmail(prisma, userId);

    const u = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailPendiente: true },
    });
    expect(u.emailPendiente).toBeNull();
    expect(u.email).toBe(VIEJO);
  });
});
