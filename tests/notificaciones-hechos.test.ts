/**
 * NOTIFICACIONES — cada aviso nace en el CHOKEPOINT de su hecho, y ninguno se repite.
 *
 * Estos tests ejecutan las rutas REALES (cierre, empate, ledger, voto, transición de vídeo,
 * reconciliaciones) contra la base de datos. Ninguno inserta un aviso a mano para luego contarlo.
 *
 * EL QUE SE MIRA CON LUPA es el del cierre REPARADO: el barrido vuelve a pasar por todos los
 * otorgamientos de un reto con `premiadosEn` a NULL, los puntos son no-op por su clave, y el aviso se
 * vuelve a intentar — lo único que impide el segundo "Has ganado" es el UNIQUE. Para romperlo:
 *  - quitar `skipDuplicates` de `emitirAviso` -> la re-emisión revienta, cuenta como fallo y
 *    `premiadosEn` no se vuelve a marcar nunca (rojo);
 *  - quitar el @@unique -> cada pasada escribe otro aviso (rojo).
 * Otros:
 *  - emitir TOP20 también al ganador -> rojo (decisión: al ganador le basta GANASTE_RETO);
 *  - clave del voto por fila de `Vote` -> quitar y volver a votar avisa dos veces (rojo);
 *  - aviso de vídeo fuera de `aplicarTransicion` (solo en el sondeo) -> el rescate no avisa (rojo);
 *  - aviso de nivel en cada otorgamiento, no al cruzar -> sumar sin subir avisa (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POINTS } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { BunnyNotFoundError, type ClienteBunny } from "../src/server/services/bunny";
import {
  cerrarRetosVencidos,
  cerrarRetoVencido,
  resolverEmpate,
} from "../src/server/services/cierre-reto";
import { otorgarHitosDeVideos } from "../src/server/services/hito-videos";
import { applyPoints } from "../src/server/services/ledger";
import { reconciliarPublicadosDesaparecidos } from "../src/server/services/reconciliacion-publicados";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import { aplicarTransicion } from "../src/server/services/video-confirmacion";
import { reconciliarVideosAbandonados } from "../src/server/services/video-reconciliacion";
import { emitirVoto, moverVoto, quitarVoto } from "../src/server/services/votes";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let adminId: string;
let n = 0;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  n = 0;
  adminId = await crearUsuario(prisma);
});

const cuenta = (userId: string, tipo: string) =>
  prisma.notification.count({ where: { userId, tipo } });
const tipos = async (userId: string) =>
  (await prisma.notification.findMany({ where: { userId }, select: { tipo: true } }))
    .map((a) => a.tipo)
    .sort();

async function crearReto(
  opts: { winnersCount?: number; abierto?: boolean; titulo?: string } = {},
): Promise<{ id: string }> {
  n += 1;
  return prisma.challenge.create({
    data: {
      title: opts.titulo ?? `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      prizeAmountCents: 5000,
      winnersCount: opts.winnersCount ?? 1,
      startsAt: new Date(Date.now() - 86_400_000),
      // Por defecto VENCIDO (para el cierre); `abierto` lo deja votable.
      deadline: opts.abierto ? new Date(Date.now() + 86_400_000) : new Date(Date.now() - 3_600_000),
      createdById: adminId,
    },
    select: { id: true },
  });
}

/** Participación PUBLICADA (Submission + Video) de un autor nuevo, con `votos` en su contador. */
async function participar(
  challengeId: string,
  votos = 0,
): Promise<{ userId: string; submissionId: string }> {
  const userId = await crearUsuario(prisma);
  n += 1;
  const video = await prisma.video.create({
    data: { userId, bunnyVideoId: `guid-${n}-${Date.now()}`, status: "PUBLISHED" },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: { challengeId, userId, videoId: video.id, status: "PUBLISHED", voteCount: votos },
    select: { id: true },
  });
  return { userId, submissionId: sub.id };
}

// ---------------------------------------------------------------------------------------------------

