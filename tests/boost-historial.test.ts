/**
 * MI HISTORIAL DE BOOSTS — keyset de verdad, y lo que NO se le enseña al dueño.
 *
 * Lo que se fija:
 *  - PAGINA POR KEYSET sobre (createdAt, id), nunca por OFFSET: un movimiento nuevo entre página y
 *    página no desplaza nada ni repite una fila. Se prueba con empates de `createdAt` al milisegundo,
 *    que es donde un keyset mal escrito se salta filas o entra en bucle.
 *  - NI `refType` NI `refId` EN EL DTO. Las referencias de un boost son la sesión de Stripe, un id
 *    de activación o EL ADMIN que ajustó: las tres se quedan fuera, y lo que no está no se puede
 *    pintar por descuido (la misma regla que la nota del ajuste de puntos).
 *  - LA MONEDA LLEGA NORMALIZADA o no llega. Un código que no sea ISO haría que `Intl` LANCE en la
 *    vista, o sea un 500 en un render de servidor por una fila rara.
 *  - EL SALDO Y LO COMPRADO SON COSAS DISTINTAS: `boostsComprados` solo suma COMPRAS, no los regalos
 *    del VIP ni los ajustes del equipo.
 *  - AUTORIZACIÓN POR CONSTRUCCIÓN: el historial de otro no se puede pedir.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DAREUP_HISTORIAL_PAGINA, RAZON_BOOST_COMPRA } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { boostsComprados, miHistorialBoosts } from "../src/server/services/boost-historial";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma, { username: "la_del_boost" });
});

/** Inserta un movimiento directamente: aquí se prueba la LECTURA, no cómo se escribió. */
async function movimiento(
  campos: Partial<{
    userId: string;
    delta: number;
    reason: string;
    amountCents: number | null;
    currency: string | null;
    refType: string | null;
    refId: string | null;
    createdAt: Date;
  }> = {},
) {
  return prisma.boostLedger.create({
    data: {
      userId: campos.userId ?? userId,
      delta: campos.delta ?? 5,
      reason: campos.reason ?? RAZON_BOOST_COMPRA,
      amountCents: campos.amountCents === undefined ? 1500 : campos.amountCents,
      currency: campos.currency === undefined ? "USD" : campos.currency,
      refType: campos.refType === undefined ? "STRIPE_PAYMENT" : campos.refType,
      refId: campos.refId === undefined ? "cs_test_1" : campos.refId,
      idempotencyKey: `k-${Math.random().toString(36).slice(2)}`,
      ...(campos.createdAt ? { createdAt: campos.createdAt } : {}),
    },
  });
}

describe("lo que el dueño ve de cada movimiento", () => {
  it("el signo, el motivo, la fecha y el importe cuando lo hay", async () => {
    await movimiento({ delta: 5, amountCents: 1500, currency: "USD" });
    const p = await miHistorialBoosts(prisma, userId);

    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({
      delta: 5,
      razon: RAZON_BOOST_COMPRA,
      importeCents: 1500,
      moneda: "USD",
    });
    expect(typeof p.items[0]?.creadoEnMs).toBe("number");
  });

  it("NI refType NI refId: no existen en el DTO", async () => {
    // No es que no se pinten: es que no viajan. Una vista descuidada no puede sacar el cuid de la
    // sesión de pago ni el id del admin que ajustó, porque no los tiene.
    await movimiento({ refType: "STRIPE_PAYMENT", refId: "cs_live_SECRETO" });
    const [m] = (await miHistorialBoosts(prisma, userId)).items;

    expect(m).toBeDefined();
    expect(Object.keys(m!).sort()).toEqual(
      ["creadoEnMs", "delta", "id", "importeCents", "moneda", "razon"].sort(),
    );
    expect(JSON.stringify(m)).not.toContain("cs_live_SECRETO");
    expect(JSON.stringify(m)).not.toContain("STRIPE_PAYMENT");
  });

  it("una activación no tiene importe, y no se le inventa uno", async () => {
    await movimiento({ delta: -1, reason: "ACTIVATION", amountCents: null, currency: null });
    const [m] = (await miHistorialBoosts(prisma, userId)).items;
    expect(m?.importeCents).toBeNull();
    expect(m?.moneda).toBeNull();
    expect(m?.delta).toBe(-1);
  });

  it("del más nuevo al más viejo", async () => {
    await movimiento({ delta: 1, createdAt: new Date("2026-01-01T00:00:00.000Z") });
    await movimiento({ delta: 5, createdAt: new Date("2026-03-01T00:00:00.000Z") });
    await movimiento({ delta: 10, createdAt: new Date("2026-02-01T00:00:00.000Z") });

    expect((await miHistorialBoosts(prisma, userId)).items.map((m) => m.delta)).toEqual([5, 10, 1]);
  });
});

describe("la moneda llega normalizada, o no llega", () => {
  it("en minúsculas sube a mayúsculas", async () => {
    await movimiento({ currency: "usd" });
    expect((await miHistorialBoosts(prisma, userId)).items[0]?.moneda).toBe("USD");
  });

  it.each(["", "US", "12 ", "€"])(
    "«%s» no es un ISO de 3 letras: sale null y la vista se calla",
    async (currency) => {
      // Si esto llegara tal cual, `Intl.NumberFormat` LANZARÍA al pintarlo: un 500 en el render del
      // servidor por una sola fila rara.
      await movimiento({ currency });
      const [m] = (await miHistorialBoosts(prisma, userId)).items;
      expect(m?.moneda).toBeNull();
      // El importe sigue ahí: es la VISTA la que decide no pintar una cifra sin su moneda.
      expect(m?.importeCents).toBe(1500);
    },
  );
});

