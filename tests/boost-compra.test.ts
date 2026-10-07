/**
 * COMPRA DE BOOSTS — acreditar lo que Stripe confirma, exactamente una vez.
 *
 * Es la primera pieza del raíl del dinero, así que lo que se fija aquí es lo que cuesta caro si
 * falla:
 *
 *  - EXACTAMENTE UNA VEZ. La misma compra procesada dos veces —o por dos TIPOS de evento— acredita
 *    una. La clave sale de la COMPRA (la sesión de pago), no del evento: Stripe reentrega webhooks
 *    cuando duda de nuestra respuesta, y con la clave por evento cada reentrega sería un regalo.
 *  - EL IMPORTE SE CONTRASTA CONTRA EL CATÁLOGO. Si lo pagado no cuadra, no se acredita nada. El
 *    precio ya se fijó en servidor al abrir el pago, así que un desajuste significa que algo no es
 *    lo que creemos — y ante eso no se regalan créditos.
 *  - Y LA MONEDA, ANTES QUE EL IMPORTE. `amount_total` es una cifra SIN UNIDAD: 2000 son veinte
 *    dólares o dos mil yenes. Una divisa que no es la nuestra se rechaza aunque el número cuadre, y
 *    el ORDEN es parte de la decisión: se fija con un caso que manda los dos mal a la vez y exige
 *    `MONEDA`. Sin él, comprobar la moneda después del importe pasaría igual de verde.
 *  - LOS BOOSTS SALEN DEL CATÁLOGO, nunca del evento ni del cliente.
 *  - EL SALDO SE MUEVE POR EL LEDGER, con su fila. Un `boostBalance` sin movimiento es un descuadre.
 *
 * Para romperlo: hacer la clave aleatoria o por evento (rojo en idempotencia), quitar la
 * comparación de importe o la de moneda (rojo), aceptar la moneda ausente (rojo), o leer los boosts
 * de la entrada en vez del catálogo (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CURRENCY, PAQUETES_BOOST, RAZON_BOOST_COMPRA } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { acreditarCompraBoost, claveCompraBoost } from "../src/server/services/boost-compra";

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
  userId = await crearUsuario(prisma, { username: "la_compradora" });
});

const saldo = async () =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).boostBalance;
const movimientos = () => prisma.boostLedger.findMany({ where: { userId } });

/**
 * Una compra confirmada del paquete que se diga, con el importe correcto del catálogo y la moneda
 * tal y como la manda Stripe: en MINÚSCULAS. Si el fixture la pusiera en mayúsculas, una comparación
 * sin normalizar pasaría aquí y fallaría en producción.
 */
const compra = (packageId: keyof typeof PAQUETES_BOOST, sessionId = "cs_test_1") => ({
  userId,
  packageId,
  sessionId,
  pagadoCents: PAQUETES_BOOST[packageId].precioCents,
  moneda: DEFAULT_CURRENCY.toLowerCase(),
});

describe("el catálogo manda", () => {
  it("son los tres paquetes del maestro, con sus importes exactos", () => {
    // Clavados: si alguien los mueve, que tenga que venir aquí y decidirlo, no que el test le siga
    // la corriente. Son precios de verdad — esto cobra dinero.
    expect(PAQUETES_BOOST).toEqual({
      boost_1: { precioCents: 500, boosts: 1 },
      boost_5: { precioCents: 1500, boosts: 5 },
      boost_10: { precioCents: 2000, boosts: 10 },
    });
  });

  it.each(Object.keys(PAQUETES_BOOST) as (keyof typeof PAQUETES_BOOST)[])(
    "%s acredita los boosts del catálogo, ni uno más",
    async (packageId) => {
      const r = await acreditarCompraBoost(prisma, compra(packageId));
      expect(r).toEqual({
        estado: "acreditado",
        boosts: PAQUETES_BOOST[packageId].boosts,
        saldo: PAQUETES_BOOST[packageId].boosts,
      });
      expect(await saldo()).toBe(PAQUETES_BOOST[packageId].boosts);
    },
  );

  it("y deja su fila de ledger, con el importe y la moneda", async () => {
    await acreditarCompraBoost(prisma, compra("boost_5"));
    const m = await movimientos();
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      delta: 5,
      reason: RAZON_BOOST_COMPRA,
      amountCents: 1500,
      currency: DEFAULT_CURRENCY,
      refType: "STRIPE_PAYMENT",
      refId: "cs_test_1",
      idempotencyKey: claveCompraBoost("cs_test_1"),
    });
  });
});

