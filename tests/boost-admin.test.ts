/**
 * BOOST DESDE EL PANEL — retirar a una persona, y ajustarle créditos con motivo.
 *
 * ┌─ EL DIENTE CENTRAL DE ESTA PIEZA ─────────────────────────────────────────────────────────────┐
 * │ Quien encadena dos boosts tiene DOS apariciones vigentes. Si "retirar" cortara la fila que el │
 * │ panel pinta —la que devolvería la consulta deduplicada del escaparate—, la otra seguiría viva: │
 * │ el perfil seguiría en la portada y NADA fallaría, porque sigue siendo visible por la que       │
 * │ queda. El único que se enteraría mal es el moderador, convencido de haberlo retirado.          │
 * │                                                                                               │
 * │ Un fallo que solo existe en la cabeza de una persona es el más caro de encontrar, así que aquí │
 * │ se hace ruidoso: tras retirar, CERO vigentes y fuera del escaparate.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y lo demás que el panel tiene que cumplir:
 *  - LA LISTA ES UNA FILA POR PERSONA, CON EL RECUENTO. El recuento no es adorno: es lo que explica
 *    por qué "retirar" va a expirar tres cosas.
 *  - EL AJUSTE CALCA EL DE PUNTOS: motivo obligatorio, idempotente por intención, auditable, y
 *    `allowNegative: false` rechaza quitar más de lo que hay.
 *  - LA NOTA NO VIAJA AL DUEÑO. Existe desde esta pieza, así que hay algo nuevo que podría filtrarse.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AJUSTE_BOOST_DELTA_MAX,
  AJUSTE_DELTA_MAX,
  AJUSTE_NOTA_MIN,
  BOOST_DURACION_MIN,
  RAZON_BOOST_AJUSTE_ADMIN,
} from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  AjusteBoostError,
  ajustarCreditosBoost,
  claveAjusteBoost,
  destacadosPanel,
  fichaBoost,
  retirarDelEscaparate,
} from "../src/server/services/boost-admin";
import { destacadosVigentes } from "../src/server/services/boost-destacados";
import { miHistorialBoosts } from "../src/server/services/boost-historial";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let adminId: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  adminId = await crearUsuario(prisma, { username: "la_admin" });
});

const AHORA = new Date("2026-06-15T12:00:00.000Z");
const MIN = 60_000;

/** Una aparición vigente que empezó hace `haceMin` minutos. */
async function destacar(userId: string, haceMin: number, duracionMin = BOOST_DURACION_MIN) {
  const startsAt = new Date(AHORA.getTime() - haceMin * MIN);
  const a = await prisma.boostActivation.create({
    data: { userId, startsAt, expiresAt: new Date(startsAt.getTime() + duracionMin * MIN) },
  });
  return a.id;
}

const vigentes = (userId: string) =>
  prisma.boostActivation.count({ where: { userId, expiresAt: { gt: AHORA } } });

