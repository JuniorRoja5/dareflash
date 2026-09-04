/**
 * EL BORRADO DEL DUEÑO, POR SU RUTA DE VERDAD.
 *
 * `participacion-bloqueada.test.ts` prueba la REGLA, pero simulaba el borrado escribiendo las filas a
 * mano. Al romper la ruta a propósito para comprobar los dientes, ese test siguió verde: estaba
 * probando mi ayudante, no la aplicación. Esto ejecuta `DELETE /api/videos/[id]` de verdad —con el
 * `mutatingRoute` real y la BD real— y comprueba que deja al usuario libre para volver a participar.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

const APP_URL = "http://test.local";
const SECRET = "secreto-de-test-suficientemente-largo-para-hmac";

const mocks = vi.hoisted(() => ({ prisma: null as PrismaClient | null, getCurrentUser: vi.fn() }));

vi.mock("@/config/env", () => ({ env: { APP_URL, AUTH_SECRET: SECRET } }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return mocks.prisma;
  },
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));

import { DELETE } from "../src/app/api/videos/[id]/route";
import { issueCsrfToken } from "../src/server/auth/csrf";
import { iniciarParticipacion, puedeParticipar } from "../src/server/services/participacion";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let challengeId: string;
let userId: string;

beforeAll(() => {
  prisma = createTestPrisma();
  mocks.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  mocks.getCurrentUser.mockReset();
  const admin = await crearUsuario(prisma);
  const reto = await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date(Date.now() - 3_600_000),
      deadline: new Date(Date.now() + 86_400_000),
      createdById: admin,
    },
    select: { id: true },
  });
  challengeId = reto.id;
  userId = await crearUsuario(prisma);
});

/** Llama a la RUTA real de borrado, con sesión y CSRF válidos. */
async function borrar(videoId: string) {
  mocks.getCurrentUser.mockResolvedValue({
    userId,
    sessionId: "s1",
    role: "USER",
    emailVerified: new Date(),
  });
  return DELETE(
    new Request(`${APP_URL}/api/videos/${videoId}`, {
      method: "DELETE",
      headers: { origin: APP_URL, "x-csrf-token": issueCsrfToken(SECRET, "s1") },
    }),
    { params: Promise.resolve({ id: videoId }) },
  );
}

describe("DELETE /api/videos/[id] sobre una participación", () => {
  it("marca la participación como retirada POR EL DUEÑO, y deja volver a participar", async () => {
    const p = await prisma.$transaction((tx) =>
      iniciarParticipacion(tx, { challengeId, userId, bunnyGuid: "g1", title: "V1" }),
    );
    if (p.modo === "bloqueada") throw new Error("inesperado");
    await prisma.video.update({ where: { id: p.videoId }, data: { status: "PUBLISHED" } });
    await prisma.submission.update({
      where: { id: p.submissionId },
      data: { status: "PUBLISHED" },
    });

    expect((await borrar(p.videoId)).status).toBe(200);

    const sub = await prisma.submission.findUniqueOrThrow({
      where: { id: p.submissionId },
      select: { status: true, retiradaMotivo: true },
    });
    // Sin esto, la Submission quedaba viva apuntando a un Video REMOVED y la regla la leía como
    // moderación: el usuario quedaba vetado del reto para siempre por borrar SU propio vídeo.
    expect(sub.retiradaMotivo).toBe("DUENO");
    expect(sub.status).toBe("REMOVED");
    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: true });
  });

  it("sigue encolando el borrado del objeto en Bunny (no se pierde el limpiado)", async () => {
    const p = await prisma.$transaction((tx) =>
      iniciarParticipacion(tx, { challengeId, userId, bunnyGuid: "g2", title: "V2" }),
    );
    if (p.modo === "bloqueada") throw new Error("inesperado");

    await borrar(p.videoId);

    const job = await prisma.job.findFirst({ where: { type: "BUNNY_DELETE_VIDEO" } });
    expect(job).not.toBeNull();
  });

  it("borrar un vídeo LIBRE (sin participación) no rompe nada", async () => {
    const v = await prisma.video.create({
      data: { userId, bunnyVideoId: "g3", status: "PUBLISHED", category: "fitness" },
      select: { id: true },
    });
    expect((await borrar(v.id)).status).toBe(200);
    expect(
      (await prisma.video.findUniqueOrThrow({ where: { id: v.id }, select: { status: true } }))
        .status,
    ).toBe("REMOVED");
  });
});