describe("exactamente una vez", () => {
  it("la MISMA compra dos veces acredita UNA", async () => {
    expect((await acreditarCompraBoost(prisma, compra("boost_10"))).estado).toBe("acreditado");
    expect(await acreditarCompraBoost(prisma, compra("boost_10"))).toEqual({ estado: "repetida" });

    expect(await saldo()).toBe(10);
    expect(await movimientos()).toHaveLength(1);
  });

  it("cinco reentregas a la vez dejan UNA fila", async () => {
    // Stripe reentrega en paralelo cuando duda; lo impide el UNIQUE del ledger, no un `if`.
    await Promise.all([1, 2, 3, 4, 5].map(() => acreditarCompraBoost(prisma, compra("boost_1"))));
    expect(await saldo()).toBe(1);
    expect(await movimientos()).toHaveLength(1);
  });

  it("la clave sale de la COMPRA: dos compras distintas SÍ acreditan dos veces", async () => {
    await acreditarCompraBoost(prisma, compra("boost_1", "cs_test_A"));
    await acreditarCompraBoost(prisma, compra("boost_1", "cs_test_B"));
    expect(await saldo()).toBe(2);
    expect(await movimientos()).toHaveLength(2);
  });

  it("y la clave NO lleva nada del evento ni del momento", () => {
    // Si llevara el id de entrega o un reloj, dos reentregas de la misma compra darían dos claves.
    expect(claveCompraBoost("cs_test_1")).toBe(claveCompraBoost("cs_test_1"));
    expect(claveCompraBoost("cs_test_1")).toContain("cs_test_1");
  });
});

describe("la moneda se contrasta, y antes que el importe", () => {
  it("otra divisa con el MISMO número de céntimos no acredita", async () => {
    // Es el flanco concreto: 2000 son veinte dólares o doscientas coronas. Con el importe como
    // único filtro, el pack de 10 se llevaría por una fracción de su precio.
    const r = await acreditarCompraBoost(prisma, { ...compra("boost_10"), moneda: "eur" });
    expect(r).toEqual({ estado: "rechazada", motivo: "MONEDA" });
    expect(await saldo()).toBe(0);
    expect(await movimientos()).toHaveLength(0);
  });

  it.each(["jpy", "sek", "mxn", "ars"])(
    "«%s» tampoco, aunque el importe cuadre",
    async (moneda) => {
      const r = await acreditarCompraBoost(prisma, { ...compra("boost_5"), moneda });
      expect(r).toEqual({ estado: "rechazada", motivo: "MONEDA" });
      expect(await saldo()).toBe(0);
    },
  );

  it("SIN moneda (null) no acredita: «no se sabe» no es «la de siempre»", async () => {
    const r = await acreditarCompraBoost(prisma, { ...compra("boost_1"), moneda: null });
    expect(r).toEqual({ estado: "rechazada", motivo: "MONEDA" });
    expect(await saldo()).toBe(0);
  });

  it("ni con la cadena vacía", async () => {
    const r = await acreditarCompraBoost(prisma, { ...compra("boost_1"), moneda: "" });
    expect(r).toEqual({ estado: "rechazada", motivo: "MONEDA" });
    expect(await saldo()).toBe(0);
  });

  it("la NUESTRA sí, venga en minúsculas o en mayúsculas", async () => {
    // Stripe la manda en minúsculas y el catálogo la escribe en mayúsculas: las dos tienen que
    // valer. Una comparación literal contra `DEFAULT_CURRENCY` rechazaría TODAS las compras reales.
    for (const [i, moneda] of [
      DEFAULT_CURRENCY.toLowerCase(),
      DEFAULT_CURRENCY.toUpperCase(),
    ].entries()) {
      const r = await acreditarCompraBoost(prisma, { ...compra("boost_1", `cs_m_${i}`), moneda });
      expect(r, `rechazó la moneda propia escrita «${moneda}»`).toMatchObject({
        estado: "acreditado",
      });
    }
    expect(await saldo()).toBe(2);
  });

  it("con la moneda Y el importe mal, el motivo es MONEDA: se mira primero", async () => {
    // Fija el ORDEN, no solo la existencia del chequeo. Un importe es una cifra sin unidad: hasta
    // saber la divisa no significa nada, así que la divisa se resuelve antes.
    const r = await acreditarCompraBoost(prisma, {
      ...compra("boost_10"),
      moneda: "eur",
      pagadoCents: 1,
    });
    expect(r).toEqual({ estado: "rechazada", motivo: "MONEDA" });
  });

  it("y el paquete se mira ANTES que la moneda: sin paquete no hay precio que contrastar", async () => {
    const r = await acreditarCompraBoost(prisma, {
      userId,
      packageId: "boost_999",
      sessionId: "cs_test_orden",
      pagadoCents: 500,
      moneda: "eur",
    });
    expect(r).toEqual({ estado: "rechazada", motivo: "PAQUETE" });
  });
});

