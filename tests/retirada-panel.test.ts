/**
 * EL PANEL DE RETIRADAS — la máquina de estados y el único movimiento de dinero que queda.
 *
 *  - SOLO SE VA A DONDE SE PUEDE IR. `PAID` y `REJECTED` son FINALES: volver a rechazar una
 *    rechazada devolvería el dinero DOS veces, y "finalizar" una ya pagada invita a transferir otra
 *    vez. Y saltar de PENDING a PAID directo se salta el único punto donde alguien mira el IBAN
 *    antes de mandar dinero.
 *  - RECHAZAR DEVUELVE EL IMPORTE EXACTO, y una sola vez. Es la única transición que mueve saldo:
 *    el dinero ya salió al solicitar, así que aceptar o marcar el envío no mueven nada.
 *  - CADA TRANSICIÓN DEJA TRAZA, con quién, de dónde y a dónde. Es dinero.
 *  - LOS DATOS DE PAGO NO ENTRAN EN LA TRAZA. Un `AuditLog` se lee, se exporta y se copia.
 *
 * Para romperlo a propósito: permitir PENDING -> PAID (rojo), hacer que aceptar mueva saldo (rojo),
 * o derivar la clave del reembolso del momento en vez de la retirada (rojo: devuelve dos veces).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CURRENCY } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "p".repeat(40), AUTH_SECRET: "TEST-FIXTURE-auth-secret-panel-retiradas" },
}));

import { listarRetiradas, transicionarRetirada } from "../src/server/services/retirada-admin";
import { solicitarRetirada } from "../src/server/services/retirada";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;
let adminId: string;
let n = 0;

const IBAN_OK = "ES9121000418450200051332";
const BANCO = { metodo: "BANK", iban: IBAN_OK, titular: "Marta Ruiz" } as const;
/** Rechazar EXIGE un motivo desde que existe la lista cerrada: la fixture lleva uno de verdad. */
const MOTIVO = "DATOS_BANCARIOS";

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  n = 0;
  userId = await crearUsuario(prisma);
  adminId = await crearUsuario(prisma, { username: "la_admin" });
});

/** Deja una retirada PENDING de `cents`, por el camino real (saldo por ledger + solicitud). */
async function pedir(cents = 7500): Promise<string> {
  n += 1;
  const { applyWallet } = await import("../src/server/services/ledger");
  await applyWallet(prisma, {
    userId,
    amountCents: cents,
    currency: DEFAULT_CURRENCY,
    entryType: "CREDIT",
    idempotencyKey: `semilla:${userId}:${n}`,
  });
  // Un método guardado por solicitud: el destino ya no se teclea al pedir, se elige de los que la
  // persona configuró. Ver `metodos-pago`.
  const { guardarMetodoPago } = await import("../src/server/services/metodos-pago");
  const m = await guardarMetodoPago(prisma, { userId, destino: BANCO });
  expect(m.ok, "la fixture no pudo guardar el método de cobro").toBe(true);
  const r = await solicitarRetirada(prisma, {
    userId,
    importeCents: cents,
    metodoPagoId: m.ok ? m.id : "",
    clave: `8888888${n}-2222-4333-8444-555555555551`,
  });
  expect(r.ok, "la solicitud de prueba no salió").toBe(true);
  return r.retiradaId!;
}

const saldo = async (): Promise<number> =>
  (
    await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { walletBalanceCents: true },
    })
  ).walletBalanceCents;

