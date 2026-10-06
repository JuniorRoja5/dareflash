/**
 * ME GUSTA — contra la base, con dientes.
 *
 * Lo que se fija, y por qué cada cosa:
 *
 *  - UNO POR PERSONA Y VÍDEO, y lo impone la BASE (el UNIQUE), no un `if`: cinco peticiones a la
 *    vez del mismo usuario dejan UNA fila y suman UNO. Es el mismo fallo que el contador de votos
 *    tuvo que aprender a evitar.
 *  - EL CONTADOR NO MIENTE en ninguna secuencia: poner, quitar, repetir, concurrente. `likeCount`
 *    es un cache de las filas `Like`, y un cache que se descuadra se descubre tarde y mal.
 *  - NADIE SE DA LIKE A SÍ MISMO: además de no significar nada, es la forma barata de fabricarse
 *    el hito de los 50.
 *  - EL HITO ES UN LOGRO, NO UN SALDO: se paga una vez al llegar al umbral y NO se desotorga ni se
 *    vuelve a pagar si el contador baja y sube. Y lo cobra el DUEÑO del vídeo, no quien da el like.
 *  - LOS PUNTOS NO PUEDEN TUMBAR EL LIKE: si el otorgamiento falla, el like se queda puesto.
 *  - LO QUE NO SE VE NO SE QUIERE: un vídeo retirado o auto-oculto no admite likes nuevos, pero
 *    quien ya se lo dio puede retirarlo (si no, quedarían likes atrapados).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { LIKES_PARA_HITO, POINTS, RAZON_HITO_LIKES } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  claveHitoLikes,
  darLike,
  misLikes,
  otorgarHitoLikes,
  quitarLike,
} from "../src/server/services/likes";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let autor: string;
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
  autor = await crearUsuario(prisma, { username: "autora_likes" });
});

async function crearVideo(userId = autor): Promise<string> {
  n += 1;
  const v = await prisma.video.create({
    data: {
      userId,
      bunnyVideoId: `bunny-like-${n}-${Date.now()}`,
      status: "PUBLISHED",
      category: "RETOS",
    },
    select: { id: true },
  });
  return v.id;
}

const contador = async (videoId: string) =>
  (await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).likeCount;

const filas = (videoId: string) => prisma.like.count({ where: { videoId } });

const puntosDe = (userId: string) =>
  prisma.pointsLedger.findMany({ where: { userId, reason: RAZON_HITO_LIKES } });

describe("poner y quitar", () => {
  it("un like suma uno, y lo dice", async () => {
    const videoId = await crearVideo();
    const quien = await crearUsuario(prisma);

    expect(await darLike(prisma, { userId: quien, videoId })).toEqual({
      estado: "puesto",
      likes: 1,
    });
    expect(await contador(videoId)).toBe(1);
    expect(await filas(videoId)).toBe(1);
  });

  it("quitarlo resta uno", async () => {
    const videoId = await crearVideo();
    const quien = await crearUsuario(prisma);
    await darLike(prisma, { userId: quien, videoId });

    expect(await quitarLike(prisma, { userId: quien, videoId })).toEqual({
      estado: "quitado",
      likes: 0,
    });
    expect(await contador(videoId)).toBe(0);
    expect(await filas(videoId)).toBe(0);
  });

  it("repetir el like no suma dos veces (y no es un error)", async () => {
    const videoId = await crearVideo();
    const quien = await crearUsuario(prisma);
    await darLike(prisma, { userId: quien, videoId });

    expect(await darLike(prisma, { userId: quien, videoId })).toEqual({
      estado: "sin_cambios",
      likes: 1,
    });
    expect(await contador(videoId)).toBe(1);
  });

  it("quitar uno que no estaba no descuenta nada", async () => {
    const videoId = await crearVideo();
    const otro = await crearUsuario(prisma);
    const quien = await crearUsuario(prisma);
    await darLike(prisma, { userId: otro, videoId });

    expect(await quitarLike(prisma, { userId: quien, videoId })).toEqual({
      estado: "sin_cambios",
      likes: 1,
    });
    expect(await contador(videoId)).toBe(1);
  });

  it("CINCO a la vez de la misma persona dejan UNA fila y suman UNO", async () => {
    // Lo impide la BD, no un `if`: el UNIQUE y el cerrojo del vídeo. Sin el `FOR UPDATE`, el
    // contador se queda corto (o MariaDB responde 1020), que es el fallo que ya costó caro en votos.
    const videoId = await crearVideo();
    const quien = await crearUsuario(prisma);

    await Promise.all([1, 2, 3, 4, 5].map(() => darLike(prisma, { userId: quien, videoId })));

    expect(await filas(videoId)).toBe(1);
    expect(await contador(videoId)).toBe(1);
  });

  it("CINCO personas a la vez suman CINCO, sin perder ninguno", async () => {
    const videoId = await crearVideo();
    const gente = await Promise.all([1, 2, 3, 4, 5].map(() => crearUsuario(prisma)));

    await Promise.all(gente.map((userId) => darLike(prisma, { userId, videoId })));

    expect(await filas(videoId)).toBe(5);
    expect(await contador(videoId)).toBe(5);
  });

  it("el contador aguanta una secuencia larga de poner y quitar", async () => {
    const videoId = await crearVideo();
    const quien = await crearUsuario(prisma);
    for (let i = 0; i < 4; i += 1) {
      await darLike(prisma, { userId: quien, videoId });
      await quitarLike(prisma, { userId: quien, videoId });
    }
    expect(await contador(videoId)).toBe(0);
    expect(await filas(videoId)).toBe(0);
  });
});

describe("lo propio y lo que no se ve", () => {
  it("nadie se da like a sí mismo", async () => {
    const videoId = await crearVideo();
    expect(await darLike(prisma, { userId: autor, videoId })).toEqual({
      estado: "rechazado",
      motivo: "PROPIO",
    });
    expect(await contador(videoId)).toBe(0);
  });

  it("un vídeo retirado no admite likes nuevos", async () => {
    const videoId = await crearVideo();
    await prisma.video.update({ where: { id: videoId }, data: { status: "REMOVED" } });
    const quien = await crearUsuario(prisma);

    expect(await darLike(prisma, { userId: quien, videoId })).toEqual({
      estado: "rechazado",
      motivo: "NO_DISPONIBLE",
    });
  });

  it("uno auto-oculto por denuncias, tampoco", async () => {
    const videoId = await crearVideo();
    await prisma.video.update({ where: { id: videoId }, data: { ocultoAutoEn: new Date() } });
    const quien = await crearUsuario(prisma);

    expect(await darLike(prisma, { userId: quien, videoId })).toMatchObject({
      estado: "rechazado",
    });
  });

  it("PERO quien ya se lo dio puede retirarlo aunque el vídeo deje de verse", async () => {
    // Si quitar exigiera visibilidad, el like se quedaría atrapado: puesto para siempre sobre algo
    // que su dueño ya no puede ni ver.
    const videoId = await crearVideo();
    const quien = await crearUsuario(prisma);
    await darLike(prisma, { userId: quien, videoId });
    await prisma.video.update({ where: { id: videoId }, data: { status: "REMOVED" } });

    expect(await quitarLike(prisma, { userId: quien, videoId })).toEqual({
      estado: "quitado",
      likes: 0,
    });
  });

  it("un vídeo que no existe se rechaza igual, sin decir que no existe", async () => {
    const quien = await crearUsuario(prisma);
    expect(await darLike(prisma, { userId: quien, videoId: "no-existe" })).toEqual({
      estado: "rechazado",
      motivo: "NO_DISPONIBLE",
    });
  });
});

describe(`el hito de los ${LIKES_PARA_HITO}`, () => {
  /** Pone `cuantos` likes de personas distintas. Devuelve los ids de quienes los dieron. */
  async function likear(videoId: string, cuantos: number): Promise<string[]> {
    const gente: string[] = [];
    for (let i = 0; i < cuantos; i += 1) {
      const quien = await crearUsuario(prisma);
      await darLike(prisma, { userId: quien, videoId });
      gente.push(quien);
    }
    return gente;
  }

  it("son CINCUENTA likes, y moverlo exige venir aquí", () => {
    // Clavado como el umbral de denuncias y el plazo de inmunidad. Sin esto, bajarlo a 1 no ponía
    // nada en rojo: todos los casos se derivan de la constante y le seguirían la corriente.
    expect(LIKES_PARA_HITO).toBe(50);
  });

  it("por debajo del umbral no paga nada", async () => {
    const videoId = await crearVideo();
    await likear(videoId, LIKES_PARA_HITO - 1);
    expect(await puntosDe(autor)).toHaveLength(0);
  });

  it("y el otorgamiento SE NIEGA por su cuenta si no se ha llegado", async () => {
    // `darLike` ya no lo llama por debajo del umbral, así que esta guarda parecía redundante — y
    // por eso nadie la vigilaba. No lo es: `otorgarHitoLikes` está exportada y es el camino del
    // reintento, así que tiene que poder decir que no ella sola.
    const videoId = await crearVideo();
    await likear(videoId, 3);

    expect(await otorgarHitoLikes(prisma, videoId)).toBe(false);
    expect(await puntosDe(autor)).toHaveLength(0);
  });

  it("al llegar, paga UNA vez y lo cobra el DUEÑO del vídeo", async () => {
    const videoId = await crearVideo();
    const gente = await likear(videoId, LIKES_PARA_HITO);

    const movimientos = await puntosDe(autor);
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({
      delta: POINTS.VIDEO_50_LIKES,
      refType: "VIDEO",
      refId: videoId,
      idempotencyKey: claveHitoLikes(videoId),
    });
    // Y NO lo cobra quien dio el like.
    expect(await puntosDe(gente[0]!)).toHaveLength(0);
  });

  it("y el saldo del dueño sube de verdad", async () => {
    const videoId = await crearVideo();
    await likear(videoId, LIKES_PARA_HITO);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: autor } });
    expect(u.pointsBalance).toBe(POINTS.VIDEO_50_LIKES);
  });

  it("los likes siguientes NO vuelven a pagar", async () => {
    const videoId = await crearVideo();
    await likear(videoId, LIKES_PARA_HITO + 3);
    expect(await puntosDe(autor)).toHaveLength(1);
  });

  it("bajar de 50 y volver a subir TAMPOCO: el hito es un logro, no un saldo", async () => {
    const videoId = await crearVideo();
    const gente = await likear(videoId, LIKES_PARA_HITO);
    expect(await puntosDe(autor)).toHaveLength(1);

    await quitarLike(prisma, { userId: gente[0]!, videoId });
    expect(await contador(videoId)).toBe(LIKES_PARA_HITO - 1);
    await darLike(prisma, { userId: gente[0]!, videoId });

    expect(await puntosDe(autor), "se pagó dos veces el mismo hito").toHaveLength(1);
  });

  it("llamar al otorgamiento a mano es idempotente (lo reintenta el siguiente like)", async () => {
    const videoId = await crearVideo();
    await likear(videoId, LIKES_PARA_HITO);
    expect(await otorgarHitoLikes(prisma, videoId)).toBe(false);
    expect(await puntosDe(autor)).toHaveLength(1);
  });

  it("y un fallo de los puntos NO tumba el like", async () => {
    const videoId = await crearVideo();
    await likear(videoId, LIKES_PARA_HITO - 1);
    const quien = await crearUsuario(prisma);

    // Se rompe SOLO el camino del premio: `otorgarHitoLikes` cuenta las filas con `db.like.count`,
    // y `darLike` no lo usa (escribe dentro de la transacción, con su propio cliente). Así el like
    // se pone de verdad y lo único que revienta es lo de después.
    const db = new Proxy(prisma, {
      get(obj, prop) {
        if (prop === "like") {
          const real = Reflect.get(obj, prop) as object;
          return new Proxy(real, {
            get(l, p) {
              if (p === "count") return () => Promise.reject(new Error("contar likes falló"));
              const v = Reflect.get(l, p) as unknown;
              return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(l) : v;
            },
          });
        }
        const v = Reflect.get(obj, prop) as unknown;
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(obj) : v;
      },
    }) as PrismaClient;

    const r = await darLike(db, { userId: quien, videoId });

    expect(r, "el like se perdió por culpa de los puntos").toEqual({
      estado: "puesto",
      likes: LIKES_PARA_HITO,
    });
    expect(await contador(videoId)).toBe(LIKES_PARA_HITO);
    // Los puntos no se dieron, y eso está bien: el siguiente like lo reintenta.
    expect(await puntosDe(autor)).toHaveLength(0);
    expect(await otorgarHitoLikes(prisma, videoId), "el reintento sí paga").toBe(true);
  });
});

describe("mis likes, en una consulta", () => {
  it("devuelve solo los míos de los vídeos preguntados", async () => {
    const a = await crearVideo();
    const b = await crearVideo();
    const c = await crearVideo();
    const quien = await crearUsuario(prisma);
    const otro = await crearUsuario(prisma);
    await darLike(prisma, { userId: quien, videoId: a });
    await darLike(prisma, { userId: otro, videoId: b });

    const mios = await misLikes(prisma, quien, [a, b, c]);
    expect([...mios]).toEqual([a]);
  });

  it("sin sesión devuelve vacío y no consulta nada", async () => {
    const a = await crearVideo();
    expect([...(await misLikes(prisma, null, [a]))]).toEqual([]);
    expect([...(await misLikes(prisma, undefined, [a]))]).toEqual([]);
  });

  it("sin vídeos que preguntar, tampoco", async () => {
    const quien = await crearUsuario(prisma);
    expect([...(await misLikes(prisma, quien, []))]).toEqual([]);
  });
});
