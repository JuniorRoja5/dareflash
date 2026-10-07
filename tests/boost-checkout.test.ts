/**
 * ABRIR EL PAGO — el precio lo pone el SERVIDOR.
 *
 * ┌─ LO QUE ESTO IMPIDE ─────────────────────────────────────────────────────────────────────────┐
 * │ Que el cliente mande el importe. Si el precio viajara en el cuerpo, comprar el pack de 10 por │
 * │ un dólar sería editar un JSON. Aquí el cliente SOLO manda la clave del paquete, y el importe  │
 * │ se resuelve contra `PAQUETES_BOOST` en servidor: no es un dato de entrada, es una             │
 * │ consecuencia.                                                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y lo demás que esta ruta tiene que cumplir:
 *  - EMAIL VERIFICADO. Comprar es una acción con efectos, misma barrera que votar o denunciar.
 *  - NO ACREDITA NADA. Abrir un pago no es haber cobrado; los boosts los da el webhook.
 *  - LA `metadata` ES EL PUENTE con el webhook: sin ella no se sabría a quién acreditar.
 *  - SIN CLAVE DE STRIPE no revienta: responde copy humano y manda el detalle al log.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MSG_BOOST_PAGO_NO_DISPONIBLE, PAQUETES_BOOST } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  user: { userId: "", sessionId: "s1", emailVerified: new Date() as Date | null },
  crearSesion: vi.fn(),
  claveStripe: "sk_test_FIXTURE" as string | undefined,
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: "TEST-FIXTURE-auth-secret-checkout",
    APP_URL: "https://x.test",
    get STRIPE_SECRET_KEY() {
      return H.claveStripe;
    },
  },
}));
// `mutatingRoute` ya tiene sus propios tests (Origin/sesión/CSRF). Aquí se sustituye por un paso
// que inyecta lo mismo, para poder probar LO QUE ESTA RUTA decide sin montar una sesión real.
vi.mock("@/server/auth/mutating-route", () => ({
  mutatingRoute:
    (handler: (req: Request, ctx: unknown, rc: unknown) => Promise<Response>) =>
    (req: Request, rc: unknown) =>
      handler(
        req,
        {
          user: H.user,
          env: {
            AUTH_SECRET: "TEST-FIXTURE-auth-secret-checkout",
            APP_URL: "https://x.test",
            STRIPE_SECRET_KEY: H.claveStripe,
          },
          prisma: H.prisma,
        },
        rc,
      ),
}));
// El SDK de Stripe se dobla: lo que se prueba es QUÉ le pedimos, no que Stripe funcione.
vi.mock("@/server/pagos/stripe", async () => {
  const real =
    await vi.importActual<typeof import("@/server/pagos/stripe")>("@/server/pagos/stripe");
  return {
    ...real,
    clienteStripe: (secret: string | undefined) => {
      if (!secret) throw new real.PagosNoDisponibles("STRIPE_SECRET_KEY");
      return { checkout: { sessions: { create: H.crearSesion } } };
    },
  };
});

import { POST as checkout } from "../src/app/api/boost/checkout/route";

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
  H.user.userId = await crearUsuario(prisma, { username: "la_compradora" });
  H.user.emailVerified = new Date();
  H.claveStripe = "sk_test_FIXTURE";
  H.crearSesion
    .mockReset()
    .mockResolvedValue({ id: "cs_test_1", url: "https://stripe.test/pagar" });
});

const pedir = (cuerpo: unknown) =>
  checkout(
    new Request("http://test/api/boost/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: JSON.stringify(cuerpo),
    }),
    undefined,
  );

describe("el precio sale del catálogo", () => {
  it.each(Object.keys(PAQUETES_BOOST) as (keyof typeof PAQUETES_BOOST)[])(
    "%s se cobra por su importe del catálogo",
    async (packageId) => {
      const res = await pedir({ packageId });
      expect(res.status).toBe(200);

      const args = H.crearSesion.mock.calls[0]?.[0] as {
        line_items: { price_data: { unit_amount: number } }[];
      };
      expect(args.line_items[0]?.price_data.unit_amount).toBe(
        PAQUETES_BOOST[packageId].precioCents,
      );
    },
  );

  it("un importe mandado por el cliente se IGNORA por completo", async () => {
    // El cuerpo lleva un precio de un céntimo; Zod lo descarta y el catálogo manda.
    await pedir({ packageId: "boost_10", precioCents: 1, unit_amount: 1, amount: 1 });

    const args = H.crearSesion.mock.calls[0]?.[0] as {
      line_items: { price_data: { unit_amount: number } }[];
    };
    expect(args.line_items[0]?.price_data.unit_amount).toBe(PAQUETES_BOOST.boost_10.precioCents);
  });

  it("un paquete inventado no llega a Stripe", async () => {
    const res = await pedir({ packageId: "boost_999" });
    expect(res.status).toBe(400);
    expect(H.crearSesion).not.toHaveBeenCalled();
  });

  it("y sin paquete, tampoco", async () => {
    expect((await pedir({})).status).toBe(400);
    expect(H.crearSesion).not.toHaveBeenCalled();
  });
});

describe("la metadata es el puente con el webhook", () => {
  it("lleva a QUIÉN acreditar y QUÉ, y nada más", async () => {
    await pedir({ packageId: "boost_5" });
    const args = H.crearSesion.mock.calls[0]?.[0] as { metadata: Record<string, string> };
    expect(args.metadata).toEqual({ userId: H.user.userId, packageId: "boost_5" });
  });
});

describe("la vuelta del pago aterriza donde hay quien la recoja", () => {
  /**
   * ESTO ES UN TEST DE COMPOSICIÓN, no de la ruta sola. Las dos URLs que se le dan a Stripe las
   * tiene que LEER la pantalla de /boosts (`?compra=ok` / `?compra=cancelada`); si alguien cambia
   * aquí el nombre del parámetro o el destino, la ruta sigue verde y la pantalla deja de decir si
   * se ha cobrado, en silencio. Antes apuntaban a /perfil, que no recogía nada.
   */
  it("las dos van a /boosts, con los dos valores que esa página entiende", async () => {
    await pedir({ packageId: "boost_1" });
    const args = H.crearSesion.mock.calls[0]?.[0] as { success_url: string; cancel_url: string };

    expect(args.success_url).toBe("https://x.test/boosts?compra=ok");
    expect(args.cancel_url).toBe("https://x.test/boosts?compra=cancelada");
  });

  it("y salen de APP_URL, no de un dominio escrito a mano", async () => {
    await pedir({ packageId: "boost_1" });
    const args = H.crearSesion.mock.calls[0]?.[0] as { success_url: string; cancel_url: string };
    for (const u of [args.success_url, args.cancel_url]) {
      expect(u.startsWith("https://x.test/")).toBe(true);
      expect(u).not.toMatch(/localhost|dareflash\.(com|app)/);
    }
  });
});

describe("quién puede comprar", () => {
  it("sin el correo verificado, no", async () => {
    H.user.emailVerified = null;
    const res = await pedir({ packageId: "boost_1" });
    expect(res.status).toBe(403);
    expect(H.crearSesion).not.toHaveBeenCalled();
  });
});

describe("abrir el pago NO acredita", () => {
  it("el saldo de boosts no se mueve", async () => {
    await pedir({ packageId: "boost_10" });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: H.user.userId } });
    expect(u.boostBalance).toBe(0);
    expect(await prisma.boostLedger.count()).toBe(0);
  });
});

describe("sin Stripe configurado", () => {
  it("responde copy humano, sin nombrar la variable ni el error", async () => {
    H.claveStripe = undefined;
    const res = await pedir({ packageId: "boost_1" });

    expect(res.status).toBe(503);
    const cuerpo = (await res.json()) as { error: { code: string; message: string } };
    expect(cuerpo.error.message).toBe(MSG_BOOST_PAGO_NO_DISPONIBLE);
    expect(JSON.stringify(cuerpo)).not.toMatch(/STRIPE|sk_test|secret/i);
  });
});
