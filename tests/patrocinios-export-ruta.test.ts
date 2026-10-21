/**
 * LA RUTA DE EXPORTACIÓN DE LA CONTABILIDAD (Fase 9 · P1).
 *
 * No saca IBANes —eso es el CSV del monedero— pero sí nombres de quien ganó, importes cobrados y
 * las condiciones comerciales con cada marca. Lo que se fija es quién NO pasa y qué queda escrito
 * cuando alguien pasa:
 *
 *  - SOLO ADMIN, con el rol DERIVADO de `secciones.ts` y no escrito a mano en la ruta.
 *  - CADA EXPORTACIÓN DEJA SU LÍNEA en el `AuditLog`, con qué y cuántas filas. Y un rechazo NO
 *    deja línea: si la traza se escribiera antes del guard, diría que alguien exportó algo que no
 *    llegó a salir.
 *  - ES POST Y PASA POR `mutatingRoute` (Origin + sesión + CSRF). Con un GET, otra página podría
 *    disparar la exportación de un admin con sesión abierta y la auditoría dejaría de ser prueba.
 *
 * Para romperlo: quitar el `requireRole` (rojo), auditar antes del guard (rojo: el caso del 403
 * sin línea), o sacar la ruta de `mutatingRoute` (rojo en `route-csrf`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  user: {
    userId: "",
    sessionId: "s1",
    role: "ADMIN" as "ADMIN" | "MODERATOR" | "USER",
    emailVerified: new Date() as Date | null,
  },
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { AUTH_SECRET: "TEST-FIXTURE-auth-secret-sponsor-export" },
}));
vi.mock("@/server/auth/mutating-route", () => ({
  mutatingRoute:
    (handler: (req: Request, ctx: unknown, rc: unknown) => Promise<Response>) =>
    (req: Request, rc: unknown) =>
      handler(req, { user: H.user, env: {}, prisma: H.prisma }, rc),
}));
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () => (H.user.userId ? H.user : null),
}));

import { POST as exportar } from "../src/app/api/panel/patrocinios/export/route";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

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
  H.user.userId = await crearUsuario(prisma, { username: "la_admin" });
  H.user.role = "ADMIN";
});

const pedir = (cuerpo: unknown): Promise<Response> =>
  exportar(
    new Request("http://test/api/panel/patrocinios/export", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: JSON.stringify(cuerpo),
    }),
    undefined,
  );

async function unRetoPatrocinado(): Promise<void> {
  await prisma.challenge.create({
    data: {
      title: "Reto de marca",
      slug: "reto-de-marca",
      publicCode: generarPublicCode(),
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      prizeAmountCents: 100_000,
      startsAt: new Date(Date.now() - 86_400_000),
      deadline: new Date(Date.now() + 86_400_000),
      createdById: H.user.userId,
      esPatrocinado: true,
      sponsorNombre: "Nexus",
      comisionBps: 2500,
    },
  });
}

describe("quién puede exportar la contabilidad", () => {
  it("el administrador, sí, y el fichero viene como descarga", async () => {
    await unRetoPatrocinado();

    const res = await pedir({ tipo: "patrocinios" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="patrocinios-/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Filas")).toBe("1");
    expect(await res.text()).toContain("Nexus");
  });

  for (const rol of ["MODERATOR", "USER"] as const) {
    it(`un ${rol} no: son condiciones comerciales`, async () => {
      await unRetoPatrocinado();
      H.user.role = rol;

      const res = await pedir({ tipo: "patrocinios" });

      expect(res.status).toBe(403);
      // Y NO deja línea de auditoría: no exportó nada.
      expect(await prisma.auditLog.count()).toBe(0);
    });
  }

  it("y sin sesión tampoco", async () => {
    H.user.userId = "";
    const res = await pedir({ tipo: "patrocinios" });
    expect(res.status).toBe(403);
  });
});

describe("la traza", () => {
  it("queda escrita con qué y cuántas filas", async () => {
    await unRetoPatrocinado();

    await pedir({ tipo: "patrocinios" });

    const linea = await prisma.auditLog.findFirstOrThrow();
    expect(linea.action).toBe("SPONSOR_EXPORT");
    expect(linea.actorId).toBe(H.user.userId);
    expect(linea.targetId).toBe("patrocinios");
    expect(linea.metadata).toMatchObject({ tipo: "patrocinios", filas: 1, truncada: false });
  });

  it("y no lleva los DATOS dentro: la traza dice quién y cuánto, no qué contenía", async () => {
    await unRetoPatrocinado();
    await pedir({ tipo: "patrocinios" });
    const linea = await prisma.auditLog.findFirstOrThrow();
    expect(JSON.stringify(linea.metadata)).not.toContain("Nexus");
  });
});

describe("el cuerpo", () => {
  it("un tipo inventado se rechaza", async () => {
    const res = await pedir({ tipo: "lo-que-sea" });
    expect(res.status).toBe(400);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("y el de ganadores también se sirve", async () => {
    const res = await pedir({ tipo: "ganadores" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/filename="ganadores-/);
  });
});

describe("el rol se DERIVA de la sección, no se escribe en la ruta", () => {
  it('la ruta no lleva un `requireRole("ADMIN")` suelto', () => {
    // El día que la sección cambie de rol, la nav diría una cosa y la ruta otra.
    const src = readFileSync(
      join(process.cwd(), "src", "app", "api", "panel", "patrocinios", "export", "route.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).toContain('rolDeRuta("/panel/patrocinios")');
    expect(src, "el rol está escrito a mano").not.toMatch(/requireRole\(\s*"ADMIN"/);
  });
});
