/**
 * SOLICITAR UNA RETIRADA — la pieza en la que el dinero SALE del monedero.
 *
 * Los casos ejecutan la ruta real contra la base de datos: ninguno escribe un `WalletLedger` ni una
 * `Withdrawal` a mano. Lo que se fija:
 *
 *  - EL DINERO SALE AL PEDIR, no al pagar. La alternativa —dejar el saldo hasta que el admin
 *    transfiera— crea un estado en el que el dinero está pedido Y disponible, y ese estado se puede
 *    pedir otra vez. Debitar al pedir cierra esa puerta sin un solo `if`.
 *  - LA FILA Y EL DÉBITO VAN JUNTOS. Si fueran dos pasos, un fallo entre medias dejaría dinero
 *    debitado sin retirada (la persona pierde el saldo) o una retirada sin débito (se paga con
 *    dinero que sigue en el monedero). Las dos son descuadres.
 *  - SALE LO SOLICITADO. La comisión reduce lo que LLEGA, no lo que sale: los libros cuadran en lo
 *    pedido. Aquí no se resta ni se estima nada — estimar una comisión es inventar una cifra.
 *  - LOS DATOS DE PAGO NO SALEN. Ni en el DTO propio, ni en el resultado de la solicitud.
 *
 * Para romperlo a propósito: debitar `importe - comision` (rojo), sacar el `create` de la retirada
 * del `trasAplicar` (rojo: deja de ser atómico), o meter `datosPago` en el DTO (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CURRENCY, RETIRADA_MINIMA_CENTS } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { claveRetirada } from "../src/lib/retirada";

vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "x".repeat(40), AUTH_SECRET: "TEST-FIXTURE-auth-secret-retiradas" },
}));

import { misRetiradas, solicitarRetirada } from "../src/server/services/retirada";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;

const IBAN_OK = "ES9121000418450200051332";
const TRON_OK = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
const ETH_OK = "0x52908400098527886E0F7030069857D2E4169EE7";

const BANCO = { metodo: "BANK", iban: IBAN_OK, titular: "Marta Ruiz" } as const;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma);
});

/** Pone saldo del modo honesto: por el ledger, no con un UPDATE a mano. */
async function conSaldo(cents: number): Promise<void> {
  const { applyWallet } = await import("../src/server/services/ledger");
  await applyWallet(prisma, {
    userId,
    amountCents: cents,
    currency: DEFAULT_CURRENCY,
    entryType: "CREDIT",
    idempotencyKey: `semilla:${userId}:${cents}`,
  });
}

const saldo = async (): Promise<number> =>
  (
    await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { walletBalanceCents: true },
    })
  ).walletBalanceCents;

describe("la puerta del mínimo", () => {
  it("por debajo del mínimo no se puede pedir, ni llamando al servicio directamente", async () => {
    await conSaldo(RETIRADA_MINIMA_CENTS - 1);

    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: RETIRADA_MINIMA_CENTS - 1,
      destino: BANCO,
      clave: "11111111-2222-4333-8444-555555555555",
    });

    expect(r.ok).toBe(false);
    expect(r.rechazo).toBe("BAJO_MINIMO");
    expect(await saldo(), "se debitó algo pese al rechazo").toBe(RETIRADA_MINIMA_CENTS - 1);
    expect(await prisma.withdrawal.count()).toBe(0);
  });

  it("y el mínimo se comprueba ANTES que el saldo: el mensaje tiene que ser el útil", async () => {
    // Quien tiene 20 € y pide 20 € necesita saber que el mínimo son 50 €, no que le falta saldo —
    // lo segundo es falso y además le haría intentarlo otra vez.
    await conSaldo(RETIRADA_MINIMA_CENTS * 2);
    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 100,
      destino: BANCO,
      clave: "11111111-2222-4333-8444-555555555556",
    });
    expect(r.rechazo).toBe("BAJO_MINIMO");
  });

  it("pedir más de lo que hay: ni retirada ni débito", async () => {
    await conSaldo(RETIRADA_MINIMA_CENTS);
    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: RETIRADA_MINIMA_CENTS + 1,
      destino: BANCO,
      clave: "11111111-2222-4333-8444-555555555557",
    });
    expect(r.rechazo).toBe("SIN_SALDO");
    expect(await saldo()).toBe(RETIRADA_MINIMA_CENTS);
    expect(await prisma.withdrawal.count()).toBe(0);
  });
});

