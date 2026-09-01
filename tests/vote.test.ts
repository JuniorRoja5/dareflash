/**
 * VOTO — un voto por usuario y reto, movible y retirable mientras el reto siga abierto.
 *
 * Con dientes: cada bloque rompe un invariante concreto, no comprueba "que devuelva algo".
 *  - la regla "un voto por reto" la impone la BD: quitar el `@@unique([userId, challengeId])` pone
 *    en rojo el primer bloque.
 *  - el contador aguanta concurrencia: quitar el `FOR UPDATE` (MariaDB responde 1020) o volver a
 *    leer-sumar-escribir (se pierden votos) pone en rojo los dos tests de concurrencia.
 *  - mover no fabrica ni destruye votos (la suma total del reto no cambia).
 *  - reemplazar el vídeo borra los votos EN LA MISMA transacción del swap.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import { completarReemplazo } from "../src/server/services/participacion";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import { emitirVoto, moverVoto, quitarVoto } from "../src/server/services/votes";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
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
});

const DENTRO_DE_UN_DIA = () => new Date(Date.now() + 86_400_000);

/** Crea un reto. Por defecto PUBLISHED y abierto; los tests de ventana lo desplazan. */
async function crearReto(
  opts: { status?: string; startsAt?: Date; deadline?: Date } = {},
): Promise<string> {
  const admin = await crearUsuario(prisma);
  const c = await prisma.challenge.create({
    data: {
      title: "Reto test",
      slug: "reto",
      publicCode: generarPublicCode(),
      category: "fitness",
      status: opts.status ?? "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: opts.startsAt ?? new Date(Date.now() - 3600_000),
      deadline: opts.deadline ?? DENTRO_DE_UN_DIA(),
      createdById: admin,
    },
    select: { id: true },
  });
  return c.id;
}

/** Participación PUBLICADA (Submission + Video) de un autor nuevo. */
async function crearParticipacion(
  challengeId: string,
  opts: { subStatus?: string; videoStatus?: string } = {},
): Promise<{ submissionId: string; autorId: string; videoId: string }> {
  contador += 1;
  const autorId = await crearUsuario(prisma);
  const video = await prisma.video.create({
    data: {
      userId: autorId,
      bunnyVideoId: `bunny-${challengeId}-${contador}`,
      status: (opts.videoStatus ?? "PUBLISHED") as "PUBLISHED",
    },
    select: { id: true },
  });
  const sub = await prisma.submission.create({
    data: {
      challengeId,
      userId: autorId,
      videoId: video.id,
      status: (opts.subStatus ?? "PUBLISHED") as "PUBLISHED",
    },
    select: { id: true },
  });
  return { submissionId: sub.id, autorId, videoId: video.id };
}

const votosDe = (submissionId: string) =>
  prisma.submission
    .findUniqueOrThrow({ where: { id: submissionId }, select: { voteCount: true } })
    .then((s) => s.voteCount);