describe("GANASTE_RETO y TOP20, en otorgarPuntosDelCierre", () => {
  it("cerrar emite UNA GANASTE_RETO por ganador y TOP20 al resto del top-20 (no al ganador)", async () => {
    const reto = await crearReto();
    const gana = await participar(reto.id, 10);
    const segundo = await participar(reto.id, 5);
    const tercero = await participar(reto.id, 1);

    await cerrarRetoVencido(prisma, reto.id);

    expect(await cuenta(gana.userId, "GANASTE_RETO")).toBe(1);
    expect(await cuenta(gana.userId, "TOP20")).toBe(0);
    expect(await cuenta(segundo.userId, "TOP20")).toBe(1);
    expect(await cuenta(tercero.userId, "TOP20")).toBe(1);
    expect(await cuenta(segundo.userId, "GANASTE_RETO")).toBe(0);
    // El aviso cuenta el hecho, no reparte: el ganador cobra sus DOS otorgamientos igual.
    const u = await prisma.user.findUnique({ where: { id: gana.userId } });
    expect(u?.pointsBalance).toBe(POINTS.WIN_CHALLENGE + POINTS.TOP20);
  });

  it("re-ejecutar el cierre (la función y el barrido) emite CERO avisos nuevos", async () => {
    const reto = await crearReto();
    await participar(reto.id, 10);
    await participar(reto.id, 5);
    await cerrarRetoVencido(prisma, reto.id);
    const antes = await prisma.notification.count();

    await cerrarRetoVencido(prisma, reto.id);
    await cerrarRetosVencidos(prisma);

    expect(await prisma.notification.count()).toBe(antes);
  });

  it("LUPA — un cierre REPARADO cinco veces: solo el UNIQUE impide repetir los avisos, y la reparación termina", async () => {
    const reto = await crearReto();
    const gana = await participar(reto.id, 10);
    const otro = await participar(reto.id, 5);
    await cerrarRetoVencido(prisma, reto.id);

    // Cierre "a medias": el hecho y los puntos están, pero `premiadosEn` no se llegó a marcar (el
    // proceso murió). El barrido lo recoge y re-ejecuta TODOS los otorgamientos: los puntos son no-op
    // por su clave, y el aviso se intenta otra vez en cada pasada.
    for (let i = 0; i < 5; i += 1) {
      await prisma.challenge.update({ where: { id: reto.id }, data: { premiadosEn: null } });
      await cerrarRetosVencidos(prisma);
    }

    expect(await cuenta(gana.userId, "GANASTE_RETO")).toBe(1);
    expect(await cuenta(otro.userId, "TOP20")).toBe(1);
    // Si la re-emisión reventara (sin INSERT IGNORE), contaría como fallo y el reto se quedaría sin
    // `premiadosEn` para siempre: la reparación no terminaría nunca.
    const r = await prisma.challenge.findUnique({ where: { id: reto.id } });
    expect(r?.premiadosEn).not.toBeNull();
  });

  it("la reparación REPONE un aviso perdido (el proceso murió entre los puntos y el aviso)", async () => {
    const reto = await crearReto();
    const gana = await participar(reto.id, 10);
    await cerrarRetoVencido(prisma, reto.id);

    await prisma.notification.deleteMany({ where: { userId: gana.userId, tipo: "GANASTE_RETO" } });
    await prisma.challenge.update({ where: { id: reto.id }, data: { premiadosEn: null } });
    await cerrarRetosVencidos(prisma);

    expect(await cuenta(gana.userId, "GANASTE_RETO")).toBe(1);
  });

  it("el aviso cuenta el reto por su título y enlaza a su URL canónica", async () => {
    const reto = await crearReto({ titulo: "Salto mortal" });
    const gana = await participar(reto.id, 3);
    await cerrarRetoVencido(prisma, reto.id);
    const a = await prisma.notification.findFirst({ where: { userId: gana.userId } });
    expect(a?.refType).toBe("CHALLENGE");
    expect(a?.refId).toBe(reto.id);
    expect(JSON.stringify(a?.datos)).toContain("Salto mortal");
  });
});