describe("retirar del escaparate", () => {
  it("EL CASO CENTRAL: con DOS apariciones vigentes, retirar expira LAS DOS", async () => {
    const id = await crearUsuario(prisma, { username: "la_encadenada", boostBalance: 3 });
    await destacar(id, 40);
    await destacar(id, 5);
    expect(await vigentes(id)).toBe(2);

    const r = await retirarDelEscaparate(prisma, id, AHORA);

    expect(r.expiradas, "no expiró las dos").toBe(2);
    expect(await vigentes(id), "quedó una aparición viva").toBe(0);
    // Y lo que de verdad importa: desaparece del escaparate. Con solo una expirada, seguiría ahí.
    expect(await destacadosVigentes(prisma, { ahora: AHORA })).toEqual([]);
  });

  it("con una sola, expira una", async () => {
    const id = await crearUsuario(prisma, { username: "la_sola" });
    await destacar(id, 10);

    expect(await retirarDelEscaparate(prisma, id, AHORA)).toEqual({ expiradas: 1 });
    expect(await destacadosVigentes(prisma, { ahora: AHORA })).toEqual([]);
  });

  it("deja el `expiresAt` exactamente en el instante de retirar", async () => {
    // Si lo pusiera en el pasado reescribiría la historia; si lo dejara en el futuro, no retiraría.
    const id = await crearUsuario(prisma, { username: "la_puntual" });
    await destacar(id, 10);

    await retirarDelEscaparate(prisma, id, AHORA);
    const [a] = await prisma.boostActivation.findMany({ where: { userId: id } });
    expect(a!.expiresAt.toISOString()).toBe(AHORA.toISOString());
  });

  it("NO toca las apariciones YA expiradas: no reescribe el pasado", async () => {
    const id = await crearUsuario(prisma, { username: "la_veterana" });
    const vieja = await destacar(id, BOOST_DURACION_MIN + 60); // terminada hace rato
    const antes = (await prisma.boostActivation.findUniqueOrThrow({ where: { id: vieja } }))
      .expiresAt;
    await destacar(id, 5);

    await retirarDelEscaparate(prisma, id, AHORA);

    const despues = (await prisma.boostActivation.findUniqueOrThrow({ where: { id: vieja } }))
      .expiresAt;
    expect(despues.toISOString()).toBe(antes.toISOString());
  });

  it("NO toca a NADIE más", async () => {
    const mia = await crearUsuario(prisma, { username: "la_retirada" });
    const otra = await crearUsuario(prisma, { username: "la_intacta" });
    await destacar(mia, 10);
    await destacar(otra, 10);

    await retirarDelEscaparate(prisma, mia, AHORA);

    expect(await vigentes(otra), "se llevó por delante a otra persona").toBe(1);
    expect((await destacadosVigentes(prisma, { ahora: AHORA })).map((p) => p.username)).toEqual([
      "la_intacta",
    ]);
  });

  it("NO devuelve el Boost ni toca el saldo", async () => {
    // Cortar por abuso no regala crédito. Si algún día se quiere devolver, es un REFUND explícito.
    const id = await crearUsuario(prisma, { username: "la_cortada", boostBalance: 2 });
    await destacar(id, 10);

    await retirarDelEscaparate(prisma, id, AHORA);

    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(u.boostBalance).toBe(2);
    expect(await prisma.boostLedger.count({ where: { userId: id } })).toBe(0);
  });

  it("es idempotente: retirar a quien no está destacado expira cero y no falla", async () => {
    const id = await crearUsuario(prisma, { username: "la_limpia" });
    expect(await retirarDelEscaparate(prisma, id, AHORA)).toEqual({ expiradas: 0 });

    await destacar(id, 10);
    expect((await retirarDelEscaparate(prisma, id, AHORA)).expiradas).toBe(1);
    expect((await retirarDelEscaparate(prisma, id, AHORA)).expiradas).toBe(0);
  });

  it("y NO impide volver a activar: expira lo de ahora, no pone un veto", async () => {
    // El freno permanente son los controles de cuenta, no esta acción. Decirlo en la pantalla sin
    // que fuera verdad seria peor que no decirlo.
    const id = await crearUsuario(prisma, { username: "la_insistente", boostBalance: 5 });
    await destacar(id, 10);
    await retirarDelEscaparate(prisma, id, AHORA);

    const { activarBoost } = await import("../src/server/services/boost-activacion");
    const r = await activarBoost(prisma, { userId: id, token: "t1", ahora: AHORA });
    expect(r.estado).toBe("activado");
  });
});

