/**
 * LA PUERTA DE 18+, CONTRA LA RUTA REAL.
 *
 * `tests/edad.test.ts` ata el cálculo; esto ata que la ruta lo USE: que un menor declarado no entre,
 * que quien cumple hoy sí, que la fecha y el consentimiento QUEDEN GUARDADOS, y que sin casilla no
 * haya alta. El cálculo puede ser perfecto y la ruta no llamarlo — ese es el fallo que esto caza.
 *
 * LA FRONTERA SE DERIVA DE `EDAD_MIN_USO`, no de un año escrito aquí: mover la constante mueve
 * estos casos con ella. Si alguien volviera a poner 16, el caso de "17 años" pasaría a entrar y
 * este fichero se pondría rojo.
 *
 * Para romperlo: quitar la llamada a `declaraEdadMinima` de la ruta (rojo); dejar de persistir
 * `terminosAceptadosEn` (rojo); aceptar un `aceptaTerminos: false` (rojo); volver a `z.coerce.date()`
 * (rojo en el 30 de febrero).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EDAD_MIN_USO } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

import { createTestPrisma, resetDb } from "./helpers/db";

// La ruta pide `env` y el singleton de `prisma` dentro del handler; en test se le dan los del
// worker. `registerUser` va SIN mockear a propósito: lo que se comprueba aquí es que la fecha y el
// consentimiento llegan HASTA LA BASE, y con un doble no se comprobaría nada de eso.
const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { AUTH_SECRET: "TEST-FIXTURE-auth-secret-registro-edad", APP_URL: "https://x.test" },
}));

import { POST as registerPOST } from "../src/app/api/auth/register/route";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

const PASS = "TEST-FIXTURE-cordillera-tejado-ambar-79";

/** `AAAA-MM-DD` de quien cumple EXACTAMENTE `anios` hoy. */
function naceHace(anios: number): string {
  const hoy = new Date();
  const f = new Date(Date.UTC(hoy.getUTCFullYear() - anios, hoy.getUTCMonth(), hoy.getUTCDate()));
  return f.toISOString().slice(0, 10);
}

/** Un día MÁS joven que `anios` (todavía no los ha cumplido). */
function naceHaceMenosUnDia(anios: number): string {
  const hoy = new Date();
  const f = new Date(
    Date.UTC(hoy.getUTCFullYear() - anios, hoy.getUTCMonth(), hoy.getUTCDate() + 1),
  );
  return f.toISOString().slice(0, 10);
}

async function alta(cuerpo: Record<string, unknown>) {
  const res = await registerPOST(
    new Request("http://test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: JSON.stringify(cuerpo),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

const bueno = (extra: Record<string, unknown> = {}) => ({
  email: "alguien@test.com",
  password: PASS,
  birthDate: naceHace(30),
  aceptaTerminos: true,
  ...extra,
});

describe("la frontera", () => {
  it(`con ${EDAD_MIN_USO} cumplidos HOY, entra`, async () => {
    const { status } = await alta(bueno({ birthDate: naceHace(EDAD_MIN_USO) }));
    expect(status).toBe(200);
    const u = await prisma.user.findUnique({ where: { email: "alguien@test.com" } });
    expect(u, "la cuenta no se creó").not.toBeNull();
  });

  it("un día antes de cumplirlos, NO entra", async () => {
    const { status, body } = await alta(bueno({ birthDate: naceHaceMenosUnDia(EDAD_MIN_USO) }));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: { code: "EDAD_MINIMA" } });
    expect(await prisma.user.count()).toBe(0);
  });

  it("y el copy es humano, no un código ni un número suelto", async () => {
    const { body } = await alta(bueno({ birthDate: naceHaceMenosUnDia(EDAD_MIN_USO) }));
    const msg = (body as unknown as { error: { message: string } }).error.message;
    expect(msg).toMatch(/mayor de edad/i);
    // Y NO promete ni sugiere que haya una verificación detrás.
    expect(msg).not.toMatch(/verific/i);
  });

  it("varios años por debajo tampoco, uno por uno", async () => {
    for (const anios of [0, 10, EDAD_MIN_USO - 1]) {
      await resetDb(prisma);
      const { status } = await alta(bueno({ birthDate: naceHace(anios) }));
      expect(status, `${anios} años`).toBe(400);
    }
  });
});

describe("lo que se guarda", () => {
  it("la fecha declarada se persiste tal cual", async () => {
    const fecha = "1995-03-14";
    await alta(bueno({ birthDate: fecha }));
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "alguien@test.com" } });
    expect(u.birthDate?.toISOString()).toBe("1995-03-14T00:00:00.000Z");
  });

  it("y el consentimiento queda SELLADO con su fecha", async () => {
    const antes = Date.now();
    await alta(bueno());
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "alguien@test.com" } });
    expect(u.terminosAceptadosEn, "no se guardó cuándo aceptó").not.toBeNull();
    // El sello lo pone el SERVIDOR: cae dentro de esta ejecución, no es una fecha del cliente.
    expect(u.terminosAceptadosEn!.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(u.terminosAceptadosEn!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe("la casilla", () => {
  it("sin marcar, no hay alta", async () => {
    const { status, body } = await alta(bueno({ aceptaTerminos: false }));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: { code: "TERMINOS" } });
    expect(await prisma.user.count()).toBe(0);
  });

  it("y si ni siquiera viene, tampoco", async () => {
    const sinCasilla = bueno();
    delete (sinCasilla as Record<string, unknown>)["aceptaTerminos"];
    const { status } = await alta(sinCasilla);
    expect(status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("la fecha que llega", () => {
  it("un día que no existe se rechaza, no se corre al mes siguiente", async () => {
    // `z.coerce.date()` convertía esto en el 2 de marzo SIN avisar: se guardaba una fecha que la
    // persona no escribió, y en la frontera de la edad eso decide quién entra.
    const { status } = await alta(bueno({ birthDate: "2001-02-30" }));
    expect(status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("una fecha futura se rechaza", async () => {
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const { status } = await alta(bueno({ birthDate: manana }));
    expect(status).toBe(400);
  });

  it("y un formato que no sea AAAA-MM-DD, también", async () => {
    for (const malo of ["14/03/1995", "1995-3-14", "1995-03-14T00:00:00.000Z", "ayer", ""]) {
      await resetDb(prisma);
      const { status } = await alta(bueno({ birthDate: malo }));
      expect(status, malo).toBe(400);
    }
  });
});
