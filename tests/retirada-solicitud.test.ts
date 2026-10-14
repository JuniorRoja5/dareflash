/**
 * SOLICITAR UNA RETIRADA — la pieza en la que el dinero SALE del monedero.
 *
 * Los casos ejecutan el servicio real contra la base de datos: ninguno escribe un `WalletLedger` ni
 * una `Withdrawal` a mano. Lo que se fija:
 *
 *  - EL DINERO SALE AL PEDIR, no al pagar. La alternativa —dejar el saldo hasta que el admin
 *    transfiera— crea un estado en el que el dinero está pedido Y disponible, y ese estado se puede
 *    pedir otra vez. Debitar al pedir cierra esa puerta sin un solo `if`.
 *  - LA FILA Y EL DÉBITO VAN JUNTOS. Si fueran dos pasos, un fallo entre medias dejaría dinero
 *    debitado sin retirada (la persona pierde el saldo) o una retirada sin débito (se paga con
 *    dinero que sigue en el monedero). Las dos son descuadres.
 *  - SALE LO SOLICITADO. La comisión reduce lo que LLEGA, no lo que sale: los libros cuadran en lo
 *    pedido. Aquí no se resta ni se estima nada — estimar una comisión es inventar una cifra.
 *  - SE PIDE CONTRA UN MÉTODO GUARDADO, y la retirada se queda con una COPIA de sus datos. Borrar
 *    o cambiar el método NO reescribe a dónde iba un pago ya pedido.
 *  - LOS DATOS DE PAGO NO SALEN. Ni en el DTO propio, ni en el resultado de la solicitud.
 *
 * Para romperlo a propósito: debitar `importe - comision` (rojo), sacar el `create` de la retirada
 * del `trasAplicar` (rojo: deja de ser atómico), guardar `metodoPagoId` en vez de copiar los datos
 * (rojo: el caso del snapshot), o meter `datosPago` en el DTO (rojo).
 *
 * La VALIDACIÓN del destino ya no vive en este camino: vive donde el dato entra en claro, o sea al
 * guardar el método. Sus casos están en `metodos-pago.test.ts`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CURRENCY, RETIRADA_MINIMA_CENTS } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { claveRetirada, type DestinoRetirada } from "../src/lib/retirada";

vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "x".repeat(40), AUTH_SECRET: "TEST-FIXTURE-auth-secret-retiradas" },
}));

import { guardarMetodoPago } from "../src/server/services/metodos-pago";
import { misRetiradas, solicitarRetirada } from "../src/server/services/retirada";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;

const IBAN_OK = "ES9121000418450200051332";
const TRON_OK = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";

const BANCO: DestinoRetirada = { metodo: "BANK", iban: IBAN_OK, titular: "Marta Ruiz" };

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
async function conSaldo(cents: number, deQuien = ""): Promise<void> {
  const quien = deQuien || userId;
  const { applyWallet } = await import("../src/server/services/ledger");
  await applyWallet(prisma, {
    userId: quien,
    amountCents: cents,
    currency: DEFAULT_CURRENCY,
    entryType: "CREDIT",
    idempotencyKey: `semilla:${quien}:${cents}`,
  });
}

/** Guarda un método de cobro y devuelve su id. Es el paso previo a cualquier solicitud. */
async function conMetodo(destino: DestinoRetirada = BANCO, deQuien = ""): Promise<string> {
  const r = await guardarMetodoPago(prisma, { userId: deQuien || userId, destino });
  if (!r.ok) throw new Error(`la fixture no pudo guardar el método: ${r.rechazo}`);
  return r.id;
}

const saldo = async (deQuien = ""): Promise<number> =>
  (
    await prisma.user.findUniqueOrThrow({
      where: { id: deQuien || userId },
      select: { walletBalanceCents: true },
    })
  ).walletBalanceCents;