describe("un voto por usuario y reto (estructural, lo impone la BD)", () => {
  it("votar una SEGUNDA participación del mismo reto se rechaza con YA_VOTO_OTRA", async () => {
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const b = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);

    expect(await emitirVoto(prisma, { userId: votante, submissionId: a.submissionId })).toEqual({
      estado: "votado",
    });
    // El rechazo dice DÓNDE está el voto (`a`, el origen — no `b`, que es lo que se acaba de pedir):
    // la ruta ofrecerá moverlo y necesita poder nombrarlo sin volver a consultar la BD.
    expect(await emitirVoto(prisma, { userId: votante, submissionId: b.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "YA_VOTO_OTRA",
      votoActualEn: a.submissionId,
    });

    expect(await prisma.vote.count({ where: { userId: votante, challengeId: reto } })).toBe(1);
    expect(await votosDe(a.submissionId)).toBe(1);
    expect(await votosDe(b.submissionId)).toBe(0); // el rechazo NO tocó el contador
  });

  it("la BASE DE DATOS lo impide por su cuenta: dos INSERT directos violan el UNIQUE", async () => {
    // Este es el test que se cae si alguien quita el @@unique([userId, challengeId]): sin él, la
    // segunda inserción pasaría y "un voto por reto" dejaría de ser una garantía.
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const b = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);

    await prisma.vote.create({
      data: { userId: votante, submissionId: a.submissionId, challengeId: reto },
    });
    await expect(
      prisma.vote.create({
        data: { userId: votante, submissionId: b.submissionId, challengeId: reto },
      }),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002",
    );
  });

  it("votar en OTRO reto sí se puede (la regla es por reto, no global)", async () => {
    const reto1 = await crearReto();
    const reto2 = await crearReto();
    const p1 = await crearParticipacion(reto1);
    const p2 = await crearParticipacion(reto2);
    const votante = await crearUsuario(prisma);

    expect(await emitirVoto(prisma, { userId: votante, submissionId: p1.submissionId })).toEqual({
      estado: "votado",
    });
    expect(await emitirVoto(prisma, { userId: votante, submissionId: p2.submissionId })).toEqual({
      estado: "votado",
    });
    expect(await prisma.vote.count({ where: { userId: votante } })).toBe(2);
  });

  it("re-pulsar la MISMA participación es idempotente (`ya-votada`), no recuenta", async () => {
    const reto = await crearReto();
    const p = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);

    await emitirVoto(prisma, { userId: votante, submissionId: p.submissionId });
    expect(await emitirVoto(prisma, { userId: votante, submissionId: p.submissionId })).toEqual({
      estado: "ya-votada",
    });
    expect(await votosDe(p.submissionId)).toBe(1);
  });
});

describe("el contador aguanta concurrencia", () => {
  it("12 votantes simultáneos a la misma participación -> voteCount == 12", async () => {
    // Dos cosas hacen falta y las dos se prueban aquí. (1) `{ increment: 1 }`: leer-sumar-escribir
    // perdería votos, porque dos transacciones leerían el mismo valor y escribirían el mismo +1.
    // (2) BLOQUEAR la fila antes de leerla: sin el `SELECT ... FOR UPDATE`, MariaDB responde 1020
    // ("Record has changed since last read") en cuanto dos transacciones tocan la fila a la vez.
    // Quitar cualquiera de las dos pone este test en rojo (comprobado).
    const reto = await crearReto();
    const p = await crearParticipacion(reto);
    const votantes = await Promise.all(Array.from({ length: 12 }, () => crearUsuario(prisma)));

    await Promise.all(
      votantes.map((userId) => emitirVoto(prisma, { userId, submissionId: p.submissionId })),
    );

    expect(await prisma.vote.count({ where: { submissionId: p.submissionId } })).toBe(12);
    expect(await votosDe(p.submissionId)).toBe(12);
  });

  it("el MISMO usuario votando dos veces a la vez: una fila, un voto", async () => {
    const reto = await crearReto();
    const p = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);

    const [x, y] = await Promise.all([
      emitirVoto(prisma, { userId: votante, submissionId: p.submissionId }),
      emitirVoto(prisma, { userId: votante, submissionId: p.submissionId }),
    ]);

    // Una gana ("votado"); la otra ve el UNIQUE y responde idempotente.
    expect([x.estado, y.estado].sort()).toEqual(["votado", "ya-votada"]);
    expect(await prisma.vote.count({ where: { userId: votante } })).toBe(1);
    expect(await votosDe(p.submissionId)).toBe(1);
  });
});

