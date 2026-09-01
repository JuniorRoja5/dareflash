/**
 * RUTA DE VOTO — POST/DELETE /api/participaciones/[id]/voto.
 *
 * Se ejecuta el envoltorio `mutatingRoute` DE VERDAD (Origin -> sesión -> CSRF): solo se sustituyen
 * `getCurrentUser` (para elegir quién llama) y el CLIENTE de Redis (que no existe en los tests). El
 * servicio de voto, el gate de "visto", el rate-limit y la BD son los reales — es lo único que puede
 * demostrar que la ruta ORQUESTA bien y no que un mock devuelve lo que se le pide.
 *
 * Con dientes:
 *  - votar SIN marca de visto -> rechazado con el copy humano, y NO se crea voto ni sube el contador;
 *    con marca -> votado. Quitar la comprobación de `haVisto` en la ruta pone esto en ROJO.
 *  - `permitirMover: true` deja EXACTAMENTE un voto, en el destino, y los dos contadores cuadrados;
 *    sin la bandera no se mueve nada y se devuelve una señal accionable (200, no error).
 *  - autovoto / reto cerrado / no publicada -> rechazados; quitar funciona (y NO exige visto).
 *  - la ruta ESCRIBE `ipHash`, y es el HMAC de la IP, no la IP.
 *  - "no existe" y "no publicada" responden EXACTAMENTE lo mismo (status, code y texto): si divergen,
 *    la ruta se convierte en un oráculo para enumerar participaciones ocultas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MSG_NO_DISPONIBLE,
  MSG_VOTO_AUTOVOTO,
  MSG_VOTO_RETO_CERRADO,
  MSG_VOTO_SIN_VER,
  MSG_VOTO_SIN_VOTO,
} from "../src/config/constants";
import type { ModerationStatus, PrismaClient } from "../src/generated/prisma/client";

const APP_URL = "http://test.local";
const SECRET = "secreto-de-test-suficientemente-largo-para-hmac";

/** Redis falso: un Map con TTL. Solo lo que usa `services/visto` (`set … EX` y `exists`). */
const mocks = vi.hoisted(() => {
  const claves = new Map<string, number>();
  return {
    prisma: null as PrismaClient | null,
    getCurrentUser: vi.fn(),
    claves,
    redis: {
      async set(clave: string, _v: string, _ex: string, ttlSec: number) {
        claves.set(clave, Date.now() + ttlSec * 1000);
      },
      async exists(clave: string) {
        const caduca = claves.get(clave);
        if (caduca === undefined) return 0;
        if (caduca <= Date.now()) {
          claves.delete(clave);
          return 0;
        }
        return 1;
      },
    },
  };
});