describe("resolver un EMPATE", () => {
  it("el cierre en empate no avisa a nadie; resolverlo emite los que faltaban, sin duplicar", async () => {
    const reto = await crearReto();
    const a = await participar(reto.id, 7);
    const b = await participar(reto.id, 7);
    const c = await participar(reto.id, 2);

    await cerrarRetoVencido(prisma, reto.id);
    expect((await prisma.challenge.findUnique({ where: { id: reto.id } }))?.motivoCierre).toBe(
      "EMPATE_PENDIENTE",
    );
    expect(await prisma.notification.count()).toBe(0);

    const r = await resolverEmpate(prisma, reto.id, [b.submissionId]);
    expect(r.resuelto).toBe(true);
    expect(await cuenta(b.userId, "GANASTE_RETO")).toBe(1);
    expect(await cuenta(b.userId, "TOP20")).toBe(0);
    expect(await cuenta(a.userId, "GANASTE_RETO")).toBe(0);
    expect(await cuenta(a.userId, "TOP20")).toBe(1);
    expect(await cuenta(c.userId, "TOP20")).toBe(1);

    const total = await prisma.notification.count();
    await cerrarRetosVencidos(prisma);
    await cerrarRetoVencido(prisma, reto.id);
    expect((await resolverEmpate(prisma, reto.id, [a.submissionId])).resuelto).toBe(false);
    expect(await prisma.notification.count()).toBe(total);
  });

  it("dos plazas con empate en la segunda: el ganador LIMPIO recibe UN aviso al resolver", async () => {
    const reto = await crearReto({ winnersCount: 2 });
    const limpio = await participar(reto.id, 10);
    const x = await participar(reto.id, 5);
    const y = await participar(reto.id, 5);

    await cerrarRetoVencido(prisma, reto.id);
    expect(await prisma.notification.count()).toBe(0);

    expect((await resolverEmpate(prisma, reto.id, [y.submissionId])).resuelto).toBe(true);
    expect(await cuenta(limpio.userId, "GANASTE_RETO")).toBe(1);
    expect(await cuenta(y.userId, "GANASTE_RETO")).toBe(1);
    expect(await cuenta(x.userId, "GANASTE_RETO")).toBe(0);
    expect(await cuenta(x.userId, "TOP20")).toBe(1);
    expect(await cuenta(limpio.userId, "TOP20")).toBe(0);
  });
});

describe("SUBISTE_NIVEL, donde se aplican los puntos", () => {
  const dar = (userId: string, delta: number, clave: string) =>
    applyPoints(prisma, { userId, delta, reason: "TEST", idempotencyKey: clave });
  const niveles = async (userId: string) =>
    (
      await prisma.notification.findMany({
        where: { userId, tipo: "SUBISTE_NIVEL" },
        select: { refId: true },
      })
    ).map((a) => a.refId);

  it("quedarse en 90 no avisa; cruzar 100 avisa UNA vez de Challenger; sumar sin subir, nada", async () => {
    const u = await crearUsuario(prisma);
    await dar(u, 90, "k1");
    expect(await niveles(u)).toEqual([]);
    await dar(u, 10, "k2");
    expect(await niveles(u)).toEqual(["challenger"]);
    await dar(u, 5, "k3");
    expect(await niveles(u)).toEqual(["challenger"]);
  });

  it("re-aplicar los MISMOS puntos (clave repetida, no-op) no avisa otra vez", async () => {
    const u = await crearUsuario(prisma);
    await dar(u, 90, "base");
    expect((await dar(u, 10, "k")).applied).toBe(true);
    expect((await dar(u, 10, "k")).applied).toBe(false);
    expect(await niveles(u)).toEqual(["challenger"]);
  });

  it("un salto de varios niveles avisa del de LLEGADA, no de cada umbral saltado", async () => {
    const u = await crearUsuario(prisma);
    await dar(u, 600, "k");
    expect(await niveles(u)).toEqual(["pro"]);
  });

  it("bajar y volver a cruzar no repite: llegar a un nivel es un logro, una vez", async () => {
    const u = await crearUsuario(prisma);
    await dar(u, 100, "a");
    await dar(u, -20, "b");
    await dar(u, 30, "c");
    expect(await niveles(u)).toEqual(["challenger"]);
  });

  it("vale para CUALQUIER origen de puntos: el hito de vídeos también avisa al cruzar", async () => {
    const u = await crearUsuario(prisma);
    await dar(u, 98, "previo");
    for (let i = 0; i < 3; i += 1) {
      await prisma.video.create({
        data: { userId: u, bunnyVideoId: `hito-${u}-${i}`, status: "PUBLISHED" },
      });
    }
    expect(await otorgarHitosDeVideos(prisma, u)).toBe(1); // +5 -> 103
    expect(await niveles(u)).toEqual(["challenger"]);
  });
});

