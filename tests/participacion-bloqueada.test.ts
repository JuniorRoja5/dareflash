/**
 * BORRAR TU VÍDEO NO TE EXPULSA DEL RETO; QUE TE RETIRE UN MODERADOR, SÍ.
 *
 * Bug que bloqueó una verificación en producción. La regla decidía mirando `Video.status === REMOVED`,
 * pero a REMOVED se llega por dos caminos con consecuencias OPUESTAS —moderación y borrado del dueño—
 * y el estado no los distingue. Resultado: quien borraba su propio vídeo quedaba vetado del reto para
 * siempre, con un mensaje que además mentía ("retirada por moderación").
 *
 * Ahora la decisión sale de `Submission.retiradaMotivo`, explícito en BD. Estos tests fijan las dos
 * mitades: que el dueño puede volver, y que el moderado NO.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MSG_PARTICIPACION_BLOQUEADA } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  iniciarParticipacion,
  puedeParticipar,
  retirarParticipacion,
} from "../src/server/services/participacion";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let challengeId: string;
let userId: string;
let contador = 0;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  contador = 0;
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

/** Arranca una participación como lo hace la ruta: dentro de una transacción. */
async function participar() {
  contador += 1;
  return prisma.$transaction((tx) =>
    iniciarParticipacion(tx, {
      challengeId,
      userId,
      bunnyGuid: `guid-${contador}`,
      title: `V${contador}`,
    }),
  );
}

/** Publica la participación recién creada (como hace el worker al confirmar). */
async function publicar(videoId: string, submissionId: string) {
  await prisma.video.update({ where: { id: videoId }, data: { status: "PUBLISHED" } });
  await prisma.submission.update({ where: { id: submissionId }, data: { status: "PUBLISHED" } });
}

/** Lo que hace `DELETE /api/videos/[id]`: el DUEÑO borra su vídeo. */
async function borradoDelDueno(videoId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.video.update({ where: { id: videoId }, data: { status: "REMOVED" } });
    await tx.submission.updateMany({
      where: { videoId },
      data: { status: "REMOVED", retiradaMotivo: "DUENO", retiradaEn: new Date() },
    });
  });
}

describe("el dueño borra su propio vídeo", () => {
  it("puede VOLVER a participar en el mismo reto", async () => {
    const primera = await participar();
    if (primera.modo === "bloqueada") throw new Error("la primera no puede estar bloqueada");
    await publicar(primera.videoId, primera.submissionId);

    await borradoDelDueno(primera.videoId);

    // Esto es lo que estaba roto: aquí salía "bloqueada" y el usuario quedaba vetado del reto.
    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: true });
    const segunda = await participar();
    expect(segunda.modo).toBe("primera");
  });

  it("la segunda participación es NUEVA, no un reemplazo de la borrada", async () => {
    const primera = await participar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await publicar(primera.videoId, primera.submissionId);
    await borradoDelDueno(primera.videoId);

    const segunda = await participar();
    if (segunda.modo === "bloqueada") throw new Error("inesperado");

    // No hay nada que reemplazar: la vieja se retiró. Una Submission viva, la nueva.
    expect(segunda.modo).toBe("primera");
    expect(segunda.submissionId).not.toBe(primera.submissionId);
    const vivas = await prisma.submission.count({ where: { challengeId, userId } });
    expect(vivas).toBe(1); // el `unique` se respeta: la vieja se borró al liberar el hueco
  });

  it("borrar y volver a borrar tampoco bloquea (no se acumula un veto)", async () => {
    for (let i = 0; i < 3; i += 1) {
      const p = await participar();
      if (p.modo === "bloqueada") throw new Error(`bloqueada en la vuelta ${i}`);
      await publicar(p.videoId, p.submissionId);
      await borradoDelDueno(p.videoId);
      expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: true });
    }
  });
});

describe("un moderador retira la participación", () => {
  it("NO puede volver a participar", async () => {
    const primera = await participar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await publicar(primera.videoId, primera.submissionId);

    await retirarParticipacion(prisma, primera.submissionId);

    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: false });
    const segunda = await participar();
    expect(segunda.modo).toBe("bloqueada");
  });

  it("la retirada deja CONSTANCIA de que fue moderación", async () => {
    const primera = await participar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await retirarParticipacion(prisma, primera.submissionId);

    const sub = await prisma.submission.findUniqueOrThrow({
      where: { id: primera.submissionId },
      select: { status: true, retiradaMotivo: true, retiradaEn: true },
    });
    // Sin el motivo explícito, esta retirada sería indistinguible de un borrado del dueño.
    expect(sub.retiradaMotivo).toBe("MODERACION");
    expect(sub.status).toBe("REMOVED");
    expect(sub.retiradaEn).toBeInstanceOf(Date);
  });

  it("el mensaje dice la VERDAD: nombra al moderador", async () => {
    // Ahora que el borrado propio ya no bloquea, si el bloqueo salta es SIEMPRE moderación. El copy
    // puede afirmarlo sin mentir — antes se lo comía también quien solo había borrado su vídeo.
    expect(MSG_PARTICIPACION_BLOQUEADA).toMatch(/moderador/i);
    expect(MSG_PARTICIPACION_BLOQUEADA.length).toBeGreaterThan(20);
  });
});