vi.mock("@/config/env", () => ({
  env: { APP_URL, AUTH_SECRET: SECRET, REDIS_URL: "redis://falso" },
}));
vi.mock("@/server/db/client", () => ({
  // Getter: `prisma` no existe todavía cuando `vi.mock` se iza; se resuelve al usarlo.
  get prisma() {
    return mocks.prisma;
  },
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/cache/redis", () => ({ getRedis: () => mocks.redis }));

import { DELETE, POST } from "../src/app/api/participaciones/[id]/voto/route";
import { POST as MARCAR_VISTO } from "../src/app/api/participaciones/[id]/visto/route";
import { issueCsrfToken } from "../src/server/auth/csrf";
import { clientIpKey } from "../src/server/http/api";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let retoAbierto: string;
let contador = 0;

const IP = "203.0.113.7";

/** Sesión de un usuario cualquiera; el `sessionId` es lo que ata el token CSRF. */
function sesion(userId: string) {
  return { userId, sessionId: `sess-${userId}`, role: "USER", emailVerified: new Date() };
}

function como(userId: string) {
  mocks.getCurrentUser.mockResolvedValue(sesion(userId));
}

function cabeceras(userId: string, ip = IP): HeadersInit {
  return {
    origin: APP_URL,
    "x-csrf-token": issueCsrfToken(SECRET, `sess-${userId}`),
    "x-real-ip": ip,
    "content-type": "application/json",
  };
}

function peticion(
  metodo: "POST" | "DELETE",
  userId: string,
  submissionId: string,
  opts: { cuerpo?: unknown; ip?: string; headers?: HeadersInit } = {},
) {
  const init: RequestInit = {
    method: metodo,
    headers: opts.headers ?? cabeceras(userId, opts.ip),
  };
  if (opts.cuerpo !== undefined) init.body = JSON.stringify(opts.cuerpo);
  return new Request(`${APP_URL}/api/participaciones/${submissionId}/voto`, init);
}

async function votar(
  userId: string,
  submissionId: string,
  opts: { cuerpo?: unknown; ip?: string; headers?: HeadersInit } = {},
) {
  como(userId);
  const res = await POST(peticion("POST", userId, submissionId, opts), {
    params: Promise.resolve({ id: submissionId }),
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

async function quitar(userId: string, submissionId: string) {
  como(userId);
  const res = await DELETE(peticion("DELETE", userId, submissionId), {
    params: Promise.resolve({ id: submissionId }),
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

/** Marca "visto" pasando por la RUTA real de la 2B: así se prueba el flujo entero ver -> votar. */
async function marcarVisto(userId: string, submissionId: string) {
  como(userId);
  const res = await MARCAR_VISTO(
    new Request(`${APP_URL}/api/participaciones/${submissionId}/visto`, {
      method: "POST",
      headers: cabeceras(userId),
    }),
    { params: Promise.resolve({ id: submissionId }) },
  );
  return res;
}

async function crearReto(opts: { cerrado?: boolean } = {}): Promise<string> {
  contador += 1;
  const admin = await crearUsuario(prisma);
  const reto = await prisma.challenge.create({
    data: {
      title: `Reto ${contador}`,
      slug: `reto-${contador}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date(Date.now() - 7_200_000),
      deadline: new Date(Date.now() + (opts.cerrado ? -3_600_000 : 86_400_000)),
      createdById: admin,
    },
    select: { id: true },
  });
  return reto.id;
}

async function crearParticipacion(
  opts: {
    challengeId?: string;
    autor?: string;
    subStatus?: ModerationStatus;
    videoStatus?: ModerationStatus;
  } = {},
): Promise<string> {
  contador += 1;
  const autor = opts.autor ?? (await crearUsuario(prisma));
  const video = await prisma.video.create({
    data: {
      userId: autor,
      bunnyVideoId: `bunny-${contador}`,
      status: opts.videoStatus ?? "PUBLISHED",
    },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: {
      challengeId: opts.challengeId ?? retoAbierto,
      userId: autor,
      videoId: video.id,
      status: opts.subStatus ?? "PUBLISHED",
    },
    select: { id: true },
  });
  return sub.id;
}

const votos = (id: string) =>
  prisma.submission.findUniqueOrThrow({ where: { id }, select: { voteCount: true } });

beforeAll(() => {
  prisma = createTestPrisma();
  mocks.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  mocks.claves.clear();
  mocks.getCurrentUser.mockReset();
  retoAbierto = await crearReto();
});

describe("el gate de 'visto' manda", () => {
  it("sin marca de visto NO se vota: copy humano y CERO efectos", async () => {
    const sub = await crearParticipacion();
    const votante = await crearUsuario(prisma);

    const { res, body } = await votar(votante, sub);

    expect(res.status).toBe(409);
    expect(body).toEqual({ error: { code: "SIN_VER", message: MSG_VOTO_SIN_VER } });
    // No basta con que responda mal: no puede haber dejado rastro.
    expect(await prisma.vote.count()).toBe(0);
    expect((await votos(sub)).voteCount).toBe(0);
  });

  it("con la marca puesta (por la ruta de la 2B) SÍ se vota", async () => {
    const sub = await crearParticipacion();
    const votante = await crearUsuario(prisma);

    expect((await marcarVisto(votante, sub)).status).toBe(200);
    const { res, body } = await votar(votante, sub);

    expect(res.status).toBe(200);
    expect(body).toEqual({ estado: "votado" });
    expect((await votos(sub)).voteCount).toBe(1);
  });

  it("la marca de OTRA participación no sirve para votar esta", async () => {
    const subA = await crearParticipacion();
    const subB = await crearParticipacion();
    const votante = await crearUsuario(prisma);

    await marcarVisto(votante, subA);
    const { res } = await votar(votante, subB);

    expect(res.status).toBe(409);
    expect(await prisma.vote.count()).toBe(0);
  });

  it("votar dos veces la misma es idempotente: no duplica ni recuenta", async () => {
    const sub = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, sub);

    await votar(votante, sub);
    const { res, body } = await votar(votante, sub);

    expect(res.status).toBe(200);
    expect(body).toEqual({ estado: "ya-votada" });
    expect(await prisma.vote.count()).toBe(1);
    expect((await votos(sub)).voteCount).toBe(1);
  });
});

describe("emitir-o-mover en un solo viaje", () => {
  it("SIN permitirMover: señal accionable (200, no error) y NADA cambia", async () => {
    const subA = await crearParticipacion();
    const subB = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, subA);
    await marcarVisto(votante, subB);
    await votar(votante, subA);

    const { res, body } = await votar(votante, subB);

    expect(res.status).toBe(200); // NO es un error: es una pregunta que la UI puede hacer
    expect(body.estado).toBe("requiere-mover");
    expect(typeof body.mensaje).toBe("string");
    // El voto sigue donde estaba y los contadores no se han tocado.
    expect((await votos(subA)).voteCount).toBe(1);
    expect((await votos(subB)).voteCount).toBe(0);
    expect(await prisma.vote.findFirstOrThrow({ select: { submissionId: true } })).toEqual({
      submissionId: subA,
    });
  });

  it("CON permitirMover: UNA petición deja exactamente un voto, en el destino", async () => {
    const subA = await crearParticipacion();
    const subB = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, subA);
    await marcarVisto(votante, subB);
    await votar(votante, subA);

    const { res, body } = await votar(votante, subB, { cuerpo: { permitirMover: true } });

    expect(res.status).toBe(200);
    expect(body).toEqual({ estado: "movido", desdeSubmissionId: subA });
    expect(await prisma.vote.count()).toBe(1);
    expect(await prisma.vote.findFirstOrThrow({ select: { submissionId: true } })).toEqual({
      submissionId: subB,
    });
    expect((await votos(subA)).voteCount).toBe(0);
    expect((await votos(subB)).voteCount).toBe(1);
  });

  it("permitirMover al sitio donde ya está: no-op (ni duplica ni descuenta)", async () => {
    const sub = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, sub);
    await votar(votante, sub);

    const { res, body } = await votar(votante, sub, { cuerpo: { permitirMover: true } });

    expect(res.status).toBe(200);
    expect(body).toEqual({ estado: "ya-votada" });
    expect((await votos(sub)).voteCount).toBe(1);
  });

  it("mover exige visto EN EL DESTINO: la bandera no salta el gate", async () => {
    const subA = await crearParticipacion();
    const subB = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, subA);
    await votar(votante, subA);

    const { res } = await votar(votante, subB, { cuerpo: { permitirMover: true } });

    expect(res.status).toBe(409);
    expect((await votos(subA)).voteCount).toBe(1);
    expect((await votos(subB)).voteCount).toBe(0);
  });

  it("un voto en OTRO reto no estorba: se puede votar en los dos", async () => {
    const otroReto = await crearReto();
    const subA = await crearParticipacion();
    const subB = await crearParticipacion({ challengeId: otroReto });
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, subA);
    await marcarVisto(votante, subB);

    expect((await votar(votante, subA)).body).toEqual({ estado: "votado" });
    expect((await votar(votante, subB)).body).toEqual({ estado: "votado" });
    expect(await prisma.vote.count()).toBe(2);
  });

  it("un `challengeId` inventado en el cuerpo NO cuela: se deriva de la Submission", async () => {
    const subA = await crearParticipacion();
    const subB = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, subA);
    await marcarVisto(votante, subB);
    await votar(votante, subA, { cuerpo: { challengeId: "reto-inventado" } });

    // Si el reto viniera del cliente, este segundo voto se colaría como "otro reto".
    const { body } = await votar(votante, subB, { cuerpo: { challengeId: "otro-inventado" } });

    expect(body.estado).toBe("requiere-mover");
    expect(await prisma.vote.count()).toBe(1);
  });
});

describe("rechazos", () => {
  it("autovoto -> 409 con copy humano", async () => {
    const autor = await crearUsuario(prisma);
    const sub = await crearParticipacion({ autor });
    await marcarVisto(autor, sub);

    const { res, body } = await votar(autor, sub);

    expect(res.status).toBe(409);
    expect(body).toEqual({ error: { code: "AUTOVOTO", message: MSG_VOTO_AUTOVOTO } });
    expect((await votos(sub)).voteCount).toBe(0);
  });

  it("reto cerrado -> 409, tanto al votar como al quitar", async () => {
    const cerrado = await crearReto({ cerrado: true });
    const sub = await crearParticipacion({ challengeId: cerrado });
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, sub);

    const alVotar = await votar(votante, sub);
    expect(alVotar.res.status).toBe(409);
    expect(alVotar.body).toEqual({
      error: { code: "RETO_CERRADO", message: MSG_VOTO_RETO_CERRADO },
    });

    // Y un voto ya puesto no se puede retirar cuando el plazo cerró: los votos son el resultado.
    await prisma.vote.create({
      data: { userId: votante, challengeId: cerrado, submissionId: sub },
    });
    const alQuitar = await quitar(votante, sub);
    expect(alQuitar.res.status).toBe(409);
    expect(await prisma.vote.count()).toBe(1);
  });

  it.each([
    ["la submission no está publicada", { subStatus: "PENDING" as ModerationStatus }],
    ["el vídeo está retirado", { videoStatus: "REMOVED" as ModerationStatus }],
  ])("%s -> 404 idéntico al de una inexistente (sin oráculo)", async (_caso, opts) => {
    const oculta = await crearParticipacion(opts);
    const votante = await crearUsuario(prisma);

    const conOculta = await votar(votante, oculta);
    const conInexistente = await votar(votante, "no-existe-jamas");

    expect(conOculta.res.status).toBe(404);
    expect(conOculta.body).toEqual({ error: { code: "NOT_FOUND", message: MSG_NO_DISPONIBLE } });
    // Status, code Y texto: si cualquiera de los tres difiere, se puede enumerar lo oculto.
    expect(conInexistente.res.status).toBe(conOculta.res.status);
    expect(conInexistente.body).toEqual(conOculta.body);
  });

  it("ningún rechazo devuelve un código crudo como mensaje", async () => {
    // El servidor manda copy humano (`error.message`); los códigos son para la máquina.
    const casos = [
      (await votar(await crearUsuario(prisma), await crearParticipacion())).body,
      (await quitar(await crearUsuario(prisma), await crearParticipacion())).body,
      (await votar(await crearUsuario(prisma), "no-existe")).body,
    ];
    for (const b of casos) {
      const err = b.error as { code: string; message: string };
      expect(err.message).not.toBe(err.code);
      expect(err.message).not.toMatch(/^[A-Z_]+$/); // "RETO_CERRADO" y compañía, fuera
      expect(err.message.length).toBeGreaterThan(10);
    }
  });
});

describe("quitar el voto", () => {
  it("quita, baja el contador y borra la fila", async () => {
    const sub = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, sub);
    await votar(votante, sub);

    const { res, body } = await quitar(votante, sub);

    expect(res.status).toBe(200);
    expect(body).toEqual({ estado: "quitado" });
    expect(await prisma.vote.count()).toBe(0);
    expect((await votos(sub)).voteCount).toBe(0);
  });

  it("NO exige visto: una marca caducada no puede atrapar un voto puesto", async () => {
    const sub = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, sub);
    await votar(votante, sub);

    mocks.claves.clear(); // la marca caduca (TTL), el voto sigue puesto

    expect((await quitar(votante, sub)).res.status).toBe(200);
    expect(await prisma.vote.count()).toBe(0);
  });

  it("sin voto puesto -> 409 con copy humano", async () => {
    const sub = await crearParticipacion();
    const { res, body } = await quitar(await crearUsuario(prisma), sub);

    expect(res.status).toBe(409);
    expect(body).toEqual({ error: { code: "SIN_VOTO", message: MSG_VOTO_SIN_VOTO } });
  });

  it("un id de OTRA participación no borra el voto que tienes puesto", async () => {
    const subA = await crearParticipacion();
    const subB = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, subA);
    await votar(votante, subA);

    const { res } = await quitar(votante, subB);

    expect(res.status).toBe(409);
    expect(await prisma.vote.count()).toBe(1);
    expect((await votos(subA)).voteCount).toBe(1);
  });
});

describe("la ruta escribe ipHash (la 2A lo purgará a los 90 días)", () => {
  it("guarda el HMAC de la IP, nunca la IP", async () => {
    const sub = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, sub);

    await votar(votante, sub, { ip: IP });

    const voto = await prisma.vote.findFirstOrThrow({ select: { ipHash: true } });
    const esperado = clientIpKey(new Request(APP_URL, { headers: { "x-real-ip": IP } }), SECRET);
    expect(voto.ipHash).toBe(esperado);
    expect(voto.ipHash).not.toContain(IP); // la IP en claro NO aparece por ningún lado
    expect(voto.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("mover REFRESCA el ipHash: describe el voto que está vivo", async () => {
    const subA = await crearParticipacion();
    const subB = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, subA);
    await marcarVisto(votante, subB);
    await votar(votante, subA, { ip: IP });
    const antes = (await prisma.vote.findFirstOrThrow({ select: { ipHash: true } })).ipHash;

    await votar(votante, subB, { cuerpo: { permitirMover: true }, ip: "198.51.100.9" });

    const despues = (await prisma.vote.findFirstOrThrow({ select: { ipHash: true } })).ipHash;
    expect(despues).not.toBe(antes);
    expect(despues).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("el envoltorio de mutación sigue puesto (Origin -> sesión -> CSRF)", () => {
  it.each([
    ["sin Origin", { origin: "", csrf: true }, 403],
    ["con Origin ajeno", { origin: "http://malo.example", csrf: true }, 403],
    ["sin token CSRF", { origin: APP_URL, csrf: false }, 403],
  ])("%s -> %i y NO se vota", async (_caso, cfg, status) => {
    const sub = await crearParticipacion();
    const votante = await crearUsuario(prisma);
    await marcarVisto(votante, sub);

    const headers: Record<string, string> = { "x-real-ip": IP };
    if (cfg.origin) headers.origin = cfg.origin;
    if (cfg.csrf) headers["x-csrf-token"] = issueCsrfToken(SECRET, `sess-${votante}`);

    const { res } = await votar(votante, sub, { headers });

    expect(res.status).toBe(status);
    expect(await prisma.vote.count()).toBe(0);
  });

  it("sin sesión -> 401 y NO se vota", async () => {
    const sub = await crearParticipacion();
    mocks.getCurrentUser.mockResolvedValue(null);

    const res = await POST(peticion("POST", "quien-sea", sub), {
      params: Promise.resolve({ id: sub }),
    });

    expect(res.status).toBe(401);
    expect(await prisma.vote.count()).toBe(0);
  });
});
