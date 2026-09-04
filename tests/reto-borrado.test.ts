/**
 * BORRAR UN RETO (ADMIN): dos tiempos, y sin destruir contenido de nadie.
 *
 * El panel no tenía forma de borrar un reto, y el estado que pintaba era el de la columna `status`:
 * un reto cuyo plazo había vencido seguía diciendo "Publicado".
 *
 * DECISIÓN DE PRODUCTO, explícita: borrar un reto NUNCA destruye los vídeos de sus participantes. La
 * FK de Submission es `onDelete: Restrict`, así que un borrado físico exigiría destruir antes el
 * contenido de terceros — que es exactamente el daño del que la gracia de 7 días quiere proteger. Los
 * vídeos siguen siendo de sus autores y siguen en su perfil; lo que desaparece es el RETO.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RETO_GRACIA_BORRADO_MS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  borrarReto,
  consumarBorradosVencidos,
  estadoRetoAdmin,
  listarRetosAdmin,
  restaurarReto,
} from "../src/server/services/retos-admin";
import { generarPublicCode } from "../src/server/services/reto-codigo";
import { listarRetosPublicos, retoPublicoPorCode } from "../src/server/services/retos-publico";

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

async function crearReto(opts: { startsAt?: Date; deadline?: Date; status?: string } = {}) {
  n += 1;
  return prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: generarPublicCode(),
      category: "fitness",
      status: opts.status ?? "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: opts.startsAt ?? new Date(Date.now() - 3_600_000),
      deadline: opts.deadline ?? new Date(Date.now() + 86_400_000),
      createdById: adminId,
    },
    select: { id: true, publicCode: true },
  });
}

const AHORA = new Date("2026-06-01T12:00:00Z");
const base = { status: "PUBLISHED", eliminacionProgramadaEn: null, deletedAt: null };

describe("estado REAL, no el de la columna", () => {
  it("un reto PUBLISHED con el plazo vencido está CERRADO", () => {
    // Esto es lo que el admin veía mal: la lista decía "Publicado" para un reto ya vencido.
    const reto = {
      ...base,
      startsAt: new Date("2026-05-01T00:00:00Z"),
      deadline: new Date("2026-05-30T00:00:00Z"),
    };
    expect(estadoRetoAdmin(reto, AHORA)).toBe("cerrado");
  });

  it("distingue PROGRAMADO (publicado pero aún sin abrir) de ABIERTO", () => {
    const futuro = {
      ...base,
      startsAt: new Date("2026-07-01T00:00:00Z"),
      deadline: new Date("2026-08-01T00:00:00Z"),
    };
    const vivo = {
      ...base,
      startsAt: new Date("2026-05-01T00:00:00Z"),
      deadline: new Date("2026-07-01T00:00:00Z"),
    };
    // Antes eran indistinguibles, y son cosas distintas para quien administra.
    expect(estadoRetoAdmin(futuro, AHORA)).toBe("programado");
    expect(estadoRetoAdmin(vivo, AHORA)).toBe("abierto");
  });

  it("el borrado manda sobre todo lo demás", () => {
    const vivo = {
      ...base,
      startsAt: new Date("2026-05-01T00:00:00Z"),
      deadline: new Date("2026-07-01T00:00:00Z"),
    };
    // Un reto en camino de desaparecer no es "abierto", por muy dentro de plazo que esté.
    expect(estadoRetoAdmin({ ...vivo, eliminacionProgramadaEn: AHORA }, AHORA)).toBe("en-borrado");
    expect(estadoRetoAdmin({ ...vivo, deletedAt: AHORA }, AHORA)).toBe("borrado");
  });

  it("un borrador es un borrador", () => {
    const draft = { ...base, status: "DRAFT", startsAt: AHORA, deadline: AHORA };
    expect(estadoRetoAdmin(draft, AHORA)).toBe("borrador");
  });
});

describe("borrado con gracia de 7 días", () => {
  it("programa el borrado y lo saca del PÚBLICO ya", async () => {
    const r = await crearReto();
    expect((await listarRetosPublicos(prisma, new Date())).length).toBe(1);

    const res = await borrarReto(prisma, r.id);

    expect(res.borrado).toBe(true);
    expect(res.eliminaEn).toBeInstanceOf(Date);
    // La gracia es para que el ADMIN se arrepienta, no para seguir enseñándolo.
    expect(await listarRetosPublicos(prisma, new Date())).toEqual([]);
    expect(await retoPublicoPorCode(prisma, r.publicCode)).toBeNull();
  });

  it("pero SIGUE en el panel, con su cuenta atrás", async () => {
    const r = await crearReto();
    await borrarReto(prisma, r.id);

    const filas = await listarRetosAdmin(prisma);
    expect(filas[0]?.id).toBe(r.id);
    expect(filas[0]?.eliminaEnMs).not.toBeNull();
    expect(filas[0]?.borradoMs).toBeNull();
  });

  it("se puede RESTAURAR mientras corre la gracia", async () => {
    const r = await crearReto();
    await borrarReto(prisma, r.id);

    expect(await restaurarReto(prisma, r.id)).toEqual({ restaurado: true });
    expect((await listarRetosPublicos(prisma, new Date())).length).toBe(1);
  });

  it("FORZAR lo borra ya, sin gracia y sin vuelta atrás", async () => {
    const r = await crearReto();
    const res = await borrarReto(prisma, r.id, { forzar: true });

    expect(res).toEqual({ borrado: true, eliminaEn: null });
    expect(await listarRetosPublicos(prisma, new Date())).toEqual([]);
    // El admin eligió saltarse el plazo: ya tuvo su decisión.
    expect(await restaurarReto(prisma, r.id)).toEqual({ restaurado: false });
  });

  it("borrar dos veces no falla ni reinicia la cuenta atrás", async () => {
    const r = await crearReto();
    await borrarReto(prisma, r.id, { forzar: true });
    expect(await borrarReto(prisma, r.id)).toEqual({ borrado: false, eliminaEn: null });
  });

  it("la gracia dura lo que dice la constante", async () => {
    const r = await crearReto();
    const antes = Date.now();
    const { eliminaEn } = await borrarReto(prisma, r.id);
    const margen = (eliminaEn?.getTime() ?? 0) - antes;
    expect(margen).toBeGreaterThan(RETO_GRACIA_BORRADO_MS - 5_000);
    expect(margen).toBeLessThan(RETO_GRACIA_BORRADO_MS + 5_000);
  });
});

describe("el barrido consuma los borrados vencidos", () => {
  it("uno EN GRACIA no se toca; uno VENCIDO se consuma", async () => {
    const enGracia = await crearReto();
    const vencido = await crearReto();
    await borrarReto(prisma, enGracia.id);
    await borrarReto(prisma, vencido.id);
    await prisma.challenge.update({
      where: { id: vencido.id },
      data: { eliminacionProgramadaEn: new Date(Date.now() - 1000) },
    });

    expect(await consumarBorradosVencidos(prisma)).toEqual({ borrados: 1 });

    const filas = await listarRetosAdmin(prisma);
    expect(filas.find((f) => f.id === vencido.id)?.borradoMs).not.toBeNull();
    expect(filas.find((f) => f.id === enGracia.id)?.borradoMs).toBeNull();
  });

  it("es idempotente: pasar dos veces no vuelve a borrar", async () => {
    const r = await crearReto();
    await borrarReto(prisma, r.id);
    await prisma.challenge.update({
      where: { id: r.id },
      data: { eliminacionProgramadaEn: new Date(Date.now() - 1000) },
    });

    expect(await consumarBorradosVencidos(prisma)).toEqual({ borrados: 1 });
    expect(await consumarBorradosVencidos(prisma)).toEqual({ borrados: 0 });
  });
});

describe("borrar un reto NO destruye los vídeos de sus participantes", () => {
  it("las participaciones y sus vídeos siguen intactos", async () => {
    const r = await crearReto();
    const autor = await crearUsuario(prisma);
    const video = await prisma.video.create({
      data: { userId: autor, bunnyVideoId: "g1", status: "PUBLISHED" },
      select: { id: true },
    });
    const sub = await prisma.submission.create({
      data: { challengeId: r.id, userId: autor, videoId: video.id, status: "PUBLISHED" },
      select: { id: true },
    });

    await borrarReto(prisma, r.id, { forzar: true });

    // Lo que desaparece es el RETO. El vídeo es de su autor y sigue en su perfil.
    expect(await prisma.video.count({ where: { id: video.id } })).toBe(1);
    expect(await prisma.submission.count({ where: { id: sub.id } })).toBe(1);
    const v = await prisma.video.findUniqueOrThrow({
      where: { id: video.id },
      select: { status: true },
    });
    expect(v.status).toBe("PUBLISHED");
  });
});

/**
 * EL COPY NO PROMETE LO QUE EL SISTEMA NO HACE.
 *
 * Al vencer la gracia NO se destruye nada: el reto queda oculto y deja de poder restaurarse. Decir
 * "se borrará" prometía una destrucción que no ocurre — y prometer una protección (o un efecto)
 * inexistente es peor que no prometer nada.
 */
describe("la UI dice lo que de verdad pasa", () => {
  const leer = (): string =>
    readFileSync(path.resolve(__dirname, "..", "src/app/panel/lista-retos.tsx"), "utf8")
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("ningún texto visible promete un borrado que no ocurre", () => {
    const src = leer();
    // Se habla de OCULTAR, que es lo que el sistema hace de verdad.
    expect(src).toContain("Ocultar, 7 días para deshacer");
    expect(src).toContain("Ocultar sin vuelta atrás");
    expect(src).not.toContain("Se borrará");
    expect(src).not.toContain("Borrar ya");
  });

  it("dice explícitamente que los vídeos de los participantes se conservan", () => {
    // Es la duda que tiene cualquier admin antes de pulsar, y la respuesta estaba solo en el código.
    expect(leer()).toContain("Los vídeos de los participantes se conservan");
  });
});
