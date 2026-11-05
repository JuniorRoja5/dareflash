/**
 * EL CATÁLOGO DE CIUDADES, EL AUTOCOMPLETADO Y EL RADIO, contra la base de datos (Fase 9 · P5).
 *
 * El catálogo es el de la migración (GeoNames cities15000), el mismo que tendrá producción: los tests no
 * lo siembran, lo leen. Por eso `Ciudad` no se borra entre tests (ver `aislamiento-tablas`).
 *
 * DIENTES DEL PLAN:
 *  - buscar «Medellin» SIN ACENTO encuentra la ciudad, y en otra caja también. Lo hace la collation
 *    `utf8mb4_unicode_ci`, un default INVISIBLE: si alguien la cambia, esto se pone rojo en vez de
 *    volverse tonto el buscador.
 *  - Valencia–Castellón dentro del radio de 100 km; Valencia–Alicante fuera.
 *
 * Para romperlo a propósito: cambiar la collation de `Ciudad` a `utf8mb4_bin` en la BD de test (rojo el
 * de Medellín); quitar el `<= km` de `ciudadesEnRadio` (rojo Alicante); ordenar por nombre y no por
 * población (rojo Santiago).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { buscarCiudades } from "../src/server/services/buscar";
import { ciudadesEnRadio } from "../src/server/geo/ubicacion";

import { createTestPrisma } from "./helpers/db";

let prisma: PrismaClient;
beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** geonameId de las ciudades de los casos (estables entre versiones de GeoNames). */
const MEDELLIN = 3674962;
const VALENCIA = 2509954;
const CASTELLON = 2519752;
const ALICANTE = 2521978;

describe("el catálogo sembrado", () => {
  it("está entero (decenas de miles de ciudades) y con el estado resuelto al sembrar", async () => {
    expect(await prisma.ciudad.count()).toBeGreaterThan(30_000);
    expect(await prisma.ciudad.findUnique({ where: { id: MEDELLIN } })).toMatchObject({
      nombre: "Medellín",
      paisIso: "CO",
      estadoCodigo: "CO.02",
      estadoNombre: "Antioquia",
    });
  });

  it("sin barrios: «Castellana» (un barrio de Madrid en GeoNames) no está", async () => {
    expect(await prisma.ciudad.count({ where: { nombre: "Castellana", paisIso: "ES" } })).toBe(0);
  });
});

describe("el autocompletado", () => {
  it("«Medellin» sin acento encuentra Medellín, y en otra caja también", async () => {
    for (const q of ["Medellin", "medellin", "MEDELLIN", "medellín", "Mede"]) {
      const r = await buscarCiudades(prisma, q);
      expect(r.items[0]?.id, q).toBe(MEDELLIN);
    }
  });

  it("dice ciudad, estado y país, para desambiguar", async () => {
    const [m] = (await buscarCiudades(prisma, "medellin")).items;
    expect(m?.etiqueta).toBe("Medellín, Antioquia, Colombia");
  });

  it("por PREFIJO, no por subcadena: «dellín» no encuentra Medellín", async () => {
    const r = await buscarCiudades(prisma, "dellín");
    expect(r.items.map((c) => c.id)).not.toContain(MEDELLIN);
  });

  it("los «Santiago», por población: el de Chile primero", async () => {
    const r = await buscarCiudades(prisma, "Santiago");
    expect(r.items[0]?.paisIso).toBe("CL");
    const poblaciones = await prisma.ciudad.findMany({
      where: { id: { in: r.items.map((c) => c.id) } },
      select: { id: true, poblacion: true },
    });
    const orden = r.items.map((c) => poblaciones.find((p) => p.id === c.id)!.poblacion);
    expect(orden).toEqual([...orden].sort((a, b) => b - a));
  });

  it("acota por país cuando se le pide", async () => {
    const r = await buscarCiudades(prisma, "Santiago", { paisIso: "ES" });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((c) => c.paisIso === "ES")).toBe(true);
  });

  it("los comodines de LIKE se buscan como texto, no como comodín", async () => {
    expect((await buscarCiudades(prisma, "%%")).items).toEqual([]);
    expect((await buscarCiudades(prisma, "__")).items).toEqual([]);
  });

  it("la collation de la tabla sigue siendo la que ignora acentos y caja", async () => {
    const [fila] = await prisma.$queryRaw<{ c: string }[]>`
      SELECT TABLE_COLLATION AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Ciudad'`;
    expect(fila?.c).toBe("utf8mb4_unicode_ci");
  });
});

describe("el radio de 100 km", () => {
  it("Valencia: Castellón dentro, Alicante fuera, y la propia Valencia incluida", async () => {
    const ids = await ciudadesEnRadio(prisma, VALENCIA);
    expect(ids).toContain(VALENCIA);
    expect(ids).toContain(CASTELLON);
    expect(ids).not.toContain(ALICANTE);
  });

  it("lo que cae en la ESQUINA de la caja pero a más de 100 km, fuera: la haversine sí se aplica", async () => {
    // Alicante no basta para probar esto: está fuera ya por latitud, así que la caja sola la
    // descarta y un `ciudadesEnRadio` sin el filtro de distancia seguía en verde (diente que no
    // mordía, visto al romperlo). Teruel (≈115 km) y Villena (≈102 km) están DENTRO de la caja y
    // fuera del círculo: solo la haversine las quita.
    const ids = await ciudadesEnRadio(prisma, VALENCIA);
    expect(ids).not.toContain(3108126); // Teruel
    expect(ids).not.toContain(2509463); // Villena
  });

  it("una ciudad que no existe no tiene radio (y no lanza)", async () => {
    expect(await ciudadesEnRadio(prisma, -1)).toEqual([]);
  });
});

describe("el catálogo es de solo lectura para la app", () => {
  it("ningún fichero de src/ escribe en `Ciudad` (por eso no se limpia entre tests)", () => {
    const fuentes = (dir: string): string[] =>
      readdirSync(dir).flatMap((x) => {
        const p = path.join(dir, x);
        if (statSync(p).isDirectory()) return x === "generated" ? [] : fuentes(p);
        return /\.(ts|tsx)$/.test(x) ? [p] : [];
      });
    const escriben = fuentes(path.resolve(__dirname, "..", "src")).filter((f) =>
      /\.ciudad\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|(INSERT INTO|UPDATE|DELETE FROM)\s+`?Ciudad`?/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(escriben).toEqual([]);
  });
});