describe("el dinero sale al pedir", () => {
  it("se debita el importe SOLICITADO, entero, y nace la retirada en PENDING", async () => {
    await conSaldo(20_000);

    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      destino: BANCO,
      clave: "11111111-2222-4333-8444-555555555558",
    });

    expect(r.ok).toBe(true);
    expect(r.creada).toBe(true);
    expect(await saldo(), "lo debitado no es lo solicitado").toBe(12_500);

    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.retiradaId! } });
    expect(w.amountCents, "la retirada guarda el importe en positivo").toBe(7500);
    expect(w.status).toBe("PENDING");
    expect(w.metodo).toBe("BANK");

    const mov = await prisma.walletLedger.findMany({
      where: { userId, entryType: "DEBIT" },
      select: { amountCents: true, refType: true, refId: true },
    });
    expect(mov).toEqual([{ amountCents: -7500, refType: "WITHDRAWAL", refId: r.retiradaId }]);
  });

  it("el doble envío del MISMO intento no debita dos veces", async () => {
    await conSaldo(20_000);
    const clave = "11111111-2222-4333-8444-555555555559";
    const uno = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      destino: BANCO,
      clave,
    });
    const dos = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      destino: BANCO,
      clave,
    });

    expect(dos.ok).toBe(true);
    expect(dos.creada, "la segunda creó otra retirada").toBe(false);
    expect(dos.retiradaId).toBe(uno.retiradaId);
    expect(await saldo()).toBe(12_500);
    expect(await prisma.withdrawal.count()).toBe(1);
    expect(await prisma.walletLedger.count({ where: { entryType: "DEBIT" } })).toBe(1);
  });

  it("y DOS intentos distintos no pueden gastar el mismo dinero", async () => {
    // Es la razón de debitar al pedir: el segundo se queda sin saldo él solo, sin un `if` que lo
    // impida. Con el saldo intacto hasta el pago, los dos serían "válidos" y alguien pagaría doble.
    await conSaldo(10_000);
    const a = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      destino: BANCO,
      clave: "22222222-2222-4333-8444-555555555551",
    });
    const b = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      destino: BANCO,
      clave: "22222222-2222-4333-8444-555555555552",
    });

    expect(a.ok).toBe(true);
    expect(b.rechazo).toBe("SIN_SALDO");
    expect(await saldo()).toBe(2500);
    expect(await prisma.withdrawal.count()).toBe(1);
  });

  it("la retirada y el débito son ATÓMICOS: no hay uno sin el otro", async () => {
    await conSaldo(20_000);
    await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      destino: BANCO,
      clave: "33333333-2222-4333-8444-555555555551",
    });

    const retiradas = await prisma.withdrawal.count();
    const debitos = await prisma.walletLedger.count({ where: { entryType: "DEBIT" } });
    expect(retiradas).toBe(debitos);
    expect(retiradas).toBe(1);
  });
});

describe("el destino: la red se exige y se contrasta", () => {
  beforeEach(async () => {
    await conSaldo(20_000);
  });

  const pedir = (destino: Parameters<typeof solicitarRetirada>[1]["destino"], n: string) =>
    solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      destino,
      clave: `44444444-2222-4333-8444-55555555555${n}`,
    });

  it("cripto por su red correcta: pasa", async () => {
    const r = await pedir({ metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" }, "1");
    expect(r.ok).toBe(true);
    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.retiradaId! } });
    expect(w.red).toBe("TRC20");
  });

  it("una dirección de OTRA red se rechaza aunque sea válida en la suya", async () => {
    // El fallo más caro de la pieza: un envío de cripto es irreversible. Una dirección de Ethereum
    // es perfectamente válida… en Ethereum. Por TRON, ese dinero desaparece.
    const r = await pedir({ metodo: "CRYPTO", direccion: ETH_OK, red: "TRC20" }, "2");
    expect(r.rechazo).toBe("DIRECCION_NO_ES_DE_LA_RED");
    expect(await saldo()).toBe(20_000);
    expect(await prisma.withdrawal.count()).toBe(0);
  });

  it("una red que DareFlash no envía se rechaza", async () => {
    const r = await pedir({ metodo: "CRYPTO", direccion: TRON_OK, red: "BEP20" as never }, "3");
    expect(r.rechazo).toBe("RED_NO_SOPORTADA");
    expect(await prisma.withdrawal.count()).toBe(0);
  });

  it("un IBAN inválido se rechaza antes de tocar el saldo", async () => {
    const r = await pedir({ metodo: "BANK", iban: "NO-ES-UN-IBAN", titular: "Marta" }, "4");
    expect(r.rechazo).toBe("IBAN_INVALIDO");
    expect(await saldo()).toBe(20_000);
  });

  it("un banco sin titular se rechaza", async () => {
    const r = await pedir({ metodo: "BANK", iban: IBAN_OK, titular: " " }, "5");
    expect(r.rechazo).toBe("TITULAR_VACIO");
  });
});

