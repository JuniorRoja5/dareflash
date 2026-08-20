/**
 * Retos públicos (Tramo 1). Con dientes:
 *  - Listado ACTIVOS: solo PUBLISHED con cierre FUTURO, orden por cierre ASC. Un DRAFT o un cerrado NO
 *    aparecen; el que cierra antes va primero (si se quita el filtro deadline, un cerrado se cuela).
 *  - Detalle: resuelve por publicCode; slug incorrecto -> redirect canónico; inexistente/DRAFT -> 404.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  extraerPublicCode,
  listarRetosCerrados,
  listarRetosPublicos,
  resolverRetoDetalle,
} from "../src/server/services/retos-publico";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "adminretos" });
});

async function crearReto(o: {
  publicCode: string;
  slug?: string;
  title?: string;
  status?: string;
  deadline: Date;
}) {
  return prisma.challenge.create({
    data: {
      title: o.title ?? "Reto",
      slug: o.slug ?? "reto",
      publicCode: o.publicCode,
      category: "fitness",
      status: o.status ?? "PUBLISHED",
      prizeCurrency: "USD",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      deadline: o.deadline,
      createdById: admin,
    },
    select: { id: true },
  });
}

const AHORA = new Date("2026-08-20T00:00:00Z");
const FUTURO_CERCA = new Date("2026-08-21T00:00:00Z");
const FUTURO_LEJOS = new Date("2026-09-01T00:00:00Z");
const PASADO = new Date("2026-08-10T00:00:00Z");

describe("listarRetosPublicos (activos)", () => {
  it("solo PUBLISHED con cierre futuro, orden por cierre ASC (el que cierra antes, primero)", async () => {
    await crearReto({ publicCode: "codelej0", title: "Lejos", deadline: FUTURO_LEJOS });
    await crearReto({ publicCode: "codecer0", title: "Cerca", deadline: FUTURO_CERCA });
    await crearReto({
      publicCode: "codedraf",
      title: "Borrador",
      status: "DRAFT",
      deadline: FUTURO_LEJOS,
    }); // DRAFT
    await crearReto({ publicCode: "codepas0", title: "Pasado", deadline: PASADO }); // cerrado por deadline

    const activos = await listarRetosPublicos(prisma, AHORA);
    const titulos = activos.map((r) => r.titulo);
    expect(titulos).toEqual(["Cerca", "Lejos"]); // ASC por cierre; DRAFT y pasado FUERA
    expect(titulos).not.toContain("Borrador");
    expect(titulos).not.toContain("Pasado");
  });
});

describe("listarRetosCerrados", () => {
  it("incluye los de cierre pasado (aunque sigan PUBLISHED); no los activos", async () => {
    await crearReto({ publicCode: "codeact0", title: "Activo", deadline: FUTURO_LEJOS });
    await crearReto({ publicCode: "codepas1", title: "Pasado", deadline: PASADO });

    const cerrados = await listarRetosCerrados(prisma, AHORA);
    const titulos = cerrados.map((r) => r.titulo);
    expect(titulos).toContain("Pasado");
    expect(titulos).not.toContain("Activo");
  });
});

describe("resolverRetoDetalle", () => {
  it("code + slug correcto -> ok", async () => {
    await crearReto({ publicCode: "abcd2345", slug: "mi-reto", deadline: FUTURO_LEJOS });
    const r = await resolverRetoDetalle(prisma, "abcd2345-mi-reto");
    expect(r.tipo).toBe("ok");
    if (r.tipo === "ok") expect(r.reto.publicCode).toBe("abcd2345");
  });

  it("DIENTES: slug incorrecto -> redirect al canónico", async () => {
    await crearReto({ publicCode: "abcd2345", slug: "mi-reto", deadline: FUTURO_LEJOS });
    const r = await resolverRetoDetalle(prisma, "abcd2345-otro-slug");
    expect(r).toEqual({ tipo: "redirect", a: "/retos/abcd2345-mi-reto" });
    // sin slug también redirige al canónico
    expect(await resolverRetoDetalle(prisma, "abcd2345")).toEqual({
      tipo: "redirect",
      a: "/retos/abcd2345-mi-reto",
    });
  });

  it("publicCode inexistente -> noEncontrado; DRAFT no es público -> noEncontrado", async () => {
    await crearReto({ publicCode: "draftcod", slug: "x", status: "DRAFT", deadline: FUTURO_LEJOS });
    expect((await resolverRetoDetalle(prisma, "noexiste-x")).tipo).toBe("noEncontrado");
    expect((await resolverRetoDetalle(prisma, "draftcod-x")).tipo).toBe("noEncontrado");
  });
});

describe("extraerPublicCode", () => {
  it("toma lo anterior al primer guion (el code no lleva guion; el slug sí)", () => {
    expect(extraerPublicCode("abcd2345-mi-reto-largo")).toBe("abcd2345");
    expect(extraerPublicCode("abcd2345")).toBe("abcd2345");
  });
});