const estadoDe = async (id: string): Promise<string> =>
  (await prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status;

describe("la máquina de estados", () => {
  it("el camino normal: PENDING -> APPROVED -> PROCESSING -> PAID", async () => {
    const id = await pedir();
    for (const hasta of ["APPROVED", "PROCESSING", "PAID"] as const) {
      const r = await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta });
      expect(r.ok, `no dejó ir a ${hasta}`).toBe(true);
      expect(await estadoDe(id)).toBe(hasta);
    }
  });

  it("PENDING -> PAID directo se rechaza: se saltaría la revisión del destino", async () => {
    const id = await pedir();
    const r = await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "PAID" });
    expect(r.ok).toBe(false);
    expect(r.rechazo).toBe("TRANSICION_INVALIDA");
    expect(await estadoDe(id)).toBe("PENDING");
  });

  it("una PAGADA es final: no se puede tocar", async () => {
    const id = await pedir();
    for (const hasta of ["APPROVED", "PROCESSING", "PAID"] as const) {
      await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta });
    }
    for (const hasta of ["APPROVED", "PROCESSING", "PAID", "REJECTED"] as const) {
      // Con motivo SOLO al rechazar: en el resto, mandarlo es un rechazo aparte (`TEXTO_SOBRA`), y
      // lo que este caso mide es que el estado final no se mueve, no esa otra regla.
      const r = await transicionarRetirada(prisma, {
        retiradaId: id,
        adminId,
        hasta,
        ...(hasta === "REJECTED" ? { motivo: MOTIVO } : {}),
      });
      expect(r.ok, `dejó mover una pagada a ${hasta}`).toBe(false);
    }
    expect(await estadoDe(id)).toBe("PAID");
  });

  it("una RECHAZADA es final: y eso es lo que impide devolver el dinero dos veces", async () => {
    const id = await pedir(7500);
    await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: MOTIVO,
    });
    const antes = await saldo();

    const otra = await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: MOTIVO,
    });

    expect(otra.ok).toBe(false);
    expect(await saldo(), "devolvió el dinero dos veces").toBe(antes);
  });

  it("y aunque el estado se manipule, la CLAVE impide devolver dos veces", async () => {
    // ┌─ LA SEGUNDA DEFENSA, QUE NADIE PROBABA ──────────────────────────────────────────────────┐
    // │ La máquina de estados ya impide salir de REJECTED, así que el reembolso no se intenta dos │
    // │ veces por el camino normal — y por eso un diente que rompía la clave de idempotencia      │
    // │ salía VERDE: la otra defensa lo tapaba. Son dos cierres independientes sobre el mismo     │
    // │ error, y en dinero eso es lo que corresponde; lo que no vale es tener atado solo uno.     │
    // │ Aquí se fuerza el estado a mano —algo que no debería pasar, pero que un arreglo manual en │
    // │ la base de datos o un bug futuro podrían provocar— y se comprueba que el dinero NO vuelve │
    // │ otra vez, porque la clave sale de la retirada y ya se usó.                                 │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    const id = await pedir(7500);
    await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: MOTIVO,
    });
    expect(await saldo()).toBe(7500);

    await prisma.withdrawal.update({ where: { id }, data: { status: "PENDING" } });
    const otra = await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: MOTIVO,
    });

    expect(otra.ok, "la transición en sí es válida desde PENDING").toBe(true);
    expect(otra.devueltoCents, "volvió a devolver dinero").toBe(0);
    expect(await saldo(), "el dinero se devolvió dos veces").toBe(7500);
    expect(await prisma.walletLedger.count({ where: { refType: "WITHDRAWAL_REFUND" } })).toBe(1);
  });

  it("una retirada que no existe no se mueve", async () => {
    const r = await transicionarRetirada(prisma, {
      retiradaId: "no-existe",
      adminId,
      hasta: "APPROVED",
    });
    expect(r.rechazo).toBe("NO_EXISTE");
  });
});

describe("rechazar es lo ÚNICO que mueve dinero", () => {
  it("devuelve el importe exacto al monedero", async () => {
    const id = await pedir(7500);
    expect(await saldo(), "el dinero no había salido al pedir").toBe(0);

    const r = await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: MOTIVO,
    });

    expect(r.devueltoCents).toBe(7500);
    expect(await saldo()).toBe(7500);
    const credito = await prisma.walletLedger.findMany({
      where: { userId, refType: "WITHDRAWAL_REFUND" },
      select: { amountCents: true, entryType: true, refId: true },
    });
    expect(credito).toEqual([{ amountCents: 7500, entryType: "CREDIT", refId: id }]);
  });

  it("rechazar una APROBADA también devuelve", async () => {
    const id = await pedir(6000);
    await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "APPROVED" });
    await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: MOTIVO,
    });
    expect(await saldo()).toBe(6000);
  });

  it("aceptar, poner en proceso y finalizar NO mueven el saldo", async () => {
    const id = await pedir(7500);
    for (const hasta of ["APPROVED", "PROCESSING", "PAID"] as const) {
      const r = await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta });
      expect(r.devueltoCents, `${hasta} movió dinero`).toBe(0);
      expect(await saldo(), `${hasta} movió el saldo`).toBe(0);
    }
    expect(await prisma.walletLedger.count({ where: { entryType: "CREDIT", userId } })).toBe(1); // solo la semilla
  });
});

/**
 * EL PORQUÉ DEL RECHAZO. Lo lee la persona a la que le acaban de rechazar su dinero, así que es
 * obligatorio y viaja con el estado. Las reglas de la LISTA (qué claves hay, qué frase dice cada
 * una, el fail-open) son puras y están en `motivo-rechazo`; aquí se comprueba lo que toca la BD.
 */