describe("keyset, no OFFSET", () => {
  /** N movimientos con fechas distintas, del más viejo al más nuevo. */
  async function sembrar(n: number) {
    for (let i = 0; i < n; i += 1) {
      await movimiento({ delta: i + 1, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });
    }
  }

  it("recorre TODAS las páginas sin repetir ni saltarse ninguna", async () => {
    await sembrar(7);
    const vistos: string[] = [];
    let cursor: string | null = null;
    let vueltas = 0;

    do {
      const p = await miHistorialBoosts(prisma, userId, { cursor, limite: 3 });
      vistos.push(...p.items.map((m) => m.id));
      cursor = p.proximoCursor;
      vueltas += 1;
      expect(vueltas, "bucle: el cursor no avanza").toBeLessThan(10);
    } while (cursor !== null);

    expect(vistos).toHaveLength(7);
    expect(new Set(vistos).size).toBe(7);
  });

  it("con `createdAt` EMPATADO al milisegundo tampoco se salta ni repite", async () => {
    // El empate es donde un keyset a medias (solo por fecha) pierde filas o se queda en bucle. Por
    // eso el desempate es por `id`, y por eso el índice lo incluye.
    const mismo = new Date("2026-05-05T12:00:00.000Z");
    for (let i = 0; i < 5; i += 1) await movimiento({ delta: i + 1, createdAt: mismo });

    const a = await miHistorialBoosts(prisma, userId, { limite: 2 });
    const b = await miHistorialBoosts(prisma, userId, { cursor: a.proximoCursor, limite: 2 });
    const c = await miHistorialBoosts(prisma, userId, { cursor: b.proximoCursor, limite: 2 });

    const ids = [...a.items, ...b.items, ...c.items].map((m) => m.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(c.proximoCursor).toBeNull();
  });

  it("un movimiento NUEVO durante la paginación no desplaza la página siguiente", async () => {
    // Es la propiedad que un OFFSET no tiene: con OFFSET, insertar arriba repite una fila abajo.
    await sembrar(4);
    const p1 = await miHistorialBoosts(prisma, userId, { limite: 2 });
    await movimiento({ delta: 99, createdAt: new Date(Date.UTC(2026, 11, 31)) }); // el más nuevo
    const p2 = await miHistorialBoosts(prisma, userId, { cursor: p1.proximoCursor, limite: 2 });

    for (const m of p2.items) expect(p1.items.map((x) => x.id)).not.toContain(m.id);
    expect(p2.items.map((m) => m.delta)).not.toContain(99);
  });

  it("sin más páginas, el cursor es null", async () => {
    await sembrar(2);
    expect((await miHistorialBoosts(prisma, userId, { limite: 5 })).proximoCursor).toBeNull();
  });

  it("un cursor BASURA sirve la primera página, no revienta", async () => {
    await sembrar(3);
    const primera = await miHistorialBoosts(prisma, userId, { limite: 2 });
    for (const basura of ["", "abc", "x.y", "999", "-1.zzz", "9".repeat(40), "1.<script>"]) {
      const p = await miHistorialBoosts(prisma, userId, { cursor: basura, limite: 2 });
      expect(
        p.items.map((m) => m.id),
        basura,
      ).toEqual(primera.items.map((m) => m.id));
    }
  });

  it("el tamaño por defecto es el que comparte con los puntos, y el tope es 100", async () => {
    expect(DAREUP_HISTORIAL_PAGINA).toBe(20);
    await sembrar(3);
    expect((await miHistorialBoosts(prisma, userId, { limite: 9999 })).items).toHaveLength(3);
    expect((await miHistorialBoosts(prisma, userId, { limite: 0 })).items).toHaveLength(1);
  });
});

describe("lo comprado NO es el saldo", () => {
  it("suma solo las COMPRAS: ni el regalo del VIP ni el ajuste del equipo", async () => {
    await movimiento({ delta: 5, reason: RAZON_BOOST_COMPRA });
    await movimiento({ delta: 10, reason: RAZON_BOOST_COMPRA });
    await movimiento({ delta: 1, reason: "VIP_WEEKLY", amountCents: null, currency: null });
    await movimiento({ delta: 3, reason: "ADMIN_ADJUST", amountCents: null, currency: null });
    await movimiento({ delta: -1, reason: "ACTIVATION", amountCents: null, currency: null });

    expect(await boostsComprados(prisma, userId)).toBe(15);
  });

  it("sin compras es 0, no null", async () => {
    await movimiento({ delta: 1, reason: "VIP_WEEKLY", amountCents: null, currency: null });
    expect(await boostsComprados(prisma, userId)).toBe(0);
  });

  it("y una devolución resta de lo comprado solo si va como compra", async () => {
    // `REFUND` es su propia razón: una devolución NO se cuenta como compra negativa aquí. Si algún
    // día se decide que sí, es una decisión, no un descuido.
    await movimiento({ delta: 5, reason: RAZON_BOOST_COMPRA });
    await movimiento({ delta: -5, reason: "REFUND", amountCents: null, currency: null });
    expect(await boostsComprados(prisma, userId)).toBe(5);
  });
});

describe("autorización por construcción", () => {
  it("el historial de otro no sale aquí ni por error", async () => {
    const otro = await crearUsuario(prisma, { username: "el_otro_boost" });
    await movimiento({ userId: otro, delta: 10 });
    await movimiento({ delta: 1 });

    const mio = await miHistorialBoosts(prisma, userId);
    expect(mio.items).toHaveLength(1);
    expect(mio.items[0]?.delta).toBe(1);
    expect(await boostsComprados(prisma, userId)).toBe(1);
    expect(await boostsComprados(prisma, otro)).toBe(10);
  });
});
