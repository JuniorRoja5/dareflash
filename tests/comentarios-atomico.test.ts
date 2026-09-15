/**
 * EL AVISO VA DENTRO DE LA TRANSACCIÓN DEL COMENTARIO: si emitirlo falla, no queda ni el comentario
 * ni el contador subido. Existen los dos o ninguno.
 *
 * Se fuerza el fallo sustituyendo `emitirAviso` por uno que revienta. Para romperlo a propósito: emitir
 * el aviso DESPUÉS de la transacción (el comentario quedaría escrito sin su aviso: rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/server/services/notificaciones", async (orig) => ({
  ...(await orig<typeof import("../src/server/services/notificaciones")>()),
  emitirAviso: vi.fn(async () => {
    throw new Error("el aviso no se pudo escribir");
  }),
}));

import type { PrismaClient } from "../src/generated/prisma/client";
import { publicarComentario } from "../src/server/services/comentarios";
import { emitirAviso } from "../src/server/services/notificaciones";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

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

describe("comentario y aviso, en una sola transacción", () => {
  it("si el aviso falla, no queda el comentario ni sube el contador", async () => {
    const dueno = await crearUsuario(prisma);
    const autor = await crearUsuario(prisma);
    const video = await prisma.video.create({
      data: { userId: dueno, bunnyVideoId: "atomico-1", status: "PUBLISHED", category: "fitness" },
      select: { id: true },
    });

    await expect(
      publicarComentario(prisma, { userId: autor, videoId: video.id, texto: "Hola" }),
    ).rejects.toThrow("el aviso no se pudo escribir");

    // Y se emitió con el cliente de la TRANSACCIÓN, no con el cliente raíz (que escribiría fuera).
    expect(vi.mocked(emitirAviso)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitirAviso).mock.calls[0]![0]).not.toBe(prisma);
    expect(await prisma.comment.count()).toBe(0);
    expect((await prisma.video.findUniqueOrThrow({ where: { id: video.id } })).commentCount).toBe(
      0,
    );
  });
});