describe("la lista del panel: una fila por persona, con su recuento", () => {
  it("quien tiene DOS apariciones sale UNA vez, con el número 2", async () => {
    // Si el panel enseñara dos filas, "retirar" en una de ellas sugeriría que la otra sigue; y si
    // enseñara una SIN el número, nadie sabría que retirar va a expirar dos cosas.
    const id = await crearUsuario(prisma, { username: "la_doble", boostBalance: 1 });
    await destacar(id, 40);
    await destacar(id, 5);

    const filas = await destacadosPanel(prisma, { ahora: AHORA });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ username: "la_doble", apariciones: 2, saldo: 1 });
  });

  it("«desde» es la vigente más ANTIGUA y «hasta» la que termina más TARDE", async () => {
    const id = await crearUsuario(prisma, { username: "la_encadenada" });
    await destacar(id, 40, 90); // de 11:20 a 12:50
    await destacar(id, 5); // de 11:55 a 12:55

    const [f] = await destacadosPanel(prisma, { ahora: AHORA });
    expect(f!.desdeMs).toBe(AHORA.getTime() - 40 * MIN);
    expect(f!.hastaMs).toBe(AHORA.getTime() - 5 * MIN + BOOST_DURACION_MIN * MIN);
  });

  it("el orden es el último en activar primero, como el escaparate", async () => {
    const a = await crearUsuario(prisma, { username: "primera" });
    const b = await crearUsuario(prisma, { username: "segunda" });
    await destacar(a, 30);
    await destacar(b, 5);

    expect((await destacadosPanel(prisma, { ahora: AHORA })).map((f) => f.username)).toEqual([
      "segunda",
      "primera",
    ]);
  });

  it("una aparición EXPIRADA no mete a nadie en la lista", async () => {
    const id = await crearUsuario(prisma, { username: "la_terminada" });
    await destacar(id, BOOST_DURACION_MIN + 10);
    expect(await destacadosPanel(prisma, { ahora: AHORA })).toEqual([]);
  });

  it("y una expirada no infla el recuento de quien sigue vigente", async () => {
    const id = await crearUsuario(prisma, { username: "la_mixta" });
    await destacar(id, BOOST_DURACION_MIN + 10); // terminada
    await destacar(id, 5); // viva

    const [f] = await destacadosPanel(prisma, { ahora: AHORA });
    expect(f!.apariciones, "cuenta apariciones que ya terminaron").toBe(1);
  });

  it("las cuentas SUSPENDIDAS salen, marcadas como no visibles", async () => {
    // La portada las esconde. Si el panel también lo hiciera, un moderador que acaba de banear a
    // alguien no tendría forma de ver que el baneo ya lo sacó del escaparate, y lo seguiría buscando.
    const mala = await crearUsuario(prisma, { username: "la_suspendida" });
    await prisma.user.update({ where: { id: mala }, data: { bannedAt: new Date() } });
    await destacar(mala, 5);
    const buena = await crearUsuario(prisma, { username: "la_normal" });
    await destacar(buena, 10);

    const filas = await destacadosPanel(prisma, { ahora: AHORA });
    expect(filas.map((f) => f.username)).toEqual(["la_suspendida", "la_normal"]);
    expect(filas.find((f) => f.username === "la_suspendida")?.visible).toBe(false);
    expect(filas.find((f) => f.username === "la_normal")?.visible).toBe(true);
    // Y el escaparate sigue sin enseñarla: el panel ve más, no distinto.
    expect((await destacadosVigentes(prisma, { ahora: AHORA })).map((p) => p.username)).toEqual([
      "la_normal",
    ]);
  });

  it("sin nadie destacado, la lista está vacía", async () => {
    await crearUsuario(prisma, { username: "la_que_pasa_por_aqui" });
    expect(await destacadosPanel(prisma, { ahora: AHORA })).toEqual([]);
  });
});

