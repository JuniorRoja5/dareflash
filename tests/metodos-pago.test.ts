/**
 * LOS MÉTODOS DE COBRO GUARDADOS — la única pantalla en la que alguien escribe una dirección.
 *
 * Aquí es donde el dato de pago ENTRA EN CLARO al sistema, así que aquí están las puertas que antes
 * estaban en la solicitud:
 *
 *  - LA FORMA SE VALIDA ANTES DE GUARDAR, y la red se CONTRASTA con la dirección. Si pasa mal de
 *    aquí, el error se congela en todas las solicitudes futuras y un envío de cripto a la red
 *    equivocada no se recupera.
 *  - SE GUARDA CIFRADO, y FALLA CERRADA: sin `PAGOS_SECRET` no se guarda nada. Guardar el IBAN "en
 *    claro mientras tanto" es exactamente la fuga que el cifrado evita, y además silenciosa.
 *  - EL DTO ES LA PUERTA: `datosPago` no sale ni para pintar la lista propia.
 *  - BORRAR AUTORIZA EN EL `where`: el método de otra persona no se borra y se responde lo mismo.
 *
 * Para romperlo a propósito: quitar el `validarDestino` del servicio (rojo en toda la sección del
 * destino), quitar el `cifradoDePagosDisponible()` (rojo: el fallo cerrado), meter `datosPago` en
 * `MetodoPagoPropio` (rojo), o cambiar el `deleteMany` por `delete` del id a secas (rojo: se borra
 * el de otra persona).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import type { DestinoRetirada } from "../src/lib/retirada";

vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "y".repeat(40), AUTH_SECRET: "TEST-FIXTURE-auth-secret-metodos" },
}));

import {
  borrarMetodoPago,
  guardarMetodoPago,
  MAX_METODOS_PAGO,
  misMetodosPago,
  reemplazarMetodoPago,
} from "../src/server/services/metodos-pago";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;

const IBAN_OK = "ES9121000418450200051332";
const TRON_OK = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
const ETH_OK = "0x52908400098527886E0F7030069857D2E4169EE7";

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

describe("guardar un método", () => {
  it("se guarda cifrado y se recupera por la pista, no por el dato", async () => {
    const r = await guardarMetodoPago(prisma, { userId, destino: BANCO });
    expect(r.ok).toBe(true);

    const fila = await prisma.paymentMethod.findUniqueOrThrow({
      where: { id: r.ok ? r.id : "" },
    });
    expect(fila.datosPago, "el IBAN está en claro en la base de datos").not.toContain(IBAN_OK);
    expect(fila.datosPago, "el titular está en claro").not.toContain("Marta");
    expect(fila.datosPago, "no está cifrado con el formato versionado").toMatch(/^v1:/);
    expect(fila.pista).toBe(IBAN_OK.slice(-4));
    expect(fila.metodo).toBe("BANK");
    expect(fila.red, "un banco no tiene red").toBeNull();

    const mios = await misMetodosPago(prisma, userId);
    expect(mios).toEqual([
      {
        id: fila.id,
        metodo: "BANK",
        pista: IBAN_OK.slice(-4),
        red: null,
        createdAt: fila.createdAt,
      },
    ]);
  });

  it("el DTO propio NO lleva los datos de pago: la puerta es el DTO, no el `select`", async () => {
    await guardarMetodoPago(prisma, { userId, destino: BANCO });
    const mios = await misMetodosPago(prisma, userId);
    expect(JSON.stringify(mios), "los datos de pago viajan en el DTO propio").not.toMatch(
      /datosPago|iban|titular|v1:/i,
    );
  });

  it("cripto guarda su red, que es lo que decide por dónde se envía", async () => {
    const r = await guardarMetodoPago(prisma, {
      userId,
      destino: { metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" },
    });
    expect(r.ok).toBe(true);
    const [uno] = await misMetodosPago(prisma, userId);
    expect(uno!.red).toBe("TRC20");
    expect(uno!.pista).toBe(TRON_OK.slice(-4));
  });

  it("solo son MÍOS los míos: la lista de otra persona no se mezcla", async () => {
    const otra = await crearUsuario(prisma, { username: "la_otra" });
    await guardarMetodoPago(prisma, { userId, destino: BANCO });
    await guardarMetodoPago(prisma, {
      userId: otra,
      destino: { metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" },
    });

    expect((await misMetodosPago(prisma, userId)).map((m) => m.metodo)).toEqual(["BANK"]);
    expect((await misMetodosPago(prisma, otra)).map((m) => m.metodo)).toEqual(["CRYPTO"]);
  });

  it("hay un tope, y se mide por persona", async () => {
    for (let i = 0; i < MAX_METODOS_PAGO; i++) {
      const r = await guardarMetodoPago(prisma, { userId, destino: BANCO });
      expect(r.ok, `el método ${i + 1} no entró`).toBe(true);
    }
    const sobra = await guardarMetodoPago(prisma, { userId, destino: BANCO });
    expect(sobra.ok).toBe(false);
    expect(sobra.ok === false && sobra.rechazo).toBe("DEMASIADOS");
    expect(await prisma.paymentMethod.count({ where: { userId } })).toBe(MAX_METODOS_PAGO);

    // Y el tope de una no gasta el de la otra: se cuenta por `userId`, no en global.
    const otra = await crearUsuario(prisma, { username: "la_otra" });
    expect((await guardarMetodoPago(prisma, { userId: otra, destino: BANCO })).ok).toBe(true);
  });
});

describe("el destino: la red se exige y se contrasta", () => {
  const guardar = (destino: DestinoRetirada) => guardarMetodoPago(prisma, { userId, destino });
  const rechazo = async (destino: DestinoRetirada): Promise<string | false> => {
    const r = await guardar(destino);
    return r.ok ? false : r.rechazo;
  };

  it("cripto por su red correcta: pasa", async () => {
    expect((await guardar({ metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" })).ok).toBe(true);
  });

  it("una dirección de OTRA red se rechaza aunque sea válida en la suya", async () => {
    // El fallo más caro de la pieza: un envío de cripto es irreversible. Una dirección de Ethereum
    // es perfectamente válida… en Ethereum. Por TRON, ese dinero desaparece.
    expect(await rechazo({ metodo: "CRYPTO", direccion: ETH_OK, red: "TRC20" })).toBe(
      "DIRECCION_NO_ES_DE_LA_RED",
    );
    expect(await prisma.paymentMethod.count()).toBe(0);
  });

  it("una red que DareFlash no envía se rechaza", async () => {
    expect(await rechazo({ metodo: "CRYPTO", direccion: TRON_OK, red: "BEP20" as never })).toBe(
      "RED_NO_SOPORTADA",
    );
    expect(await prisma.paymentMethod.count()).toBe(0);
  });

  it("un IBAN inválido se rechaza, y no se guarda nada", async () => {
    expect(await rechazo({ metodo: "BANK", iban: "NO-ES-UN-IBAN", titular: "Marta" })).toBe(
      "IBAN_INVALIDO",
    );
    expect(await prisma.paymentMethod.count()).toBe(0);
  });

  it("un banco sin titular se rechaza", async () => {
    expect(await rechazo({ metodo: "BANK", iban: IBAN_OK, titular: " " })).toBe("TITULAR_VACIO");
  });

  it("un método que no es ninguno de los dos se rechaza", async () => {
    expect(await rechazo({ metodo: "PAYPAL" } as never)).toBe("METODO_DESCONOCIDO");
  });
});

describe("sin cifrado no se guarda un dato de pago", () => {
  it("falla cerrada: no se guarda nada en claro 'mientras tanto'", async () => {
    vi.resetModules();
    vi.doMock("@/config/env", () => ({ env: { PAGOS_SECRET: undefined } }));
    const { guardarMetodoPago: sinClave } = await import("../src/server/services/metodos-pago");

    const r = await sinClave(prisma, { userId, destino: BANCO });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.rechazo).toBe("SIN_CIFRADO");
    expect(await prisma.paymentMethod.count()).toBe(0);
    vi.doUnmock("@/config/env");
    vi.resetModules();
  });
});

describe("sustituir un método ('editar')", () => {
  /** El id del método guardado, o revienta: una fixture que calla deja el caso midiendo nada. */
  async function guardar(destino: DestinoRetirada = BANCO, deQuien = ""): Promise<string> {
    const r = await guardarMetodoPago(prisma, { userId: deQuien || userId, destino });
    if (!r.ok) throw new Error(`la fixture no pudo guardar: ${r.rechazo}`);
    return r.id;
  }

  it("el viejo se va y el nuevo entra: nunca quedan los dos", async () => {
    const viejo = await guardar();
    const r = await reemplazarMetodoPago(prisma, {
      userId,
      metodoId: viejo,
      destino: { metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" },
    });

    expect(r.ok).toBe(true);
    const mios = await misMetodosPago(prisma, userId);
    expect(mios).toHaveLength(1);
    expect(mios[0]!.metodo).toBe("CRYPTO");
    expect(mios[0]!.pista).toBe(TRON_OK.slice(-4));
    expect(await prisma.paymentMethod.findUnique({ where: { id: viejo } })).toBeNull();
  });

  it("CON EL TOPE LLENO se puede sustituir: no es un alta", async () => {
    // El tope cuenta lo que quedará, no lo que hay: si contara lo que hay, quien tiene los cinco no
    // podría cambiar una cuenta sin borrar antes —y borrar antes es quedarse sin ninguna si falla—.
    const ids: string[] = [];
    for (let i = 0; i < MAX_METODOS_PAGO; i++) ids.push(await guardar());

    const r = await reemplazarMetodoPago(prisma, {
      userId,
      metodoId: ids[0]!,
      destino: { metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" },
    });

    expect(r.ok, "con el tope lleno no deja ni sustituir").toBe(true);
    expect(await prisma.paymentMethod.count({ where: { userId } })).toBe(MAX_METODOS_PAGO);
  });

  it("UN RECHAZO NO BORRA NADA, que es el fallo que casi se cuela", async () => {
    // ┌───────────────────────────────────────────────────────────────────────────────────────────┐
    // │ La primera versión borraba, contaba y devolvía `DEMASIADOS` si no cabía. Pero DEVOLVER un  │
    // │ valor desde una transacción de Prisma la CONFIRMA (solo revierte si lanza): ese "no se ha  │
    // │ podido" habría dejado a la persona sin su método y con el IBAN recién tecleado perdido.    │
    // │ Aquí se comprueba con el rechazo más fácil de provocar: una forma inválida.                │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    const viejo = await guardar();
    const r = await reemplazarMetodoPago(prisma, {
      userId,
      metodoId: viejo,
      destino: { metodo: "BANK", iban: "NO-ES-UN-IBAN", titular: "Marta" },
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.rechazo).toBe("IBAN_INVALIDO");
    const mios = await misMetodosPago(prisma, userId);
    expect(
      mios.map((m) => m.id),
      "el rechazo se llevó el método por delante",
    ).toEqual([viejo]);
  });

  it("y sin cifrado tampoco: falla cerrada antes de tocar nada", async () => {
    const viejo = await guardar();
    vi.resetModules();
    vi.doMock("@/config/env", () => ({ env: { PAGOS_SECRET: undefined } }));
    const { reemplazarMetodoPago: sinClave } = await import("../src/server/services/metodos-pago");

    const r = await sinClave(prisma, { userId, metodoId: viejo, destino: BANCO });

    expect(r.ok === false && r.rechazo).toBe("SIN_CIFRADO");
    expect(await prisma.paymentMethod.count({ where: { userId } })).toBe(1);
    vi.doUnmock("@/config/env");
    vi.resetModules();
  });

  it("el método de OTRA PERSONA no se sustituye ni se borra", async () => {
    const otra = await crearUsuario(prisma, { username: "la_otra" });
    const suyo = await guardar(BANCO, otra);

    const r = await reemplazarMetodoPago(prisma, {
      userId,
      metodoId: suyo,
      destino: { metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" },
    });

    // La operación se trata como un alta MÍA: el suyo sigue intacto y yo me quedo con uno nuevo.
    expect(r.ok).toBe(true);
    expect(await prisma.paymentMethod.findUnique({ where: { id: suyo } })).not.toBeNull();
    expect(await prisma.paymentMethod.count({ where: { userId: otra } })).toBe(1);
    expect(await prisma.paymentMethod.count({ where: { userId } })).toBe(1);
  });

  it("y el dato nuevo queda CIFRADO, como el de un alta", async () => {
    const viejo = await guardar({ metodo: "CRYPTO", direccion: TRON_OK, red: "TRC20" });
    const r = await reemplazarMetodoPago(prisma, { userId, metodoId: viejo, destino: BANCO });
    const fila = await prisma.paymentMethod.findUniqueOrThrow({ where: { id: r.ok ? r.id : "" } });
    expect(fila.datosPago).not.toContain(IBAN_OK);
    expect(fila.datosPago).toMatch(/^v1:/);
    expect(fila.red, "se quedó la red del método anterior").toBeNull();
  });
});

describe("borrar un método", () => {
  it("el propio se borra", async () => {
    const r = await guardarMetodoPago(prisma, { userId, destino: BANCO });
    const metodoId = r.ok ? r.id : "";

    expect((await borrarMetodoPago(prisma, { userId, metodoId })).borrado).toBe(true);
    expect(await misMetodosPago(prisma, userId)).toEqual([]);
  });

  it("el de OTRA PERSONA no se borra, y se responde lo mismo que si no existiera", async () => {
    // La autorización va en el `where` del `deleteMany`: si fuera un `if` después de leer, un día
    // alguien quita `userId` del `select` y el chequeo pasa a comparar `undefined` — borrando el
    // método de cualquiera que conozca un id.
    const otra = await crearUsuario(prisma, { username: "la_otra" });
    const r = await guardarMetodoPago(prisma, { userId: otra, destino: BANCO });
    const suyo = r.ok ? r.id : "";

    const ajeno = await borrarMetodoPago(prisma, { userId, metodoId: suyo });
    const fantasma = await borrarMetodoPago(prisma, { userId, metodoId: "no-existe" });

    expect(ajeno.borrado, "se borró el método de otra persona").toBe(false);
    expect(fantasma.borrado).toBe(false);
    expect(ajeno).toEqual(fantasma);
    expect(await prisma.paymentMethod.count({ where: { userId: otra } })).toBe(1);
  });
});