describe("la puerta del mínimo", () => {
  it("por debajo del mínimo no se puede pedir, ni llamando al servicio directamente", async () => {
    await conSaldo(RETIRADA_MINIMA_CENTS - 1);
    const metodoPagoId = await conMetodo();

    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: RETIRADA_MINIMA_CENTS - 1,
      metodoPagoId,
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
      metodoPagoId: await conMetodo(),
      clave: "11111111-2222-4333-8444-555555555556",
    });
    expect(r.rechazo).toBe("BAJO_MINIMO");
  });

  it("pedir más de lo que hay: ni retirada ni débito", async () => {
    await conSaldo(RETIRADA_MINIMA_CENTS);
    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: RETIRADA_MINIMA_CENTS + 1,
      metodoPagoId: await conMetodo(),
      clave: "11111111-2222-4333-8444-555555555557",
    });
    expect(r.rechazo).toBe("SIN_SALDO");
    expect(await saldo()).toBe(RETIRADA_MINIMA_CENTS);
    expect(await prisma.withdrawal.count()).toBe(0);
  });
});

describe("sin un método guardado no se pide nada", () => {
  it("un id que no existe se rechaza sin tocar el saldo", async () => {
    await conSaldo(20_000);
    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      metodoPagoId: "no-existe",
      clave: "88888888-2222-4333-8444-555555555551",
    });

    expect(r.rechazo).toBe("METODO_NO_EXISTE");
    expect(await saldo()).toBe(20_000);
    expect(await prisma.withdrawal.count()).toBe(0);
  });

  it("y el método DE OTRA PERSONA tampoco: la autorización va en el `where`", async () => {
    // Si fuera un `if` después de leer, un `select` que un día deja de traer `userId` convierte el
    // chequeo en `undefined !== userId` -> siempre verdadero, y el cobro se iría a la cuenta de otra
    // persona. En el `where` no se puede olvidar: la fila simplemente no aparece.
    const otra = await crearUsuario(prisma, { username: "la_otra" });
    const suyo = await conMetodo(BANCO, otra);
    await conSaldo(20_000);

    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      metodoPagoId: suyo,
      clave: "88888888-2222-4333-8444-555555555552",
    });

    // Mismo rechazo que si no existiera: nadie averigua por la respuesta que el método de otra
    // persona existe.
    expect(r.rechazo).toBe("METODO_NO_EXISTE");
    expect(await saldo()).toBe(20_000);
    expect(await prisma.withdrawal.count()).toBe(0);
  });
});

describe("el dinero sale al pedir", () => {
  it("se debita el importe SOLICITADO, entero, y nace la retirada en PENDING", async () => {
    await conSaldo(20_000);

    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      metodoPagoId: await conMetodo(),
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
    const metodoPagoId = await conMetodo();
    const clave = "11111111-2222-4333-8444-555555555559";
    const uno = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      metodoPagoId,
      clave,
    });
    const dos = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      metodoPagoId,
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
    const metodoPagoId = await conMetodo();
    const a = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      metodoPagoId,
      clave: "22222222-2222-4333-8444-555555555551",
    });
    const b = await solicitarRetirada(prisma, {
      userId,
      importeCents: 7500,
      metodoPagoId,
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
      metodoPagoId: await conMetodo(),
      clave: "33333333-2222-4333-8444-555555555551",
    });

    const retiradas = await prisma.withdrawal.count();
    const debitos = await prisma.walletLedger.count({ where: { entryType: "DEBIT" } });
    expect(retiradas).toBe(debitos);
    expect(retiradas).toBe(1);
  });
});