describe("rechazar exige decir por qué", () => {
  it("sin motivo no se rechaza, y el dinero NO se mueve", async () => {
    const id = await pedir(7500);

    const r = await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "REJECTED" });

    expect(r.ok).toBe(false);
    expect(r.rechazo).toBe("MOTIVO_OBLIGATORIO");
    // Lo que de verdad importa: el "no se ha podido" no hizo nada. Si el motivo se validara DESPUÉS
    // del reembolso, este caso encontraría 7500 en el monedero y la retirada en PENDING.
    expect(await saldo(), "devolvió el dinero y luego dijo que no").toBe(0);
    expect(await estadoDe(id)).toBe("PENDING");
    expect(await prisma.walletLedger.count({ where: { refType: "WITHDRAWAL_REFUND" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "WITHDRAWAL_TRANSITION" } })).toBe(0);
  });

  it("«Otro» sin texto tampoco, y tampoco mueve nada", async () => {
    const id = await pedir(7500);
    const r = await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: "OTRO",
    });
    expect(r.rechazo).toBe("TEXTO_OBLIGATORIO");
    expect(await saldo()).toBe(0);
    expect(await estadoDe(id)).toBe("PENDING");
  });

  it("y un motivo colgado de un ACEPTAR se rechaza: no es un rechazo", async () => {
    // Un motivo de rechazo guardado sobre un cobro que siguió adelante acabaría en la pantalla de
    // la persona diciéndole por qué le rechazaron algo que no le rechazaron.
    const id = await pedir();
    const r = await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "APPROVED",
      motivo: MOTIVO,
    });
    expect(r.rechazo).toBe("TEXTO_SOBRA");
    expect(await estadoDe(id)).toBe("PENDING");
  });

  it("MOTIVO Y ESTADO SE ESCRIBEN JUNTOS: no hay rechazada sin razón", async () => {
    const id = await pedir(7500);
    await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: "RED_INCORRECTA",
    });

    const fila = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    expect(fila.status).toBe("REJECTED");
    expect(fila.motivoRechazo, "se rechazó sin guardar el motivo").toBe("RED_INCORRECTA");
    // Una clave de la lista NO guarda texto: su frase ya está escrita y revisada.
    expect(fila.motivoRechazoTexto).toBeNull();
    expect(await saldo(), "el dinero no volvió").toBe(7500);
  });

  it("y «Otro» guarda su texto en SU columna, no dentro de la clave", async () => {
    const TEXTO = "El banco nos devolvió la transferencia sin decir por qué";
    const id = await pedir(6000);
    await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: "OTRO",
      motivoTexto: `  ${TEXTO}  `,
    });

    const fila = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    expect(fila.motivoRechazo).toBe("OTRO");
    expect(fila.motivoRechazoTexto, "el texto no se guardó limpio").toBe(TEXTO);
    // Y la clave sigue siendo una clave: ni un prefijo ni el texto metido dentro.
    expect(fila.motivoRechazo).not.toContain(TEXTO);
  });

  it("el motivo llega hasta el historial del usuario, ya traducido a su frase", async () => {
    const { misRetiradas } = await import("../src/server/services/retirada");
    const { FRASE_RECHAZO } = await import("@/config/constants");
    const id = await pedir(7500);
    await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: "RED_INCORRECTA",
    });

    const mias = await misRetiradas(prisma, userId);
    expect(mias.items[0]!.motivoRechazo).toBe(FRASE_RECHAZO.RED_INCORRECTA);
    // La CLAVE no viaja: lo que sale es la frase, resuelta en el servidor.
    expect(JSON.stringify(mias)).not.toContain("RED_INCORRECTA");
  });

  it("y una rechazada SIN motivo (de antes de la columna) no inventa ninguno", async () => {
    const { misRetiradas } = await import("../src/server/services/retirada");
    const id = await pedir(7500);
    await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: MOTIVO,
    });
    // Como si fuera una fila anterior a la migración.
    await prisma.withdrawal.update({ where: { id }, data: { motivoRechazo: null } });

    const mias = await misRetiradas(prisma, userId);
    expect(mias.items[0]!.motivoRechazo).toBeNull();
  });

  it("una clave que ya no existe cae en la frase genérica, no revienta la lista", async () => {
    const { misRetiradas } = await import("../src/server/services/retirada");
    const { FRASE_RECHAZO_DESCONOCIDO } = await import("@/config/constants");
    const id = await pedir(7500);
    await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: MOTIVO,
    });
    // Un renombrado sin migrar: la fila se queda con una clave que el copy ya no conoce.
    await prisma.withdrawal.update({ where: { id }, data: { motivoRechazo: "YA_NO_EXISTE" } });

    const mias = await misRetiradas(prisma, userId);
    expect(mias.items).toHaveLength(1);
    expect(mias.items[0]!.motivoRechazo).toBe(FRASE_RECHAZO_DESCONOCIDO);
  });

  it("el motivo también queda en la TRAZA: es la decisión que se tomó sobre su dinero", async () => {
    const id = await pedir(7500);
    await transicionarRetirada(prisma, {
      retiradaId: id,
      adminId,
      hasta: "REJECTED",
      motivo: "SOSPECHA_FRAUDE",
    });
    const linea = await prisma.auditLog.findFirstOrThrow({
      where: { action: "WITHDRAWAL_TRANSITION", targetId: id },
    });
    expect(linea.metadata).toMatchObject({ hasta: "REJECTED", motivo: "SOSPECHA_FRAUDE" });
  });
});

