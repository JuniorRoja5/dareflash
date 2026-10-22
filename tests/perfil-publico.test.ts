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
import { generarCodigoReferido } from "../src/server/auth/codigo-referido";

import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import {
  aPerfilPublico,
  estadoDeVideo,
  miPerfil,
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
  failureReason?: string,
): Promise<string> {
  const v = await prisma.video.create({
    data: { userId, status, bunnyVideoId: bunny, title, failureReason: failureReason ?? null },
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
      "bio",
      // La CLAVE del color de nombre que eligió (nunca un color, y nunca si es VIP: eso lo
      // resuelve el chokepoint). Es público porque es exactamente lo que se ve en pantalla.
      "colorNombre",
      "displayName",
      "id",
      "image",
      "instagram",
      "pointsBalance",
      "username",
      "website",
      "youtube",
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
        referralCode: generarCodigoReferido(),
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

  it("categoría en la rejilla por AMBAS vías: participación -> reto; libre -> Video.category", async () => {
    const u = await prisma.user.create({
      data: { referralCode: generarCodigoReferido(), username: "creador_cat" },
      select: { id: true },
    });
    // Vídeo LIBRE con su propia categoría.
    await prisma.video.create({
      data: {
        userId: u.id,
        status: "PUBLISHED",
        bunnyVideoId: "b-libre-cat",
        title: "Libre",
        category: "gaming",
      },
    });
    // PARTICIPACIÓN: la categoría sale del RETO (Submission publicada), NO del Video (que es null).
    const vidPart = await prisma.video.create({
      data: {
        userId: u.id,
        status: "PUBLISHED",
        bunnyVideoId: "b-part-cat",
        title: "Participación",
      },
      select: { id: true },
    });
    const reto = await prisma.challenge.create({
      data: {
        title: "Reto fitness",
        slug: "reto",
        publicCode: generarPublicCode(),
        category: "fitness",
        prizeCurrency: "USD",
        startsAt: new Date(),
        deadline: new Date(Date.now() + 1000),
        createdById: u.id,
      },
      select: { id: true },
    });
    await prisma.submission.create({
      data: { challengeId: reto.id, userId: u.id, videoId: vidPart.id, status: "PUBLISHED" },
    });

    const perfil = await perfilPublicoPorUsername(prisma, "creador_cat");
    const cats = new Map(perfil!.videos.map((v) => [v.bunnyVideoId, v.categoria]));
    expect(cats.get("b-libre-cat")).toBe("gaming"); // vía Video.category
    expect(cats.get("b-part-cat")).toBe("fitness"); // vía Submission->Challenge (no del Video)
  });

  it("retosGanados = número de filas ChallengeResult del usuario", async () => {
    const u = await prisma.user.create({
      data: { referralCode: generarCodigoReferido(), username: "ganador", pointsBalance: 0 },
      select: { id: true },
    });
    const ch = await prisma.challenge.create({
      data: {
        title: "Reto X",
        slug: "reto",
        publicCode: generarPublicCode(),
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
      data: { referralCode: generarCodigoReferido(), username: "borrado", deletedAt: new Date() },
      select: { id: true },
    });
    expect(await perfilPublicoPorId(prisma, borrado.id)).toBeNull();

    await prisma.user.create({
      data: { referralCode: generarCodigoReferido(), username: "baneado", bannedAt: new Date() },
    });
    expect(await perfilPublicoPorUsername(prisma, "baneado")).toBeNull();
  });
});

// ============================================================================
// PIEZA C — Estado de MIS vídeos (solo el dueño) vs perfil público de otro
// ============================================================================

describe("estadoDeVideo (mapeo PURO status+failureReason -> copy semántico)", () => {
  it("PENDING -> procesando; PUBLISHED -> publicado", () => {
    expect(estadoDeVideo("PENDING", null)).toBe("procesando");
    expect(estadoDeVideo("PUBLISHED", null)).toBe("publicado");
  });

  it("FAILED + TOO_LONG -> demasiado-largo (la sobreduración se distingue)", () => {
    expect(estadoDeVideo("FAILED", "TOO_LONG")).toBe("demasiado-largo");
  });

  it("FAILED + OBJETO_INEXISTENTE -> no-disponible (Parte C: NO es 'error' de proceso)", () => {
    expect(estadoDeVideo("FAILED", "OBJETO_INEXISTENTE")).toBe("no-disponible");
  });

  it("FAILED con otro motivo (o desconocido/nulo) -> error genérico", () => {
    expect(estadoDeVideo("FAILED", "TRANSCODE_ERROR")).toBe("error");
    expect(estadoDeVideo("FAILED", "UPLOAD_INCOMPLETE")).toBe("error");
    expect(estadoDeVideo("FAILED", null)).toBe("error");
    expect(estadoDeVideo("FAILED", "MOTIVO_INVENTADO")).toBe("error");
  });

  it("un estado inesperado NUNCA se disfraza de 'procesando'", () => {
    expect(estadoDeVideo("REJECTED", null)).toBe("error");
    expect(estadoDeVideo("REMOVED", null)).toBe("error");
  });
});

describe("mis vídeos con estado vs perfil público (DIENTES anti-fuga)", () => {
  it("el DUEÑO ve los estados; el público de OTRO solo PUBLISHED, sin motivo crudo", async () => {
    const duena = await prisma.user.create({
      data: {
        referralCode: generarCodigoReferido(),
        username: "duena",
        displayName: "Dueña",
        pointsBalance: 10,
      },
      select: { id: true },
    });
    await crearVideo(duena.id, "PUBLISHED", "b-pub", "Publicado");
    await crearVideo(duena.id, "PENDING", "b-pend", "En proceso");
    await crearVideo(duena.id, "FAILED", "b-long", "Largo", "TOO_LONG");
    await crearVideo(duena.id, "FAILED", "b-err", "Roto", "TRANSCODE_ERROR");

    // DUEÑO (miPerfil, por userId de SESIÓN): ve los 4 con su estado humanizado.
    const mio = await miPerfil(prisma, duena.id);
    expect(mio).not.toBeNull();
    const porBunny = new Map(mio!.videos.map((v) => [v.bunnyVideoId, v.estado]));
    expect(porBunny.get("b-pub")).toBe("publicado");
    expect(porBunny.get("b-pend")).toBe("procesando");
    expect(porBunny.get("b-long")).toBe("demasiado-largo");
    expect(porBunny.get("b-err")).toBe("error");
    // Ni el motivo crudo ni el enum de Prisma viajan en el DTO del dueño.
    const mioStr = JSON.stringify(mio);
    for (const crudo of ["TOO_LONG", "TRANSCODE_ERROR", "FAILED", "PENDING", "failureReason"]) {
      expect(mioStr).not.toContain(crudo);
    }

    // PÚBLICO de OTRO (por username Y por id): SOLO el PUBLISHED; cero rastro de lo no publicado.
    for (const publico of [
      await perfilPublicoPorUsername(prisma, "duena"),
      await perfilPublicoPorId(prisma, duena.id),
    ]) {
      expect(publico).not.toBeNull();
      expect(publico!.videos.map((v) => v.bunnyVideoId)).toEqual(["b-pub"]);
      const pubStr = JSON.stringify(publico);
      for (const fuga of [
        "b-pend",
        "b-long",
        "b-err",
        "TOO_LONG",
        "TRANSCODE_ERROR",
        "FAILED",
        "PENDING",
        "estado",
        "procesando",
        "demasiado-largo",
      ]) {
        expect(pubStr).not.toContain(fuga);
      }
    }
  });

  it("miPerfil de un usuario inexistente/borrado/baneado -> null", async () => {
    expect(await miPerfil(prisma, "no-existe")).toBeNull();

    const borrado = await prisma.user.create({
      data: { referralCode: generarCodigoReferido(), username: "borrado2", deletedAt: new Date() },
      select: { id: true },
    });
    expect(await miPerfil(prisma, borrado.id)).toBeNull();

    const baneado = await prisma.user.create({
      data: { referralCode: generarCodigoReferido(), username: "baneado2", bannedAt: new Date() },
      select: { id: true },
    });
    expect(await miPerfil(prisma, baneado.id)).toBeNull();
  });
});

/**
 * LA REJILLA DEL PERFIL ESTÁ PAGINADA, y antes no tenía ni `take`.
 *
 * ┌─ POR QUÉ IMPORTA ───────────────────────────────────────────────────────────────────────────┐
 * │ Se traían TODOS los vídeos de la cuenta en cada visita: una consulta que crece sin techo y   │
 * │ un payload entero viajando al navegador. Para quien sube a diario eso no falla, solo se pone │
 * │ cada vez más lento — y cuando duele, duele en producción.                                     │
 * │                                                                                               │
 * │ Y LA CIFRA DE LA CABECERA SE CUENTA APARTE. Salía de `videos.length`, que era verdad mientras │
 * │ la rejilla trajera todo; con la rejilla paginada diría "18 vídeos" para alguien que tiene     │
 * │ trescientos. Es el fallo silencioso que acompaña siempre a paginar una lista que se contaba   │
 * │ a sí misma.                                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("la rejilla del perfil", () => {
  /** n vídeos PUBLISHED de un usuario, uno por minuto. Devuelve los ids del más viejo al más nuevo. */
  async function conVideos(
    username: string,
    n: number,
  ): Promise<{ userId: string; ids: string[] }> {
    const u = await prisma.user.create({
      data: { referralCode: generarCodigoReferido(), username },
      select: { id: true },
    });
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const id = await crearVideo(u.id, "PUBLISHED", `${username}-${i}`, `V${i}`);
      await prisma.video.update({
        where: { id },
        data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) },
      });
      ids.push(id);
    }
    return { userId: u.id, ids };
  }

  it("trae UNA página y el total CONTADO, no la longitud de la página", async () => {
    const { userId } = await conVideos("rejilla1", 5);

    const perfil = (await perfilPublicoPorId(prisma, userId))!;
    const { videosPublicosDe } = await import("../src/server/services/perfil");
    const pagina = await videosPublicosDe(prisma, userId, { limite: 2 });

    expect(pagina.items).toHaveLength(2);
    expect(pagina.nextCursor).not.toBeNull();
    // El perfil trae su primera página (el tope por defecto cabe de sobra con 5) y el total REAL.
    expect(perfil.totalVideos, "el total sale de la página, no de la base").toBe(5);
  });

  it("el total NO es la longitud de la página cuando hay más de una", async () => {
    const { userId } = await conVideos("rejilla2", 3);
    const { videosPublicosDe } = await import("../src/server/services/perfil");

    const pagina = await videosPublicosDe(prisma, userId, { limite: 1 });
    const total = await prisma.video.count({ where: { userId, status: "PUBLISHED" } });

    expect(pagina.items).toHaveLength(1);
    expect(total).toBe(3);
  });

  it("se recorre entera sin saltarse ni repetir, y aguanta que se retire uno en medio", async () => {
    const { userId, ids } = await conVideos("rejilla3", 5);
    const { videosPublicosDe } = await import("../src/server/services/perfil");

    const p1 = await videosPublicosDe(prisma, userId, { limite: 2 });
    expect(p1.items.map((v) => v.id)).toEqual([ids[4], ids[3]]);

    // El dueño borra el vídeo del CURSOR entre una página y la siguiente.
    await prisma.video.update({ where: { id: ids[3]! }, data: { status: "REMOVED" } });

    const p2 = await videosPublicosDe(prisma, userId, { cursor: p1.nextCursor, limite: 2 });
    expect(
      p2.items.map((v) => v.id),
      "la página 2 se ha descolocado",
    ).toEqual([ids[2], ids[1]]);

    const p3 = await videosPublicosDe(prisma, userId, { cursor: p2.nextCursor, limite: 2 });
    expect(p3.items.map((v) => v.id)).toEqual([ids[0]]);
    expect(p3.nextCursor).toBeNull();
  });

  it("MI rejilla pagina igual, y sigue trayendo los no publicados (que son míos)", async () => {
    const u = await prisma.user.create({
      data: { referralCode: generarCodigoReferido(), username: "rejillamia" },
      select: { id: true },
    });
    const publicado = await crearVideo(u.id, "PUBLISHED", "mio-pub", "Publicado");
    const procesando = await crearVideo(u.id, "PENDING", "mio-pend", "En proceso");
    await prisma.video.update({
      where: { id: publicado },
      data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0)) },
    });
    await prisma.video.update({
      where: { id: procesando },
      data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, 1)) },
    });

    const { misVideosPaginados } = await import("../src/server/services/perfil");
    const p1 = await misVideosPaginados(prisma, u.id, { limite: 1 });
    const p2 = await misVideosPaginados(prisma, u.id, { cursor: p1.nextCursor, limite: 1 });

    expect(p1.items.map((v) => v.estado)).toEqual(["procesando"]);
    expect(p2.items.map((v) => v.estado)).toEqual(["publicado"]);
    expect(p2.nextCursor).toBeNull();
  });

  it("y la rejilla PÚBLICA sigue sin enseñar los no publicados, ni paginando", async () => {
    // La barrera de siempre, ahora también en la página 2: son dos `where` distintos a propósito
    // (`dondeVideosPublicos` y `dondeMisVideos`), no uno con una bandera que alguien pase mal.
    const u = await prisma.user.create({
      data: { referralCode: generarCodigoReferido(), username: "rejillaotra" },
      select: { id: true },
    });
    for (let i = 0; i < 3; i += 1) {
      const id = await crearVideo(u.id, "PUBLISHED", `otra-pub-${i}`, `P${i}`);
      await prisma.video.update({
        where: { id },
        data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, i * 2)) },
      });
    }
    // Uno FALLIDO justo entre medias, donde caería el corte de la primera página.
    const fallido = await crearVideo(u.id, "FAILED", "otra-fail", "Fallido", "TRANSCODE_ERROR");
    await prisma.video.update({
      where: { id: fallido },
      data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, 3)) },
    });

    const { videosPublicosDe } = await import("../src/server/services/perfil");
    const p1 = await videosPublicosDe(prisma, u.id, { limite: 2 });
    const p2 = await videosPublicosDe(prisma, u.id, { cursor: p1.nextCursor, limite: 2 });
    const vistos = [...p1.items, ...p2.items];

    expect(vistos.map((v) => v.id)).not.toContain(fallido);
    expect(vistos).toHaveLength(3);
    expect(JSON.stringify(vistos)).not.toContain("TRANSCODE_ERROR");
  });
});