describe("los datos de pago no salen de aquí", () => {
  it("se guardan CIFRADOS: el IBAN no está en claro en la fila", async () => {
    await conSaldo(20_000);
    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      destino: BANCO,
      clave: "55555555-2222-4333-8444-555555555551",
    });

    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.retiradaId! } });
    expect(w.datosPago, "el IBAN está en claro en la base de datos").not.toContain(IBAN_OK);
    expect(w.datosPago, "el titular está en claro").not.toContain("Marta");
    expect(w.datosPago, "no está cifrado con el formato versionado").toMatch(/^v1:/);
    // Lo que SÍ se puede enseñar: los cuatro últimos, para reconocer la fila.
    expect(w.pista).toBe(IBAN_OK.slice(-4));
  });

  it("y el DTO del historial propio no los lleva: la puerta es el DTO", async () => {
    await conSaldo(20_000);
    await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      destino: BANCO,
      clave: "55555555-2222-4333-8444-555555555552",
    });

    const mias = await misRetiradas(prisma, userId);
    expect(mias.length).toBe(1);
    expect(JSON.stringify(mias), "los datos de pago viajan en el DTO del usuario").not.toMatch(
      /datosPago|iban|titular/i,
    );
    expect(mias[0]!.pista).toBe(IBAN_OK.slice(-4));
  });

  it("el resultado de la solicitud tampoco los devuelve", async () => {
    await conSaldo(20_000);
    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      destino: { metodo: "CRYPTO", direccion: TRON_OK, red: "ERC20" as never },
      clave: "55555555-2222-4333-8444-555555555553",
    });
    expect(JSON.stringify(r)).not.toContain(TRON_OK);
  });
});

describe("sin cifrado no se piden datos de pago", () => {
  it("falla cerrada: ni retirada ni débito", async () => {
    // Lo contrario —guardar el IBAN en claro "mientras tanto"— es exactamente la fuga que el
    // cifrado evita, y además silenciosa. Que la solicitud falle es ruidoso, y lo ruidoso se arregla.
    vi.resetModules();
    vi.doMock("@/config/env", () => ({ env: { PAGOS_SECRET: undefined } }));
    const { solicitarRetirada: sinClave } = await import("../src/server/services/retirada");

    await conSaldo(20_000);
    const r = await sinClave(prisma, {
      userId,
      importeCents: 6000,
      destino: BANCO,
      clave: "66666666-2222-4333-8444-555555555551",
    });

    expect(r.rechazo).toBe("SIN_CIFRADO");
    expect(await saldo()).toBe(20_000);
    expect(await prisma.withdrawal.count()).toBe(0);
    vi.doUnmock("@/config/env");
    vi.resetModules();
  });
});

describe("la clave de idempotencia va por usuario", () => {
  it("dos personas con la misma clave de formulario no se pisan", async () => {
    const otro = await crearUsuario(prisma, { username: "la_otra" });
    const clave = "77777777-2222-4333-8444-555555555551";
    await conSaldo(20_000);
    const { applyWallet } = await import("../src/server/services/ledger");
    await applyWallet(prisma, {
      userId: otro,
      amountCents: 20_000,
      currency: DEFAULT_CURRENCY,
      entryType: "CREDIT",
      idempotencyKey: `semilla:${otro}`,
    });

    const a = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      destino: BANCO,
      clave,
    });
    const b = await solicitarRetirada(prisma, {
      userId: otro,
      importeCents: 6000,
      destino: BANCO,
      clave,
    });

    expect(a.creada).toBe(true);
    expect(b.creada, "la clave de una persona bloqueó la de otra").toBe(true);
    expect(claveRetirada(userId, clave)).not.toBe(claveRetirada(otro, clave));
    expect(await prisma.withdrawal.count()).toBe(2);
  });
});