describe("la retirada se queda con una COPIA del método, no con un puntero", () => {
  it("copia el blob cifrado TAL CUAL, con su pista y su red", async () => {
    await conSaldo(20_000);
    const metodoPagoId = await conMetodo({ metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" });
    const guardado = await prisma.paymentMethod.findUniqueOrThrow({ where: { id: metodoPagoId } });

    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      metodoPagoId,
      clave: "99999999-2222-4333-8444-555555555551",
    });

    const w = await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.retiradaId! } });
    // El MISMO blob: se copia sin descifrar, así que la dirección no llega a estar en claro por este
    // camino. Si se descifrara y volviera a cifrar, el texto cambiaría (IV aleatorio) y este caso se
    // pondría rojo — que es justo lo que se quiere saber.
    expect(w.datosPago).toBe(guardado.datosPago);
    expect(w.metodo).toBe("CRYPTO");
    expect(w.red).toBe("TRC20");
    expect(w.pista).toBe(TRON_OK.slice(-4));
  });

  it("BORRAR el método NO cambia a dónde iba una solicitud ya pedida", async () => {
    // Con una referencia al `PaymentMethod`, el admin se encontraría una retirada pendiente sin
    // destino —o, peor, con el destino de otro método— y tendría que preguntar. Lo que se pidió no
    // se puede editar después.
    await conSaldo(20_000);
    const metodoPagoId = await conMetodo();
    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      metodoPagoId,
      clave: "99999999-2222-4333-8444-555555555552",
    });
    const antes = await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.retiradaId! } });

    const { borrarMetodoPago } = await import("../src/server/services/metodos-pago");
    expect((await borrarMetodoPago(prisma, { userId, metodoId: metodoPagoId })).borrado).toBe(true);

    const despues = await prisma.withdrawal.findUniqueOrThrow({ where: { id: r.retiradaId! } });
    expect(despues.datosPago).toBe(antes.datosPago);
    expect(despues.pista).toBe(antes.pista);
    expect(despues.status).toBe("PENDING");
  });
});

describe("los datos de pago no salen de aquí", () => {
  it("se guardan CIFRADOS: el IBAN no está en claro en la fila", async () => {
    await conSaldo(20_000);
    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      metodoPagoId: await conMetodo(),
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
      metodoPagoId: await conMetodo(),
      clave: "55555555-2222-4333-8444-555555555552",
    });

    const mias = await misRetiradas(prisma, userId);
    expect(mias.items.length).toBe(1);
    expect(JSON.stringify(mias), "los datos de pago viajan en el DTO del usuario").not.toMatch(
      /datosPago|iban|titular/i,
    );
    // Y tampoco QUIÉN la procesó: el handle del admin que firma un movimiento es traza interna,
    // igual que la nota de un ajuste de puntos. No se le enseña a su dueño.
    expect(JSON.stringify(mias), "el admin que la procesó viaja en el DTO").not.toMatch(
      /procesadaPor/i,
    );
    expect(mias.items[0]!.pista).toBe(IBAN_OK.slice(-4));
  });

  it("el resultado de la solicitud tampoco los devuelve", async () => {
    await conSaldo(20_000);
    const r = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      metodoPagoId: await conMetodo({ metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" }),
      clave: "55555555-2222-4333-8444-555555555553",
    });
    expect(JSON.stringify(r)).not.toContain(TRON_OK);
  });
});

describe("la clave de idempotencia va por usuario", () => {
  it("dos personas con la misma clave de formulario no se pisan", async () => {
    const otro = await crearUsuario(prisma, { username: "la_otra" });
    const clave = "77777777-2222-4333-8444-555555555551";
    await conSaldo(20_000);
    await conSaldo(20_000, otro);

    const a = await solicitarRetirada(prisma, {
      userId,
      importeCents: 6000,
      metodoPagoId: await conMetodo(),
      clave,
    });
    const b = await solicitarRetirada(prisma, {
      userId: otro,
      importeCents: 6000,
      metodoPagoId: await conMetodo(BANCO, otro),
      clave,
    });

    expect(a.creada).toBe(true);
    expect(b.creada, "la clave de una persona bloqueó la de otra").toBe(true);
    expect(claveRetirada(userId, clave)).not.toBe(claveRetirada(otro, clave));
    expect(await prisma.withdrawal.count()).toBe(2);
  });
});