describe("VOTO_RECIBIDO, en la transacción del voto", () => {
  async function escena() {
    const reto = await crearReto({ abierto: true, titulo: "Reto abierto" });
    const p1 = await participar(reto.id);
    const p2 = await participar(reto.id);
    const votante = await crearUsuario(prisma);
    return { reto, p1, p2, votante };
  }

  it("un voto -> UN aviso al dueño, con el reto, y el votante fuera del texto", async () => {
    const { p1, votante } = await escena();
    expect(
      (await emitirVoto(prisma, { userId: votante, submissionId: p1.submissionId })).estado,
    ).toBe("votado");
    expect(await cuenta(p1.userId, "VOTO_RECIBIDO")).toBe(1);
    expect(await cuenta(votante, "VOTO_RECIBIDO")).toBe(0);
    const a = await prisma.notification.findFirst({ where: { userId: p1.userId } });
    expect(JSON.stringify(a?.datos)).toContain("Reto abierto");
    expect(JSON.stringify(a?.datos)).not.toContain(votante);
  });

  it("dos votantes distintos sobre la misma participación -> dos avisos", async () => {
    const { p1, votante } = await escena();
    const otro = await crearUsuario(prisma);
    await emitirVoto(prisma, { userId: votante, submissionId: p1.submissionId });
    await emitirVoto(prisma, { userId: otro, submissionId: p1.submissionId });
    expect(await cuenta(p1.userId, "VOTO_RECIBIDO")).toBe(2);
  });

  it("votar, irse a otra y volver -> UNO al primer dueño; el segundo recibe el suyo (es un log)", async () => {
    const { p1, p2, votante } = await escena();
    await emitirVoto(prisma, { userId: votante, submissionId: p1.submissionId });
    expect(
      (await moverVoto(prisma, { userId: votante, submissionId: p2.submissionId })).estado,
    ).toBe("movido");
    expect(
      (await moverVoto(prisma, { userId: votante, submissionId: p1.submissionId })).estado,
    ).toBe("movido");
    expect(await cuenta(p1.userId, "VOTO_RECIBIDO")).toBe(1);
    expect(await cuenta(p2.userId, "VOTO_RECIBIDO")).toBe(1);
  });

  it("quitar y volver a votar -> sigue siendo UNO (con la clave por fila de Vote serían dos)", async () => {
    const { p1, votante } = await escena();
    await emitirVoto(prisma, { userId: votante, submissionId: p1.submissionId });
    for (let i = 0; i < 3; i += 1) {
      expect(
        (await quitarVoto(prisma, { userId: votante, submissionId: p1.submissionId })).estado,
      ).toBe("quitado");
      expect(
        (await emitirVoto(prisma, { userId: votante, submissionId: p1.submissionId })).estado,
      ).toBe("votado");
    }
    expect(await cuenta(p1.userId, "VOTO_RECIBIDO")).toBe(1);
  });

  it("el doble clic (ya-votada) no avisa otra vez", async () => {
    const { p1, votante } = await escena();
    await emitirVoto(prisma, { userId: votante, submissionId: p1.submissionId });
    expect(
      (await emitirVoto(prisma, { userId: votante, submissionId: p1.submissionId })).estado,
    ).toBe("ya-votada");
    expect(await cuenta(p1.userId, "VOTO_RECIBIDO")).toBe(1);
  });

  it("el autovoto y el voto a un reto cerrado no avisan a nadie", async () => {
    const { p1 } = await escena();
    const r = await emitirVoto(prisma, { userId: p1.userId, submissionId: p1.submissionId });
    expect(r).toEqual({ estado: "rechazado", motivo: "AUTOVOTO" });

    const cerrado = await crearReto();
    const pc = await participar(cerrado.id);
    const votante = await crearUsuario(prisma);
    const r2 = await emitirVoto(prisma, { userId: votante, submissionId: pc.submissionId });
    expect(r2).toEqual({ estado: "rechazado", motivo: "RETO_CERRADO" });

    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("VIDEO_LISTO / VIDEO_FALLIDO, dentro de aplicarTransicion", () => {
  const CONFIG = { libraryId: "12345", apiKey: "APIKEY_FALSA_no_real" };
  function dobleBunny(getVideo: ClienteBunny["getVideo"]): ClienteBunny {
    return {
      crearVideo: async () => ({ guid: "no-usado" }),
      getVideo,
      listVideos: async () => ({ items: [], totalItems: 0 }),
      deleteVideo: async () => {},
      setThumbnail: async () => {},
    };
  }
  async function videoPendiente(userId: string, creado?: Date): Promise<string> {
    n += 1;
    const v = await prisma.video.create({
      data: {
        userId,
        bunnyVideoId: `guid-v-${n}`,
        status: "PENDING",
        ...(creado ? { createdAt: creado } : {}),
      },
      select: { id: true },
    });
    return v.id;
  }

  it("PENDING -> PUBLISHED avisa VIDEO_LISTO, y después ya no puede avisar de fallo (nunca los dos)", async () => {
    const u = await crearUsuario(prisma);
    const v = await videoPendiente(u);
    expect(await aplicarTransicion(prisma, v, { destino: "PUBLISHED", durationSec: 30 })).toBe(1);
    expect(
      await aplicarTransicion(prisma, v, { destino: "FAILED", failureReason: "TRANSCODE_ERROR" }),
    ).toBe(0);
    expect(await tipos(u)).toEqual(["VIDEO_LISTO"]);
  });

  it("PENDING -> FAILED avisa VIDEO_FALLIDO con su motivo; re-aplicar no repite", async () => {
    const u = await crearUsuario(prisma);
    const v = await videoPendiente(u);
    await aplicarTransicion(prisma, v, { destino: "FAILED", failureReason: "TOO_LONG" });
    await aplicarTransicion(prisma, v, { destino: "FAILED", failureReason: "TOO_LONG" });
    expect(await tipos(u)).toEqual(["VIDEO_FALLIDO"]);
    const a = await prisma.notification.findFirst({ where: { userId: u } });
    expect(a?.refId).toBe(v);
    expect(a?.datos).toEqual({ motivo: "TOO_LONG" });
  });

  it("el RESCATE de la reconciliación (PENDING vieja que sí terminó) avisa VIDEO_LISTO", async () => {
    const u = await crearUsuario(prisma);
    await videoPendiente(u, new Date(Date.now() - 2 * 86_400_000));
    const r = await reconciliarVideosAbandonados(
      prisma,
      dobleBunny(async () => ({ status: 4, length: 30, thumbnailFileName: null })),
      CONFIG,
      { maxEdadMs: 3_600_000, lote: 10, maxSeg: 90 },
    );
    expect(r.rescatados).toBe(1);
    expect(await tipos(u)).toEqual(["VIDEO_LISTO"]);
  });

  it("la subida ABANDONADA (UPLOAD_INCOMPLETE) avisa VIDEO_FALLIDO, sin tumbar el barrido", async () => {
    const u = await crearUsuario(prisma);
    await videoPendiente(u, new Date(Date.now() - 2 * 86_400_000));
    const r = await reconciliarVideosAbandonados(
      prisma,
      dobleBunny(async ({ videoId }) => {
        throw new BunnyNotFoundError(videoId);
      }),
      CONFIG,
      { maxEdadMs: 3_600_000, lote: 10, maxSeg: 90 },
    );
    expect(r.incompletos).toBe(1);
    const a = await prisma.notification.findFirst({ where: { userId: u } });
    expect(a?.tipo).toBe("VIDEO_FALLIDO");
    expect(a?.datos).toEqual({ motivo: "UPLOAD_INCOMPLETE" });
  });

  it("la DEGRADACIÓN de un publicado que Bunny perdió NO avisa: ya tuvo su VIDEO_LISTO", async () => {
    const u = await crearUsuario(prisma);
    const v = await videoPendiente(u);
    await aplicarTransicion(prisma, v, { destino: "PUBLISHED", durationSec: 30 });

    await reconciliarPublicadosDesaparecidos(
      prisma,
      dobleBunny(async ({ videoId }) => {
        throw new BunnyNotFoundError(videoId);
      }),
      CONFIG,
      { modo: "actuar", lotePorCiclo: 10, topeFilas: 10, topePct: 1 },
    );

    // La degradación ocurrió de verdad (si no, el test no diría nada)...
    expect((await prisma.video.findUnique({ where: { id: v } }))?.status).toBe("FAILED");
    // ...y el dueño no recibe un "fallo" de un vídeo que ya estuvo publicado.
    expect(await tipos(u)).toEqual(["VIDEO_LISTO"]);
  });
});