describe("ajustar créditos: calca el ajuste de puntos", () => {
  it("sumar sube el saldo y deja UNA fila con su motivo y su autor", async () => {
    const id = await crearUsuario(prisma, { username: "la_premiada", boostBalance: 1 });

    const r = await ajustarCreditosBoost(prisma, {
      adminId,
      userId: id,
      delta: 3,
      nota: "detalle de soporte por la caída del martes",
      clave: "c1",
    });

    expect(r).toEqual({ aplicado: true, saldo: 4 });
    const [m] = await prisma.boostLedger.findMany({ where: { userId: id } });
    expect(m).toMatchObject({
      delta: 3,
      reason: RAZON_BOOST_AJUSTE_ADMIN,
      refType: "ADMIN",
      refId: adminId,
      nota: "detalle de soporte por la caída del martes",
      amountCents: null,
      currency: null,
    });
  });

  it("restar baja el saldo", async () => {
    const id = await crearUsuario(prisma, { username: "la_corregida", boostBalance: 5 });
    const r = await ajustarCreditosBoost(prisma, {
      adminId,
      userId: id,
      delta: -2,
      nota: "corrección de un regalo duplicado",
      clave: "c1",
    });
    expect(r).toEqual({ aplicado: true, saldo: 3 });
  });

  it("la MISMA clave dos veces aplica UNA, y lo dice", async () => {
    const id = await crearUsuario(prisma, { username: "la_del_doble_clic" });
    const a = await ajustarCreditosBoost(prisma, {
      adminId,
      userId: id,
      delta: 2,
      nota: "promoción de lanzamiento",
      clave: "misma",
    });
    const b = await ajustarCreditosBoost(prisma, {
      adminId,
      userId: id,
      delta: 2,
      nota: "promoción de lanzamiento",
      clave: "misma",
    });

    expect(a.aplicado).toBe(true);
    expect(b.aplicado).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).boostBalance).toBe(2);
    expect(await prisma.boostLedger.count({ where: { userId: id } })).toBe(1);
  });

  it("y la clave va con espacio de nombres del flujo y del admin", async () => {
    // Sin él, una clave del panel podría chocar con la de una compra o una activación, y el ajuste
    // saldría como "ya aplicado" sin haberse aplicado nunca.
    const otro = await crearUsuario(prisma, { username: "el_otro_admin" });
    expect(claveAjusteBoost(adminId, "x")).not.toBe(claveAjusteBoost(otro, "x"));
    expect(claveAjusteBoost(adminId, "x")).toContain("boost:ajuste:");
  });

  it("QUITAR MÁS DE LO QUE HAY se rechaza, y no escribe nada", async () => {
    const id = await crearUsuario(prisma, { username: "la_pelada", boostBalance: 1 });

    await expect(
      ajustarCreditosBoost(prisma, {
        adminId,
        userId: id,
        delta: -5,
        nota: "intento de dejarla en negativo",
        clave: "c1",
      }),
    ).rejects.toMatchObject({ code: "SALDO_NEGATIVO" });

    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).boostBalance).toBe(1);
    expect(await prisma.boostLedger.count({ where: { userId: id } })).toBe(0);
  });

  it("el MOTIVO es obligatorio: vacío o corto se rechaza", async () => {
    const id = await crearUsuario(prisma, { username: "la_sin_motivo" });
    for (const nota of ["", "   ", "a".repeat(AJUSTE_NOTA_MIN - 1)]) {
      await expect(
        ajustarCreditosBoost(prisma, { adminId, userId: id, delta: 1, nota, clave: "c1" }),
      ).rejects.toMatchObject({ code: "NOTA_OBLIGATORIA" });
    }
    expect(await prisma.boostLedger.count()).toBe(0);
  });

  it("y la cantidad se valida: cero, decimal o pasada de tope se rechazan", async () => {
    // DERIVADO a propósito: esto fija que la validación USE la constante, se llame como se llame su
    // valor. El NÚMERO lo clava el bloque de abajo con valores concretos.
    const id = await crearUsuario(prisma, { username: "la_del_cero" });
    for (const delta of [0, 1.5, AJUSTE_BOOST_DELTA_MAX + 1, -(AJUSTE_BOOST_DELTA_MAX + 1)]) {
      await expect(
        ajustarCreditosBoost(prisma, {
          adminId,
          userId: id,
          delta,
          nota: "una cantidad que no vale",
          clave: `c${delta}`,
        }),
      ).rejects.toMatchObject({ code: "DELTA_INVALIDO" });
    }
    expect(await prisma.boostLedger.count()).toBe(0);
  });

  /**
   * EL TOPE SON DIEZ, CLAVADO CON VALORES CONCRETOS.
   *
   * ┌─ POR QUÉ NO SE LEE LA CONSTANTE AQUÍ ───────────────────────────────────────────────────────┐
   * │ Un caso escrito como `AJUSTE_BOOST_DELTA_MAX + 1` comprueba que el tope se APLICA, y sigue  │
   * │ verde el día que alguien cambie el número: o sea que no vigila el número. Este tope nació en │
   * │ 100 —más de 200 $ a precio de catálogo, justo el dedazo que tenía que frenar— y se bajó a 10 │
   * │ a mano. Para que el siguiente cambio sea una DECISIÓN y no un descuido, el valor se clava.   │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * Los dos lados: 10 pasa, 11 no. Con uno solo, subirlo a 50 seguiría verde.
   */
  describe("el tope son DIEZ boosts por ajuste", () => {
    it("+10 pasa y +11 se rechaza", async () => {
      const id = await crearUsuario(prisma, { username: "la_del_tope" });

      const r = await ajustarCreditosBoost(prisma, {
        adminId,
        userId: id,
        delta: 10,
        nota: "el maximo de un solo ajuste",
        clave: "tope-ok",
      });
      expect(r, "10 debería pasar: es el tope, no un exceso").toEqual({
        aplicado: true,
        saldo: 10,
      });

      await expect(
        ajustarCreditosBoost(prisma, {
          adminId,
          userId: id,
          delta: 11,
          nota: "uno por encima del tope",
          clave: "tope-no",
        }),
      ).rejects.toMatchObject({ code: "DELTA_INVALIDO" });
    });

    it("y −10 pasa y −11 se rechaza: el tope es de magnitud, en los dos sentidos", async () => {
      const id = await crearUsuario(prisma, { username: "la_del_tope_neg", boostBalance: 20 });

      await expect(
        ajustarCreditosBoost(prisma, {
          adminId,
          userId: id,
          delta: -11,
          nota: "uno por debajo del tope",
          clave: "neg-no",
        }),
      ).rejects.toMatchObject({ code: "DELTA_INVALIDO" });

      const r = await ajustarCreditosBoost(prisma, {
        adminId,
        userId: id,
        delta: -10,
        nota: "el maximo en negativo",
        clave: "neg-ok",
      });
      expect(r).toEqual({ aplicado: true, saldo: 10 });
    });

    it("el rechazo por exceso sigue diciendo el tope en humano", () => {
      // Lo único que cambió es el número: el copy sigue siendo copy.
      expect(AJUSTE_BOOST_DELTA_MAX).toBe(10);
    });

    it("y sigue MUY por debajo del de puntos: un boost se compra con dinero", () => {
      // La comparación es el porqué del número, no un adorno: 5.000 puntos no cuestan nada.
      expect(AJUSTE_BOOST_DELTA_MAX).toBeLessThan(AJUSTE_DELTA_MAX / 100);
    });
  });

  it("un usuario que no existe se dice en humano, no revienta", async () => {
    await expect(
      ajustarCreditosBoost(prisma, {
        adminId,
        userId: "no-existe",
        delta: 1,
        nota: "regalo a un fantasma",
        clave: "c1",
      }),
    ).rejects.toBeInstanceOf(AjusteBoostError);
  });

  it("el ajuste NO activa ni retira ninguna aparición", async () => {
    // Son dos cosas distintas y es fácil esperar que una haga la otra: dar créditos no destaca.
    const id = await crearUsuario(prisma, { username: "la_regalada" });
    await ajustarCreditosBoost(prisma, {
      adminId,
      userId: id,
      delta: 3,
      nota: "tres boosts de regalo",
      clave: "c1",
    });
    expect(await prisma.boostActivation.count()).toBe(0);
    expect(await destacadosVigentes(prisma, { ahora: AHORA })).toEqual([]);
  });
});