describe("guardas: qué NO se puede votar", () => {
  it("tu propia participación (autovoto)", async () => {
    const reto = await crearReto();
    const p = await crearParticipacion(reto);
    expect(await emitirVoto(prisma, { userId: p.autorId, submissionId: p.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "AUTOVOTO",
    });
    expect(await votosDe(p.submissionId)).toBe(0);
  });

  it("un reto ya CERRADO (deadline pasado)", async () => {
    const reto = await crearReto({
      startsAt: new Date(Date.now() - 7200_000),
      deadline: new Date(Date.now() - 3600_000),
    });
    const p = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    expect(await emitirVoto(prisma, { userId: votante, submissionId: p.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "RETO_CERRADO",
    });
  });

  it("un reto que aún NO ha abierto (startsAt futuro)", async () => {
    const reto = await crearReto({
      startsAt: new Date(Date.now() + 3600_000),
      deadline: new Date(Date.now() + 7200_000),
    });
    const p = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    expect(await emitirVoto(prisma, { userId: votante, submissionId: p.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "RETO_CERRADO",
    });
  });

  it("un reto en BORRADOR (aunque la ventana cuadre)", async () => {
    const reto = await crearReto({ status: "DRAFT" });
    const p = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    expect(await emitirVoto(prisma, { userId: votante, submissionId: p.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "RETO_CERRADO",
    });
  });

  it.each([
    ["la submission no está publicada", { subStatus: "PENDING" }],
    ["la submission está retirada", { subStatus: "REMOVED" }],
    ["el vídeo no está publicado", { videoStatus: "PENDING" }],
    ["el vídeo está retirado", { videoStatus: "REMOVED" }],
  ])("una participación que no se ve: %s", async (_caso, opts) => {
    // Regla del más restrictivo, la misma que decide qué es visible: si no se ve, no se vota.
    const reto = await crearReto();
    const p = await crearParticipacion(reto, opts);
    const votante = await crearUsuario(prisma);
    expect(await emitirVoto(prisma, { userId: votante, submissionId: p.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "NO_PUBLICADA",
    });
  });

  it("una participación inexistente", async () => {
    const votante = await crearUsuario(prisma);
    expect(await emitirVoto(prisma, { userId: votante, submissionId: "no-existe" })).toEqual({
      estado: "rechazado",
      motivo: "SIN_PARTICIPACION",
    });
  });
});

describe("mover el voto", () => {
  it("baja el contador del origen y sube el del destino: el total del reto NO cambia", async () => {
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const b = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    await emitirVoto(prisma, { userId: votante, submissionId: a.submissionId });

    const total = async () => (await votosDe(a.submissionId)) + (await votosDe(b.submissionId));
    expect(await total()).toBe(1);

    expect(await moverVoto(prisma, { userId: votante, submissionId: b.submissionId })).toEqual({
      estado: "movido",
      desdeSubmissionId: a.submissionId,
    });

    expect(await votosDe(a.submissionId)).toBe(0);
    expect(await votosDe(b.submissionId)).toBe(1);
    expect(await total()).toBe(1); // ni se fabrica ni se destruye
    // Sigue siendo UNA fila de voto, la misma, apuntando ahora a otra participación.
    const votos = await prisma.vote.findMany({ where: { userId: votante, challengeId: reto } });
    expect(votos).toHaveLength(1);
    expect(votos[0]!.submissionId).toBe(b.submissionId);
  });

  it("mover al sitio donde ya está es un no-op (`sin-cambio`)", async () => {
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    await emitirVoto(prisma, { userId: votante, submissionId: a.submissionId });

    expect(await moverVoto(prisma, { userId: votante, submissionId: a.submissionId })).toEqual({
      estado: "sin-cambio",
    });
    expect(await votosDe(a.submissionId)).toBe(1); // no se recuenta
  });

  it("sin voto previo en ese reto no hay nada que mover", async () => {
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    expect(await moverVoto(prisma, { userId: votante, submissionId: a.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "SIN_VOTO",
    });
  });

  it("no se puede mover a una participación no votable (ni se pierde el voto de origen)", async () => {
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const b = await crearParticipacion(reto, { subStatus: "REMOVED" });
    const votante = await crearUsuario(prisma);
    await emitirVoto(prisma, { userId: votante, submissionId: a.submissionId });

    expect(await moverVoto(prisma, { userId: votante, submissionId: b.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "NO_PUBLICADA",
    });
    expect(await votosDe(a.submissionId)).toBe(1); // el voto sigue donde estaba
  });

  it("movimientos CRUZADOS y simultáneos no se traban entre sí", async () => {
    // Mover toca DOS filas de Submission, así que dos usuarios moviendo en sentidos opuestos entre
    // las mismas dos participaciones podrían interbloquearse si cada transacción tomase los bloqueos
    // en orden distinto. El servicio aplica los dos UPDATE en orden de `id`, siempre igual.
    // Es un test PROBABILÍSTICO (un deadlock no es determinista), pero con el orden fijo no puede
    // ocurrir, y sin él aparece.
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const b = await crearParticipacion(reto);
    const enA = await Promise.all(Array.from({ length: 6 }, () => crearUsuario(prisma)));
    const enB = await Promise.all(Array.from({ length: 6 }, () => crearUsuario(prisma)));
    for (const u of enA) await emitirVoto(prisma, { userId: u, submissionId: a.submissionId });
    for (const u of enB) await emitirVoto(prisma, { userId: u, submissionId: b.submissionId });

    // Todos a la vez, en sentidos opuestos.
    await Promise.all([
      ...enA.map((u) => moverVoto(prisma, { userId: u, submissionId: b.submissionId })),
      ...enB.map((u) => moverVoto(prisma, { userId: u, submissionId: a.submissionId })),
    ]);

    // Se cruzaron: los que estaban en A acabaron en B y viceversa. El total se conserva.
    expect((await votosDe(a.submissionId)) + (await votosDe(b.submissionId))).toBe(12);
    expect(await votosDe(a.submissionId)).toBe(6);
    expect(await votosDe(b.submissionId)).toBe(6);
  });
});

describe("quitar el voto", () => {
  it("borra la fila, descuenta el contador y deja volver a votar", async () => {
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const b = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    await emitirVoto(prisma, { userId: votante, submissionId: a.submissionId });

    expect(await quitarVoto(prisma, { userId: votante, submissionId: a.submissionId })).toEqual({
      estado: "quitado",
    });
    expect(await prisma.vote.count({ where: { userId: votante, challengeId: reto } })).toBe(0);
    expect(await votosDe(a.submissionId)).toBe(0);

    // Y el reto vuelve a admitir su voto, ahora en otra participación.
    expect(await emitirVoto(prisma, { userId: votante, submissionId: b.submissionId })).toEqual({
      estado: "votado",
    });
  });

  it("con el submissionId EQUIVOCADO no borra nada", async () => {
    // Si no se exigiera que el voto esté en ESA participación, mandar cualquier id borraría el voto
    // que el usuario tenga puesto donde sea.
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const b = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    await emitirVoto(prisma, { userId: votante, submissionId: a.submissionId });

    expect(await quitarVoto(prisma, { userId: votante, submissionId: b.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "SIN_VOTO",
    });
    expect(await votosDe(a.submissionId)).toBe(1); // intacto
    expect(await prisma.vote.count({ where: { userId: votante } })).toBe(1);
  });

  it("con el reto ya cerrado NO se puede retirar (los votos son el resultado)", async () => {
    const reto = await crearReto();
    const a = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    await emitirVoto(prisma, { userId: votante, submissionId: a.submissionId });

    // Se cierra el reto por debajo, como haría el paso del tiempo.
    await prisma.challenge.update({
      where: { id: reto },
      data: { deadline: new Date(Date.now() - 1000) },
    });

    expect(await quitarVoto(prisma, { userId: votante, submissionId: a.submissionId })).toEqual({
      estado: "rechazado",
      motivo: "RETO_CERRADO",
    });
    expect(await votosDe(a.submissionId)).toBe(1);
  });
});

describe("reemplazar el vídeo resetea los votos", () => {
  it("el swap borra los votos y pone el contador a 0, en su misma transacción", async () => {
    const reto = await crearReto();
    const p = await crearParticipacion(reto);
    const votantes = await Promise.all(Array.from({ length: 3 }, () => crearUsuario(prisma)));
    for (const u of votantes) await emitirVoto(prisma, { userId: u, submissionId: p.submissionId });
    expect(await votosDe(p.submissionId)).toBe(3);

    // Vídeo de reemplazo del MISMO autor, ya publicado y apuntando a su participación.
    const nuevo = await prisma.video.create({
      data: {
        userId: p.autorId,
        bunnyVideoId: `bunny-reemplazo-${p.submissionId}`,
        status: "PUBLISHED",
        reemplazaSubmissionId: p.submissionId,
      },
      select: { id: true },
    });

    expect(await completarReemplazo(prisma, nuevo.id)).toEqual({ hecho: true });

    // Los votos eran del vídeo que la comunidad vio: no se heredan.
    expect(await prisma.vote.count({ where: { submissionId: p.submissionId } })).toBe(0);
    expect(await votosDe(p.submissionId)).toBe(0);
    // Y la participación quedó repuntada al vídeo nuevo (el swap se completó de verdad).
    const sub = await prisma.submission.findUniqueOrThrow({
      where: { id: p.submissionId },
      select: { videoId: true },
    });
    expect(sub.videoId).toBe(nuevo.id);
  });

  it("tras el reemplazo, quien había votado puede volver a votar", async () => {
    const reto = await crearReto();
    const p = await crearParticipacion(reto);
    const votante = await crearUsuario(prisma);
    await emitirVoto(prisma, { userId: votante, submissionId: p.submissionId });

    const nuevo = await prisma.video.create({
      data: {
        userId: p.autorId,
        bunnyVideoId: `bunny-reemplazo2-${p.submissionId}`,
        status: "PUBLISHED",
        reemplazaSubmissionId: p.submissionId,
      },
      select: { id: true },
    });
    await completarReemplazo(prisma, nuevo.id);

    expect(await emitirVoto(prisma, { userId: votante, submissionId: p.submissionId })).toEqual({
      estado: "votado",
    });
    expect(await votosDe(p.submissionId)).toBe(1);
  });
});

/**
 * ESTRUCTURAL: la política configurable de votos por reto se retiró entera. Si vuelve a aparecer
 * `maxVotesPerUser` en alguna parte, es que alguien reintrodujo un ajuste que el código NO aplica —
 * un admin creyendo que configura algo que el sistema ignora, que es peor que no tenerlo.
 */
describe("la política configurable de votos ya no existe", () => {
  it("no queda ni un uso de maxVotesPerUser en CÓDIGO (src, tests ni el esquema)", () => {
    const raiz = process.cwd();
    const salida = execSync(
      'git grep -il "maxVotesPerUser" -- src tests prisma/schema.prisma || true',
      { cwd: raiz, encoding: "utf8" },
    );
    // `src/generated/` es el cliente de Prisma (gitignoreado): git grep no lo ve, no hace falta excluirlo.
    const enCodigo = salida
      .split("\n")
      .filter(Boolean)
      // Este mismo fichero nombra la columna para poder buscarla; no es un uso.
      .filter((f) => f !== "tests/vote.test.ts")
      .filter((f) => {
        // El esquema la MENCIONA en el comentario que explica por qué se retiró: esa nota es
        // justamente lo que evita que alguien la reintroduzca sin enterarse. Solo cuenta el código.
        const sinComentarios = readFileSync(join(raiz, f), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*(\/\/|\/\/\/).*$/gm, "");
        return sinComentarios.includes("maxVotesPerUser");
      });
    expect(enCodigo).toEqual([]);
  });
});
