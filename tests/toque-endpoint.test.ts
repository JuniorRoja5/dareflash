/**
 * POST /api/toques — la ruta, de punta a punta.
 *
 * Lo que fija aquí y no en `toque.test.ts`: que el SERVIDOR no se fía de la UI, y el tope por
 * EMISOR, que vive en la ruta porque es donde están los cubos del resto del producto.
 *
 * ┌─ EL CUBO POR EMISOR ES LA SEGUNDA CAPA, Y MIDE OTRA COSA ───────────────────────────────────┐
 * │ La clave única del aviso impide tocar DOS VECES A LA MISMA PERSONA en un día. No ve la otra  │
 * │ forma de abusar —tocar a trescientas personas DISTINTAS—, porque cada pareja es un hecho     │
 * │ distinto y cada uno escribe su fila legítimamente. Eso lo corta el cubo, y por eso los dos   │
 * │ topes tienen que existir: ninguno cubre el caso del otro.                                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo a propósito: quitar el `rateLimit` de la ruta (rojo: el caso del tope), o
 * devolver 200 cuando no es VIP (rojo: el 403 y el COUNT).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MSG_TOQUE_A_TI_MISMO,
  MSG_TOQUE_LIMITE_DIARIO,
  MSG_TOQUE_REPETIDO,
  MSG_TOQUE_SIN_VERIFICAR,
  MSG_TOQUE_SOLO_VIP,
  TOQUE_MAX_DIA,
} from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  user: {
    userId: "",
    sessionId: "s1",
    role: "USER" as const,
    emailVerified: new Date() as Date | null,
  },
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/server/auth/mutating-route", () => ({
  mutatingRoute:
    (handler: (req: Request, ctx: unknown, rc: unknown) => Promise<Response>) =>
    (req: Request, rc: unknown) =>
      handler(req, { user: H.user, env: { AUTH_SECRET: "x" }, prisma: H.prisma }, rc),
}));
// `requireVerifiedUser` lee la cookie de sesión, que aquí no existe. Se sustituye por la decisión
// que de verdad importa en estos casos —si el correo está verificado— leída del mismo `H.user` que
// ve la ruta: así el caso del no verificado sigue midiendo algo.
vi.mock("@/server/auth/rbac", async () => {
  const real =
    await vi.importActual<typeof import("../src/server/auth/rbac")>("../src/server/auth/rbac");
  return {
    ...real,
    requireVerifiedUser: async () => {
      if (!H.user.emailVerified) throw new real.AuthError("EMAIL_NOT_VERIFIED");
      return H.user;
    },
  };
});

import { POST as darToqueRuta } from "../src/app/api/toques/route";
import { registrarSuscripcion } from "../src/server/services/vip";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let otro: string;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  H.user.userId = await crearUsuario(prisma, { username: "la_vip" });
  H.user.emailVerified = new Date();
  otro = await crearUsuario(prisma, { username: "el_otro" });
  await registrarSuscripcion(prisma, {
    userId: H.user.userId,
    estado: "ACTIVA",
    periodoFin: new Date(Date.now() + 30 * 86_400_000),
  });
});

const tocar = (userId: string): Promise<Response> =>
  darToqueRuta(
    new Request("http://test/api/toques", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: JSON.stringify({ userId }),
    }),
    undefined,
  );

const cuantos = () => prisma.notification.count({ where: { tipo: "TOQUE" } });

describe("el camino normal", () => {
  it("un VIP toca: 200, copy humano y UNA notificación", async () => {
    const res = await tocar(otro);
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.estado).toBe("enviado");
    expect(cuerpo.mensaje).toBeTruthy();
    expect(await cuantos()).toBe(1);
  });

  it("y repetir el mismo día es un 200 amable, no un error", async () => {
    await tocar(otro);
    const res = await tocar(otro);
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.estado).toBe("repetido");
    expect(cuerpo.mensaje).toBe(MSG_TOQUE_REPETIDO);
    expect(await cuantos()).toBe(1);
  });
});

describe("el servidor no se fía de la UI", () => {
  it("un NO VIP: 403 con copy, y CERO notificaciones", async () => {
    // El botón no se le enseña, pero el endpoint existe y un `curl` no mira la UI.
    await prisma.subscription.deleteMany({ where: { userId: H.user.userId } });
    const res = await tocar(otro);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe(MSG_TOQUE_SOLO_VIP);
    expect(await cuantos(), "un no-VIP escribió un toque").toBe(0);
  });

  it("sin el correo verificado: 403 con copy, y CERO notificaciones", async () => {
    H.user.emailVerified = null;
    const res = await tocar(otro);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe(MSG_TOQUE_SIN_VERIFICAR);
    expect(await cuantos()).toBe(0);
  });

  it("a uno mismo: 400 y cero", async () => {
    const res = await tocar(H.user.userId);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(MSG_TOQUE_A_TI_MISMO);
    expect(await cuantos()).toBe(0);
  });

  it("a un id que no existe: 404, el mismo que cualquier recurso ajeno", async () => {
    const res = await tocar("noexiste");
    expect(res.status).toBe(404);
    expect(await cuantos()).toBe(0);
  });

  it("un cuerpo sin `userId`: 400 sin filtrar nada del esquema", async () => {
    const res = await darToqueRuta(
      new Request("http://test/api/toques", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://test" },
        body: "{}",
      }),
      undefined,
    );
    expect(res.status).toBe(400);
    const cuerpo = await res.json();
    expect(JSON.stringify(cuerpo)).not.toMatch(/zod|ZodError|expected|invalid_type/i);
  });
});

describe("el tope POR EMISOR corta el megáfono", () => {
  it(`pasado el tope de ${TOQUE_MAX_DIA} al día se corta, aunque cada toque sea a otra persona`, async () => {
    // Cada uno a un receptor DISTINTO: la clave única no los ve (son hechos distintos) y los
    // dejaría pasar todos. Esto es lo único que los corta.
    const receptores: string[] = [];
    for (let i = 0; i < TOQUE_MAX_DIA + 1; i += 1) {
      receptores.push(await crearUsuario(prisma, { username: `receptor${i}` }));
    }

    for (let i = 0; i < TOQUE_MAX_DIA; i += 1) {
      const res = await tocar(receptores[i]!);
      expect((await res.json()).estado, `el toque ${i + 1} se cortó antes de tiempo`).toBe(
        "enviado",
      );
    }

    const pasado = await tocar(receptores[TOQUE_MAX_DIA]!);
    expect(pasado.status).toBe(200);
    const cuerpo = await pasado.json();
    expect(cuerpo.estado).toBe("limite");
    expect(cuerpo.mensaje).toBe(MSG_TOQUE_LIMITE_DIARIO);
    // Y lo que importa de verdad: el que pasó del tope NO escribió.
    expect(await cuantos()).toBe(TOQUE_MAX_DIA);
  });

  it("y el cubo es POR USUARIO: otra persona no hereda el tope", async () => {
    for (let i = 0; i < TOQUE_MAX_DIA; i += 1) {
      await tocar(await crearUsuario(prisma, { username: `gastado${i}` }));
    }
    expect((await (await tocar(otro)).json()).estado).toBe("limite");

    // Otra VIP, cubo propio.
    H.user.userId = await crearUsuario(prisma, { username: "otra_vip" });
    await registrarSuscripcion(prisma, {
      userId: H.user.userId,
      estado: "ACTIVA",
      periodoFin: new Date(Date.now() + 30 * 86_400_000),
    });
    expect((await (await tocar(otro)).json()).estado).toBe("enviado");
  });
});
