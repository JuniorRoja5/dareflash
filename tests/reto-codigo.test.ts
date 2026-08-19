/**
 * publicCode de retos (M2). Con dientes:
 *  - generarPublicCode: formato (base32, longitud 8) y variedad.
 *  - Unicidad contra la BD: dos retos -> codes distintos; forzar un duplicado -> salta la constraint y
 *    `esViolacionUnicaDePublicCode` la reconoce (sondeando la forma REAL del adapter MariaDB).
 *  - Reintento: ante colisión, REGENERA y reintenta (acotado); agotados los intentos, propaga.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CODIGO_BASE32_ALFABETO } from "../src/lib/codigo-base32";
import { Prisma } from "../src/generated/prisma/client";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  crearRetoConPublicCode,
  esViolacionUnicaDePublicCode,
  generarPublicCode,
  PUBLIC_CODE_LEN,
  PUBLIC_CODE_MAX_INTENTOS,
} from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

/** P2002 con la forma del driver adapter de MariaDB (nombre de índice en constraint.index). */
function p2002Adapter(index: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });
}

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

/** Crea un reto con un publicCode dado (para forzar colisiones controladas). */
function crearReto(creador: string, publicCode: string) {
  return prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode,
      category: "fitness",
      prizeCurrency: "USD",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      deadline: new Date("2026-12-01T00:00:00Z"),
      createdById: creador,
    },
    select: { id: true, publicCode: true },
  });
}

describe("generarPublicCode", () => {
  it("produce un code base32 de longitud 8 y variado (1000 muestras)", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const code = generarPublicCode();
      expect(code).toHaveLength(PUBLIC_CODE_LEN);
      for (const c of code) expect(CODIGO_BASE32_ALFABETO).toContain(c);
      vistos.add(code);
    }
    expect(vistos.size).toBeGreaterThan(990);
  });
});

describe("esViolacionUnicaDePublicCode", () => {
  it("reconoce el P2002 de publicCode; NO el de otra constraint ni otros errores", () => {
    expect(esViolacionUnicaDePublicCode(p2002Adapter("Challenge_publicCode_key"))).toBe(true);
    expect(esViolacionUnicaDePublicCode(p2002Adapter("User_email_key"))).toBe(false);
    expect(esViolacionUnicaDePublicCode(new Error("otro"))).toBe(false);
  });
});

describe("unicidad y reintento contra la BD", () => {
  it("dos retos -> publicCodes DISTINTOS", async () => {
    const u = await crearUsuario(prisma);
    const a = await crearRetoConPublicCode((code) => crearReto(u, code));
    const b = await crearRetoConPublicCode((code) => crearReto(u, code));
    expect(a.publicCode).not.toBe(b.publicCode);
  });

  it("DIENTES: un publicCode DUPLICADO salta la constraint y se reconoce", async () => {
    const u = await crearUsuario(prisma);
    await crearReto(u, "dupcode1");
    let capturado: unknown;
    try {
      await crearReto(u, "dupcode1"); // mismo code -> P2002
    } catch (e) {
      capturado = e;
    }
    expect(capturado).toBeDefined();
    expect(esViolacionUnicaDePublicCode(capturado)).toBe(true);
  });

  it("colisión -> REGENERA y reintenta (BD real): se queda con el segundo, libre", async () => {
    const u = await crearUsuario(prisma);
    await crearReto(u, "tomado01"); // ocupa el code
    const secuencia = ["tomado01", "libre002"]; // el 1º choca, el 2º libre
    let i = 0;
    const creado = await crearRetoConPublicCode((code) => crearReto(u, code), {
      generar: () => secuencia[i++]!,
    });
    expect(creado.publicCode).toBe("libre002");
    expect(i).toBe(2); // regeneró exactamente una vez
  });

  it("colisión PERSISTENTE: reintenta hasta PUBLIC_CODE_MAX_INTENTOS y luego propaga", async () => {
    const u = await crearUsuario(prisma);
    await crearReto(u, "siempre01");
    let intentos = 0;
    await expect(
      crearRetoConPublicCode((code) => crearReto(u, code), {
        generar: () => {
          intentos++;
          return "siempre01"; // siempre el ocupado
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(intentos).toBe(PUBLIC_CODE_MAX_INTENTOS);
  });
});