describe("la traza de cada transición", () => {
  it("una línea por movimiento, con quién, de dónde y a dónde", async () => {
    const id = await pedir();
    await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "APPROVED" });
    await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "PROCESSING" });

    const lineas = await prisma.auditLog.findMany({
      where: { action: "WITHDRAWAL_TRANSITION", targetId: id },
      orderBy: { createdAt: "asc" },
      select: { actorId: true, targetType: true, metadata: true },
    });
    expect(lineas.length).toBe(2);
    expect(lineas[0]!.actorId, "no consta quién lo movió").toBe(adminId);
    expect(lineas[0]!.targetType).toBe("WITHDRAWAL");
    expect(lineas[0]!.metadata).toMatchObject({ desde: "PENDING", hasta: "APPROVED" });
    expect(lineas[1]!.metadata).toMatchObject({ desde: "APPROVED", hasta: "PROCESSING" });
  });

  it("una transición RECHAZADA no deja traza: no pasó nada", async () => {
    const id = await pedir();
    await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "PAID" });
    expect(await prisma.auditLog.count({ where: { action: "WITHDRAWAL_TRANSITION" } })).toBe(0);
  });

  it("y los DATOS DE PAGO no entran en la traza, NI CIFRADOS", async () => {
    // Un `AuditLog` se lee, se exporta y se copia. Un IBAN dentro sería una fuga por la puerta de
    // atrás, y además no hace falta para auditar una transición.
    //
    // ┌─ "NI CIFRADOS" LLEGÓ POR UN DIENTE VERDE FALSO ──────────────────────────────────────────┐
    // │ La primera versión solo buscaba el IBAN EN CLARO. Metí el blob cifrado en la traza y pasó │
    // │ en verde: no contenía el IBAN legible ni las palabras "iban"/"titular". Pero el cifrado   │
    // │ sigue siendo el dato de pago, viajando a un sitio que se exporta — y basta que la clave   │
    // │ se filtre alguna vez para que esa línea valga lo mismo que el original. Lo que no entra   │
    // │ en la traza es el DATO, en cualquiera de sus formas.                                      │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    const id = await pedir();
    await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "APPROVED" });
    const traza = JSON.stringify(await prisma.auditLog.findMany({ where: { targetId: id } }));
    expect(traza, "el IBAN en claro está en la traza").not.toContain(IBAN_OK);
    expect(traza, "los nombres de los campos de pago están en la traza").not.toMatch(
      /iban|titular|direccion/i,
    );
    expect(traza, "el dato CIFRADO está en la traza").not.toMatch(/datosPago|v1:/);
  });
});

describe("la cola del panel", () => {
  it("descifra el destino: es el único sitio donde el IBAN vuelve a estar en claro", async () => {
    await pedir();
    const [fila] = await listarRetiradas(prisma);
    expect(fila!.destino.iban).toBe(IBAN_OK);
    expect(fila!.destino.titular).toBe("Marta Ruiz");
  });

  it("y trae los SIGUIENTES estados, para que la pantalla no ofrezca lo que no existe", async () => {
    const id = await pedir();
    expect((await listarRetiradas(prisma))[0]!.siguientes).toEqual(["APPROVED", "REJECTED"]);

    await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "APPROVED" });
    expect((await listarRetiradas(prisma))[0]!.siguientes).toEqual(["PROCESSING", "REJECTED"]);

    await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "PROCESSING" });
    expect((await listarRetiradas(prisma))[0]!.siguientes).toEqual(["PAID"]);

    await transicionarRetirada(prisma, { retiradaId: id, adminId, hasta: "PAID" });
    expect((await listarRetiradas(prisma))[0]!.siguientes, "una pagada ofrece algo").toEqual([]);
  });

  it("un dato que no se puede descifrar NO tumba la lista", async () => {
    // Puede pasar si el secreto rota mal. El admin necesita ver el RESTO de la cola igual, y lo que
    // no se hace es enseñar un hueco silencioso: la fila dice que hay un problema.
    const id = await pedir();
    await prisma.withdrawal.update({ where: { id }, data: { datosPago: "v1:aa:bb:cc" } });

    const [fila] = await listarRetiradas(prisma);
    expect(fila!.destino.error).toMatch(/descifrar/i);
    expect(fila!.amountCents, "la fila se perdió entera").toBe(7500);
  });
});