describe("los demás caminos siguen como estaban", () => {
  it("sin participación previa -> primera", async () => {
    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: true });
    expect((await participar()).modo).toBe("primera");
  });

  it("con una participación VIVA -> reemplazo, no una segunda Submission", async () => {
    const primera = await participar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await publicar(primera.videoId, primera.submissionId);

    const segunda = await participar();
    expect(segunda.modo).toBe("reemplazo");
    expect(await prisma.submission.count({ where: { challengeId, userId } })).toBe(1);
  });

  it("una subida FALLIDA libera el hueco (no es un veto)", async () => {
    const primera = await participar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await prisma.video.update({ where: { id: primera.videoId }, data: { status: "FAILED" } });

    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: true });
    expect((await participar()).modo).toBe("primera");
  });
});

describe("el backfill de la migración no veta a nadie por error", () => {
  it("una fila vieja SIN motivo y con el vídeo REMOVED (borrado del dueño) NO bloquea", async () => {
    // Reproduce el estado ANTERIOR a la migración: Submission viva, Video REMOVED, sin motivo. Es
    // exactamente lo que dejaba el borrado del dueño, y lo que el backfill deja en `NULL`.
    const primera = await participar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    await publicar(primera.videoId, primera.submissionId);
    await prisma.video.update({ where: { id: primera.videoId }, data: { status: "REMOVED" } });
    await prisma.submission.update({
      where: { id: primera.submissionId },
      data: { retiradaMotivo: null },
    });

    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: true });
  });

  it("una fila vieja con la Submission REMOVED (moderación) SÍ bloquea tras el backfill", async () => {
    const primera = await participar();
    if (primera.modo === "bloqueada") throw new Error("inesperado");
    // Estado que dejaba `retirarParticipacion` antes del campo, + lo que escribe el backfill.
    await prisma.submission.update({
      where: { id: primera.submissionId },
      data: { status: "REMOVED", retiradaMotivo: "MODERACION" },
    });

    expect(await puedeParticipar(prisma, { challengeId, userId })).toEqual({ puede: false });
  });
});

/**
 * UN RECHAZO NO PUEDE CREAR NADA EN BUNNY. Esto no se puede ejecutar aquí (haría falta la API de
 * Bunny), pero el invariante es un ORDEN dentro de un fichero, y eso sí se puede fijar: la
 * comprobación de elegibilidad tiene que estar ANTES de la llamada que crea el objeto.
 */
describe("un intento bloqueado no deja huérfanos en Bunny", () => {
  const RUTA = "src/app/api/videos/upload-credential/route.ts";
  const leer = (): string =>
    readFileSync(path.resolve(__dirname, "..", RUTA), "utf8")
      // Sobre el CÓDIGO: el comentario que EXPLICA el orden menciona las dos cosas.
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("la elegibilidad se comprueba ANTES de crear el objeto en Bunny", () => {
    const src = leer();
    const comprobacion = src.indexOf("puedeParticipar(");
    const creacion = src.indexOf("crearObjetoVideo(");
    expect(comprobacion).toBeGreaterThan(-1);
    expect(creacion).toBeGreaterThan(-1);
    // El orden inverso —el que había— creaba un objeto en Bunny en CADA 409: el usuario lo veía como
    // una subida colgada en "uploading" y encima le bloqueaba el reintento.
    expect(comprobacion).toBeLessThan(creacion);
  });

  it("la comprobación de dentro de la transacción SIGUE estando (es la que no tiene carrera)", () => {
    // La guarda previa evita el huérfano; la autoridad sigue siendo la de dentro de la transacción,
    // porque entre las dos el estado puede cambiar. Quitarla dejaría una carrera abierta.
    const src = leer();
    expect(src).toContain("iniciarParticipacion(");
    expect(src).toMatch(/r\.modo === "bloqueada"/);
  });
});