describe("la nota del ajuste NO viaja al dueño", () => {
  it("el historial propio no la trae, ni el handle del admin", async () => {
    // LA COLUMNA ES NUEVA DE ESTA PIEZA, así que por primera vez hay algo que podría filtrarse. La
    // nota se escribe en voz de moderación y para el equipo; el handle del admin convierte una
    // decisión del equipo en una persona a la que ir a buscar.
    const id = await crearUsuario(prisma, { username: "la_dueña", boostBalance: 2 });
    await ajustarCreditosBoost(prisma, {
      adminId,
      userId: id,
      delta: -1,
      nota: "retirado por saltarse las normas",
      clave: "c1",
    });

    const [m] = (await miHistorialBoosts(prisma, id)).items;
    expect(m).toBeDefined();
    expect(Object.keys(m!).sort()).toEqual(
      ["creadoEnMs", "delta", "id", "importeCents", "moneda", "razon"].sort(),
    );
    const json = JSON.stringify(m);
    expect(json, "la nota interna llega al dueño").not.toContain("saltarse las normas");
    expect(json, "el handle del admin llega al dueño").not.toContain(adminId);
  });

  it("pero SÍ está en la fila: la traza existe", async () => {
    const id = await crearUsuario(prisma, { username: "la_trazada" });
    await ajustarCreditosBoost(prisma, {
      adminId,
      userId: id,
      delta: 1,
      nota: "esto tiene que quedar escrito",
      clave: "c1",
    });
    const [fila] = await prisma.boostLedger.findMany({ where: { userId: id } });
    expect(fila!.nota).toBe("esto tiene que quedar escrito");
  });
});

describe("la ficha para ajustar no exige estar destacado", () => {
  it("devuelve a cualquiera, con su saldo", async () => {
    // Atar el ajuste a la lista de vigentes habría sido arbitrario: regalar un Boost a alguien de
    // soporte es justo lo que se hace con quien todavía no tiene con qué destacarse.
    const id = await crearUsuario(prisma, {
      username: "la_de_soporte",
      displayName: "Soporte",
      boostBalance: 0,
      pointsBalance: 30,
    });

    expect(await fichaBoost(prisma, id)).toEqual({
      id,
      username: "la_de_soporte",
      displayName: "Soporte",
      imagen: null,
      puntos: 30,
      saldo: 0,
    });
  });

  it("y `null` si no existe", async () => {
    expect(await fichaBoost(prisma, "no-existe")).toBeNull();
  });
});
