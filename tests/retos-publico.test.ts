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
    const titulos = cerrados.items.map((r) => r.titulo);
    expect(titulos).toContain("Pasado");
    expect(titulos).not.toContain("Activo");
  });

  /**
   * EL HISTÓRICO DE CERRADOS CRECE PARA SIEMPRE: un reto cerrado no vuelve a salir de aquí. Antes
   * se servían los 100 más recientes y a partir de ahí el histórico no existía para el público —y
   * nada lo decía—. Lo de abajo fija que ahora se recorre entero, por keyset, y que recorrerlo
   * mientras la lista se mueve no se salta ni duplica nada.
   */
  it("se recorre ENTERO por páginas: cada reto una vez, ninguno dos", async () => {
    for (let i = 0; i < 5; i += 1) {
      await crearReto({
        publicCode: `cerrado${i}`,
        title: `C${i}`,
        // Cierres distintos: el más reciente primero (orden DESC por deadline).
        deadline: new Date(Date.UTC(2026, 7, 1 + i)),
      });
    }

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let vuelta = 0; vuelta < 10; vuelta += 1) {
      const p: Awaited<ReturnType<typeof listarRetosCerrados>> = await listarRetosCerrados(
        prisma,
        AHORA,
        { cursor, limite: 2 },
      );
      vistos.push(...p.items.map((r) => r.titulo));
      cursor = p.nextCursor;
      if (!cursor) break;
    }

    expect(vistos).toEqual(["C4", "C3", "C2", "C1", "C0"]);
    expect(new Set(vistos).size).toBe(5);
  });

  it("y RETIRAR un reto entre dos páginas no descoloca la siguiente", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await crearReto({
        publicCode: `movido-${i}`,
        title: `M${i}`,
        deadline: new Date(Date.UTC(2026, 7, 1 + i)),
      });
      ids.push(r.id);
    }

    const p1 = await listarRetosCerrados(prisma, AHORA, { limite: 2 });
    expect(p1.items.map((r) => r.titulo)).toEqual(["M4", "M3"]);

    // El admin borra el reto del CURSOR justo en medio del recorrido. Con un cursor anclado a esa
    // fila, la página siguiente no sabría dónde empezar; con la tupla de orden, sí.
    await prisma.challenge.update({
      where: { id: ids[3]! },
      data: { deletedAt: new Date() },
    });

    const p2 = await listarRetosCerrados(prisma, AHORA, { cursor: p1.nextCursor, limite: 2 });
    expect(
      p2.items.map((r) => r.titulo),
      "la página 2 se ha descolocado",
    ).toEqual(["M2", "M1"]);
  });

  it("dos retos con el MISMO cierre no se saltan ni se duplican", async () => {
    // Dos cierres al milisegundo es el caso normal, no el raro: el barrido de cierre procesa un
    // lote entero con el mismo `deadline` cuando el admin los creó a la vez.
    const mismo = new Date(Date.UTC(2026, 7, 5));
    for (let i = 0; i < 3; i += 1) {
      await crearReto({ publicCode: `empate-${i}`, title: `E${i}`, deadline: mismo });
    }

    const p1 = await listarRetosCerrados(prisma, AHORA, { limite: 2 });
    const p2 = await listarRetosCerrados(prisma, AHORA, { cursor: p1.nextCursor, limite: 2 });
    const vistos = [...p1.items, ...p2.items].map((r) => r.publicCode);

    expect(vistos, "un empate de cierre se ha saltado o duplicado un reto").toHaveLength(3);
    expect(new Set(vistos).size).toBe(3);
    expect(p2.nextCursor).toBeNull();
  });

  it("la página 2 sigue escondiendo los BORRADOS (el keyset no se come el filtro)", async () => {
    // El `where` de cerrados ya tiene su propio `OR` (CLOSED o vencido). Fundirle el del keyset
    // con `...` dejaría solo uno, y entonces la página 2 serviría retos borrados o abiertos.
    for (let i = 0; i < 4; i += 1) {
      await crearReto({
        publicCode: `filtro-${i}`,
        title: `F${i}`,
        deadline: new Date(Date.UTC(2026, 7, 1 + i)),
      });
    }
    // Uno BORRADO justo detrás del corte de la primera página.
    const borrado = await crearReto({
      publicCode: "borrado0",
      title: "Borrado",
      deadline: new Date(Date.UTC(2026, 7, 2, 12)),
    });
    await prisma.challenge.update({ where: { id: borrado.id }, data: { deletedAt: new Date() } });
    // Y uno ACTIVO, que tampoco puede colarse por la rama del `OR`.
    await crearReto({ publicCode: "activo00", title: "Activo", deadline: FUTURO_LEJOS });

    const p1 = await listarRetosCerrados(prisma, AHORA, { limite: 2 });
    const p2 = await listarRetosCerrados(prisma, AHORA, { cursor: p1.nextCursor, limite: 2 });
    const titulos = [...p1.items, ...p2.items].map((r) => r.titulo);

    expect(titulos, "la página 2 ha dejado de filtrar").toEqual(["F3", "F2", "F1", "F0"]);
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