describe("el importe se contrasta", () => {
  it("pagar de MENOS no acredita nada", async () => {
    const r = await acreditarCompraBoost(prisma, {
      ...compra("boost_10"),
      pagadoCents: 100, // el pack de 10 por un dólar
    });
    expect(r).toEqual({ estado: "rechazada", motivo: "IMPORTE" });
    expect(await saldo()).toBe(0);
    expect(await movimientos()).toHaveLength(0);
  });

  it("pagar de MÁS tampoco: no cuadrar es no cuadrar", async () => {
    const r = await acreditarCompraBoost(prisma, {
      ...compra("boost_1"),
      pagadoCents: 99_999,
    });
    expect(r).toEqual({ estado: "rechazada", motivo: "IMPORTE" });
    expect(await saldo()).toBe(0);
  });

  it("sin importe (null) tampoco", async () => {
    const r = await acreditarCompraBoost(prisma, { ...compra("boost_1"), pagadoCents: null });
    expect(r).toEqual({ estado: "rechazada", motivo: "IMPORTE" });
    expect(await saldo()).toBe(0);
  });

  it("y el importe del catálogo del paquete EQUIVOCADO no cuela", async () => {
    // Pagar 500¢ (el de 1) pidiendo el pack de 10.
    const r = await acreditarCompraBoost(prisma, { ...compra("boost_10"), pagadoCents: 500 });
    expect(r).toEqual({ estado: "rechazada", motivo: "IMPORTE" });
  });
});

describe("el paquete se valida", () => {
  it.each(["", "boost_99", "BOOST_1", "boost_1 ", "__proto__"])(
    "«%s» no existe: no acredita",
    async (packageId) => {
      const r = await acreditarCompraBoost(prisma, {
        userId,
        packageId,
        sessionId: "cs_test_x",
        pagadoCents: 500,
        moneda: DEFAULT_CURRENCY.toLowerCase(),
      });
      expect(r).toEqual({ estado: "rechazada", motivo: "PAQUETE" });
      expect(await saldo()).toBe(0);
    },
  );
});

describe("bordes", () => {
  it("un usuario que no existe no acredita ni deja fila", async () => {
    await expect(
      acreditarCompraBoost(prisma, { ...compra("boost_1"), userId: "no-existe" }),
    ).rejects.toThrow();
    expect(await prisma.boostLedger.count()).toBe(0);
  });

  it("dos usuarios distintos no se pisan", async () => {
    const otro = await crearUsuario(prisma, { username: "el_otro" });
    await acreditarCompraBoost(prisma, compra("boost_5", "cs_A"));
    await acreditarCompraBoost(prisma, { ...compra("boost_1", "cs_B"), userId: otro });

    expect(await saldo()).toBe(5);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: otro } })).boostBalance).toBe(1);
  });
});
