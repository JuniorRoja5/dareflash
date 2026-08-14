/**
 * PERFIL PÚBLICO — con DIENTES en la AUTORIZACIÓN. La propiedad clave: consultar un perfil (por
 * username o por id) devuelve SOLO campos públicos; cambiar el identificador NUNCA revela email,
 * fecha de nacimiento, saldos privados (monedero/Boost) ni el hash de contraseña.
 *
 * Barreras probadas:
 *   1) `SELECT_USUARIO_PUBLICO` no contiene ninguna columna privada (no se piden a la BD).
 *   2) `aPerfilPublico` copia solo lo público aunque la fila venga "contaminada".
 *   3) Extremo a extremo contra la BD real: el DTO de un usuario con datos privados no los expone.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";
import {
  aPerfilPublico,
  perfilPublicoPorId,
  perfilPublicoPorUsername,
  SELECT_USUARIO_PUBLICO,
} from "../src/server/services/perfil";

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

/** Campos que JAMÁS deben aparecer en un perfil público. */
const CAMPOS_PRIVADOS = [
  "email",
  "birthDate",
  "walletBalanceCents",
  "boostBalance",
  "passwordHash",
] as const;

async function crearVideo(
  userId: string,
  status: ModerationStatus,
  bunny: string,
  title: string,
): Promise<string> {
  const v = await prisma.video.create({
    data: { userId, status, bunnyVideoId: bunny, title },
    select: { id: true },
  });
  return v.id;
}

describe("SELECT_USUARIO_PUBLICO (barrera de columnas)", () => {
  it("no incluye NINGUNA columna privada; es exactamente el conjunto público", () => {
    for (const campo of CAMPOS_PRIVADOS) {
      expect(campo in SELECT_USUARIO_PUBLICO).toBe(false);
    }
    expect(Object.keys(SELECT_USUARIO_PUBLICO).sort()).toEqual([
      "displayName",
      "id",
      "image",
      "pointsBalance",
      "username",
    ]);
  });
});

describe("aPerfilPublico (mapeo puro, barrera de propagación)", () => {
  it("copia SOLO lo público aunque la fila traiga datos privados", () => {
    const contaminada = {
      id: "u1",
      username: "user",
      displayName: "User",
      image: null,
      pointsBalance: 5,
      // Ruido privado que NO debe propagarse:
      email: "secreto@ejemplo.com",
      passwordHash: "argon2-hash-secreto",
      walletBalanceCents: 4242,
    };
    const dto = aPerfilPublico(contaminada as never, 0, []);
    const serializado = JSON.stringify(dto);
    expect(serializado).not.toContain("secreto@ejemplo.com");
    expect(serializado).not.toContain("argon2-hash-secreto");
    expect(serializado).not.toContain("4242");
    for (const campo of CAMPOS_PRIVADOS) expect(campo in dto).toBe(false);
  });
});

describe("perfil público contra la BD real", () => {
  it("por username O por id: mismos datos públicos, CERO datos privados", async () => {
    const otro = await prisma.user.create({
      data: {
        username: "otro_user",
        displayName: "Otro",
        image: "https://ejemplo/imagen.jpg",
        pointsBalance: 320,
        // Datos privados sembrados a propósito:
        email: "privado@ejemplo.com",
        birthDate: new Date("2000-01-01T00:00:00Z"),
        passwordHash: "argon2-hash-secreto",
        walletBalanceCents: 4242,
        boostBalance: 7,
      },
      select: { id: true },
    });
    await crearVideo(otro.id, "PUBLISHED", "bunny-pub-1", "Mi salto");
    await crearVideo(otro.id, "PENDING", "bunny-pend-1", "Aún no listo");

    const porUsername = await perfilPublicoPorUsername(prisma, "otro_user");
    const porId = await perfilPublicoPorId(prisma, otro.id);

    for (const perfil of [porUsername, porId]) {
      expect(perfil).not.toBeNull();
      const serializado = JSON.stringify(perfil);
      // Secretos que no colisionan con ids: comprobación por contenido.
      expect(serializado).not.toContain("privado@ejemplo.com");
      expect(serializado).not.toContain("argon2-hash-secreto");
      expect(serializado).not.toContain("2000-01-01");
      // Y ninguna CLAVE privada presente (cubre también los saldos numéricos).
      for (const campo of CAMPOS_PRIVADOS) expect(campo in perfil!).toBe(false);
      // Solo el vídeo PUBLISHED entra en la rejilla.
      expect(perfil!.videos.map((v) => v.bunnyVideoId)).toEqual(["bunny-pub-1"]);
      expect(perfil!.username).toBe("otro_user");
      expect(perfil!.pointsBalance).toBe(320);
    }
  });

  it("retosGanados = número de filas ChallengeResult del usuario", async () => {
    const u = await prisma.user.create({
      data: { username: "ganador", pointsBalance: 0 },
      select: { id: true },
    });
    const ch = await prisma.challenge.create({
      data: {
        title: "Reto X",
        category: "fitness",
        prizeCurrency: "EUR",
        startsAt: new Date(),
        deadline: new Date(Date.now() + 1000),
        createdById: u.id,
      },
      select: { id: true },
    });
    await prisma.challengeResult.create({
      data: {
        challengeId: ch.id,
        userId: u.id,
        submissionId: "sub-libre",
        rank: 1,
        currency: "EUR",
      },
    });

    const perfil = await perfilPublicoPorUsername(prisma, "ganador");
    expect(perfil?.retosGanados).toBe(1);
  });

  it("usuario inexistente, borrado o baneado -> null", async () => {
    expect(await perfilPublicoPorUsername(prisma, "no_existe")).toBeNull();

    const borrado = await prisma.user.create({
      data: { username: "borrado", deletedAt: new Date() },
      select: { id: true },
    });
    expect(await perfilPublicoPorId(prisma, borrado.id)).toBeNull();

    await prisma.user.create({ data: { username: "baneado", bannedAt: new Date() } });
    expect(await perfilPublicoPorUsername(prisma, "baneado")).toBeNull();
  });
});
