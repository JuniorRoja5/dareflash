/**
 * ACTIVAR UN BOOST — el límite tiene que ser un límite, y el débito no puede quedarse suelto.
 *
 * Es la pieza donde se gasta algo que se pagó con dinero, así que lo que se fija es lo que cuesta
 * caro si falla:
 *
 *  - EL LÍMITE DE 3/DÍA AGUANTA LA CONCURRENCIA. Contar y después insertar es el patrón que el
 *    esquema ya avisaba: dos peticiones simultáneas leen "2 hoy" y pasan las dos → 4. Aquí se
 *    prueba con `holdMs`, que ensancha la ventana a propósito. Con el conteo FUERA del bloqueo del
 *    `User`, este fichero se pone rojo.
 *  - EL DÍA ES UTC. Dos activaciones a 23:59Z y a 00:01Z son días distintos aunque disten dos
 *    minutos; y dos del mismo día UTC cuentan juntas aunque para el usuario sea "ayer y hoy".
 *  - EL DÉBITO Y LA APARICIÓN SON ATÓMICOS. Si el insert de la `BoostActivation` falla, el boost NO
 *    se gasta: ni saldo movido ni fila de ledger. Cobrar por una aparición que no existe es un
 *    descuadre.
 *  - LA IDEMPOTENCIA ES POR INTENCIÓN. El mismo token dos veces es UNA activación y UN débito. Con
 *    el token generado en servidor, un doble clic cuesta dos boosts.
 *  - SIN SALDO NO SE ESCRIBE NADA, y se devuelve un resultado, no una excepción.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  BOOST_DAILY_LIMIT,
  BOOST_DURACION_MIN,
  RAZON_BOOST_ACTIVACION,
  REF_BOOST_ACTIVACION,
} from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  activarBoost,
  claveActivacion,
  miEstadoBoost,
} from "../src/server/services/boost-activacion";

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
  userId = await crearUsuario(prisma, { username: "la_destacada", boostBalance: 5 });
});

/** Un instante fijo a mediodía UTC: lejos de los bordes del día salvo cuando se quiere probarlos. */
const MEDIODIA = new Date("2026-06-15T12:00:00.000Z");

const saldo = async (id = userId) =>
  (await prisma.user.findUniqueOrThrow({ where: { id } })).boostBalance;
const apariciones = (id = userId) => prisma.boostActivation.findMany({ where: { userId: id } });
const movimientos = (id = userId) => prisma.boostLedger.findMany({ where: { userId: id } });

/** Siembra N apariciones ya existentes en el día UTC de `cuando`. */
async function yaDestacado(n: number, cuando = MEDIODIA) {
  for (let i = 0; i < n; i += 1) {
    const startsAt = new Date(cuando.getTime() - (i + 1) * 60_000);
    await prisma.boostActivation.create({
      data: {
        userId,
        startsAt,
        expiresAt: new Date(startsAt.getTime() + BOOST_DURACION_MIN * 60_000),
      },
    });
  }
}

describe("activar gasta un boost y crea la aparición", () => {
  it("devuelve lo que pasó, y las dos cosas quedan escritas", async () => {
    const r = await activarBoost(prisma, { userId, token: "t1", ahora: MEDIODIA });

    expect(r).toMatchObject({ estado: "activado", saldo: 4, usadasHoy: 1 });
    expect(await saldo()).toBe(4);

    const [a] = await apariciones();
    expect(a).toBeDefined();
    expect(a!.startsAt.toISOString()).toBe(MEDIODIA.toISOString());
    // La duración sale de la constante, no de un número escrito aquí.
    expect(a!.expiresAt.getTime() - a!.startsAt.getTime()).toBe(BOOST_DURACION_MIN * 60_000);
  });

  it("el movimiento de ledger apunta A LA APARICIÓN que lo gastó", async () => {
    const r = await activarBoost(prisma, { userId, token: "t1", ahora: MEDIODIA });
    const [m] = await movimientos();

    expect(m).toMatchObject({
      delta: -1,
      reason: RAZON_BOOST_ACTIVACION,
      refType: REF_BOOST_ACTIVACION,
      amountCents: null,
      currency: null,
    });
    // Sin esto, un movimiento de activación no se podría atar a su aparición en una auditoría.
    expect(m!.refId).toBe(r.estado === "activado" ? r.activacionId : null);
    expect((await apariciones())[0]!.id).toBe(m!.refId);
  });

  it("y el saldo se mueve SOLO por el ledger: una fila por boost gastado", async () => {
    await activarBoost(prisma, { userId, token: "t1", ahora: MEDIODIA });
    await activarBoost(prisma, { userId, token: "t2", ahora: MEDIODIA });

    expect(await saldo()).toBe(3);
    expect(await movimientos()).toHaveLength(2);
    expect(await apariciones()).toHaveLength(2);
  });
});

describe("sin saldo no se escribe nada", () => {
  it("devuelve `sin-saldo`, no una excepción", async () => {
    const pelado = await crearUsuario(prisma, { username: "el_pelado", boostBalance: 0 });
    const r = await activarBoost(prisma, { userId: pelado, token: "t1", ahora: MEDIODIA });

    expect(r).toEqual({ estado: "sin-saldo" });
    expect(await saldo(pelado)).toBe(0);
    expect(await apariciones(pelado)).toHaveLength(0);
    expect(await movimientos(pelado)).toHaveLength(0);
  });

  it("el saldo no se queda en negativo ni con el último boost", async () => {
    const justo = await crearUsuario(prisma, { username: "la_justa", boostBalance: 1 });
    expect((await activarBoost(prisma, { userId: justo, token: "a" })).estado).toBe("activado");
    expect((await activarBoost(prisma, { userId: justo, token: "b" })).estado).toBe("sin-saldo");
    expect(await saldo(justo)).toBe(0);
    expect(await apariciones(justo)).toHaveLength(1);
  });
});

describe("el límite diario", () => {
  it(`la ${BOOST_DAILY_LIMIT + 1}ª del día se rechaza, y no gasta boost`, async () => {
    await yaDestacado(BOOST_DAILY_LIMIT);
    const antes = await saldo();

    const r = await activarBoost(prisma, { userId, token: "t1", ahora: MEDIODIA });

    expect(r).toEqual({ estado: "limite", limite: BOOST_DAILY_LIMIT });
    expect(await saldo()).toBe(antes);
    expect(await apariciones()).toHaveLength(BOOST_DAILY_LIMIT);
    // Y NI UNA FILA DE LEDGER: el rechazo no puede dejar rastro de un débito que se deshizo.
    expect(await movimientos()).toHaveLength(0);
  });

  it(`las ${BOOST_DAILY_LIMIT} primeras sí pasan`, async () => {
    for (let i = 0; i < BOOST_DAILY_LIMIT; i += 1) {
      const r = await activarBoost(prisma, { userId, token: `t${i}`, ahora: MEDIODIA });
      expect(r, `la ${i + 1}ª debería pasar`).toMatchObject({
        estado: "activado",
        usadasHoy: i + 1,
      });
    }
    expect(await apariciones()).toHaveLength(BOOST_DAILY_LIMIT);
  });

  it("CON UNA SOLA PLAZA LIBRE, dos activaciones SIMULTÁNEAS dejan una: el conteo va bajo el lock", async () => {
    // EL CASO QUE JUSTIFICA LA PIEZA. `holdMs` ensancha la ventana lectura->escritura dentro de la
    // transacción; con el conteo FUERA del bloqueo del `User`, las dos leen el mismo número y las dos
    // insertan -> 4 apariciones con un límite de 3.
    await yaDestacado(BOOST_DAILY_LIMIT - 1);

    const [a, b] = await Promise.all([
      activarBoost(prisma, { userId, token: "p1", ahora: MEDIODIA }, { holdMs: 40 }),
      activarBoost(prisma, { userId, token: "p2", ahora: MEDIODIA }, { holdMs: 40 }),
    ]);

    const estados = [a.estado, b.estado].sort();
    expect(estados).toEqual(["activado", "limite"]);
    expect(await apariciones(), "se colaron más apariciones que el límite").toHaveLength(
      BOOST_DAILY_LIMIT,
    );
    expect(await movimientos()).toHaveLength(1);
    expect(await saldo()).toBe(4);
  });

  it("y con un solo boost, dos simultáneas dejan un débito: lo vigila el ledger", async () => {
    const justo = await crearUsuario(prisma, { username: "el_justo", boostBalance: 1 });

    const [a, b] = await Promise.all([
      activarBoost(prisma, { userId: justo, token: "p1" }, { holdMs: 40 }),
      activarBoost(prisma, { userId: justo, token: "p2" }, { holdMs: 40 }),
    ]);

    expect([a.estado, b.estado].sort()).toEqual(["activado", "sin-saldo"]);
    expect(await saldo(justo)).toBe(0);
    expect(await apariciones(justo)).toHaveLength(1);
  });

  it("CINCO simultáneas con el día entero libre dejan exactamente el límite", async () => {
    // Saldo de sobra (5) y cero usadas: lo único que puede frenarlas es el límite.
    const [extra] = [await crearUsuario(prisma, { username: "la_ansiosa", boostBalance: 9 })];

    const rs = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        activarBoost(prisma, { userId: extra, token: `p${i}` }, { holdMs: 30 }),
      ),
    );

    expect(rs.filter((r) => r.estado === "activado")).toHaveLength(BOOST_DAILY_LIMIT);
    expect(rs.filter((r) => r.estado === "limite")).toHaveLength(5 - BOOST_DAILY_LIMIT);
    expect(await apariciones(extra)).toHaveLength(BOOST_DAILY_LIMIT);
    expect(await saldo(extra)).toBe(9 - BOOST_DAILY_LIMIT);
  });

  it("el límite es POR USUARIO: lo de otro no me lo gasta", async () => {
    const otra = await crearUsuario(prisma, { username: "la_otra", boostBalance: 5 });
    for (let i = 0; i < BOOST_DAILY_LIMIT; i += 1) {
      await activarBoost(prisma, { userId: otra, token: `o${i}`, ahora: MEDIODIA });
    }
    const r = await activarBoost(prisma, { userId, token: "mio", ahora: MEDIODIA });
    expect(r.estado).toBe("activado");
  });
});

describe("el día es UTC", () => {
  it("23:59Z y 00:01Z son días DISTINTOS, aunque disten dos minutos", async () => {
    const casiMedianoche = new Date("2026-06-15T23:59:00.000Z");
    const pasadaMedianoche = new Date("2026-06-16T00:01:00.000Z");

    // Se agota el día 15 entero…
    for (let i = 0; i < BOOST_DAILY_LIMIT; i += 1) {
      const r = await activarBoost(prisma, { userId, token: `d15-${i}`, ahora: casiMedianoche });
      expect(r.estado).toBe("activado");
    }
    expect((await activarBoost(prisma, { userId, token: "x", ahora: casiMedianoche })).estado).toBe(
      "limite",
    );

    // …y dos minutos después, con el día 16, el contador vuelve a empezar.
    const r = await activarBoost(prisma, { userId, token: "d16", ahora: pasadaMedianoche });
    expect(r, "el día no se corta en la medianoche UTC").toMatchObject({
      estado: "activado",
      usadasHoy: 1,
    });
  });

  it("y dos instantes LEJANOS del mismo día UTC cuentan juntos", async () => {
    // 00:30Z y 23:30Z son el mismo día UTC. Con una fecha LOCAL (p. ej. UTC+10), estos dos caerían
    // en días distintos y el límite se duplicaría sin que nada fallara.
    const temprano = new Date("2026-06-15T00:30:00.000Z");
    const tarde = new Date("2026-06-15T23:30:00.000Z");

    for (let i = 0; i < BOOST_DAILY_LIMIT; i += 1) {
      await activarBoost(prisma, { userId, token: `m${i}`, ahora: temprano });
    }
    expect((await activarBoost(prisma, { userId, token: "t", ahora: tarde })).estado).toBe(
      "limite",
    );
  });
});

describe("el débito y la aparición son atómicos", () => {
  it("si el insert de la aparición FALLA, el boost no se gasta", async () => {
    // El fallo es REAL, no simulado: se reutiliza un id de aparición que ya existe, así que el
    // INSERT choca con la clave primaria dentro de la transacción.
    const choca = await prisma.boostActivation.create({
      data: {
        userId,
        startsAt: new Date(MEDIODIA.getTime() - 7 * 24 * 3600_000),
        expiresAt: new Date(MEDIODIA.getTime() - 7 * 24 * 3600_000 + 60_000),
      },
    });
    const antes = await saldo();

    await expect(
      activarBoost(prisma, {
        userId,
        token: "t1",
        ahora: MEDIODIA,
        activacionId: choca.id,
      }),
    ).rejects.toThrow();

    expect(await saldo(), "se gastó un boost por una aparición que no existe").toBe(antes);
    expect(await movimientos()).toHaveLength(0);
    expect(await apariciones()).toHaveLength(1); // solo la que ya estaba
  });
});

describe("idempotencia por INTENCIÓN", () => {
  it("el mismo token dos veces: una activación y un débito", async () => {
    const a = await activarBoost(prisma, { userId, token: "mismo", ahora: MEDIODIA });
    const b = await activarBoost(prisma, { userId, token: "mismo", ahora: MEDIODIA });

    expect(a.estado).toBe("activado");
    expect(b).toEqual({ estado: "repetida" });
    expect(await saldo()).toBe(4);
    expect(await apariciones()).toHaveLength(1);
    expect(await movimientos()).toHaveLength(1);
  });

  it("y en PARALELO también (el doble clic de verdad)", async () => {
    const [a, b] = await Promise.all([
      activarBoost(prisma, { userId, token: "doble", ahora: MEDIODIA }, { holdMs: 40 }),
      activarBoost(prisma, { userId, token: "doble", ahora: MEDIODIA }, { holdMs: 40 }),
    ]);

    expect([a.estado, b.estado].sort()).toEqual(["activado", "repetida"]);
    expect(await apariciones()).toHaveLength(1);
    expect(await saldo()).toBe(4);
  });

  it("tokens DISTINTOS son intenciones distintas: dos activaciones", async () => {
    await activarBoost(prisma, { userId, token: "uno", ahora: MEDIODIA });
    await activarBoost(prisma, { userId, token: "dos", ahora: MEDIODIA });
    expect(await apariciones()).toHaveLength(2);
    expect(await saldo()).toBe(3);
  });

  it("la clave va NAMESPACEADA por usuario: el token de otro no me anula", async () => {
    // Sin el userId dentro, mi activación saldría como "repetida" porque alguien usó ese token
    // antes, y me quedaría sin destacar sin que nada fallara.
    const otra = await crearUsuario(prisma, { username: "la_del_token", boostBalance: 2 });
    expect(claveActivacion(userId, "x")).not.toBe(claveActivacion(otra, "x"));

    await activarBoost(prisma, { userId: otra, token: "compartido", ahora: MEDIODIA });
    const mia = await activarBoost(prisma, { userId, token: "compartido", ahora: MEDIODIA });

    expect(mia.estado).toBe("activado");
  });

  it("y la clave NO lleva nada del momento: dos envíos de la misma intención coinciden", () => {
    expect(claveActivacion(userId, "t")).toBe(claveActivacion(userId, "t"));
    expect(claveActivacion(userId, "t")).toContain("t");
  });
});

/**
 * EL CONTEO VIVE DENTRO DE LA VENTANA BLOQUEADA, y esto lo fija por ESTRUCTURA.
 *
 * ┌─ POR QUÉ HACE FALTA, HABIENDO UN TEST DE CONCURRENCIA ─────────────────────────────────────────┐
 * │ Al meterle dientes a esta pieza salió un VERDE FALSO instructivo: cambiar `tx.boostActivation │
 * │ .count` por `db.boostActivation.count` AQUÍ DENTRO no rompe nada, porque el concurrente está  │
 * │ esperando en el FOR UPDATE y cuando llega a contar ya ve la fila. O sea: el test de            │
 * │ concurrencia mide la VENTANA, no el cliente.                                                  │
 * │                                                                                               │
 * │ Lo que sí lo rompe es SACAR el conteo arriba, antes de `applyBoostCredits` — y eso el test de  │
 * │ concurrencia lo caza (comprobado: enrojece los dos casos). Este guard añade lo que aquel no    │
 * │ puede ver: que el conteo siga escrito DESPUÉS de entrar en la transacción, para que mover esa  │
 * │ línea "para leerlo antes y ahorrar trabajo" no pase en silencio en una revisión.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("la ventana bloqueada, fijada por estructura", () => {
  const fuente = readFileSync(
    join(process.cwd(), "src", "server", "services", "boost-activacion.ts"),
    "utf8",
  );
  /** Sin comentarios: el docblock EXPLICA la regla; explicarla no es aplicarla. */
  const limpio = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /**
   * SOLO EL CUERPO DE `activarBoost`. Acotarlo no es cosmético: `miEstadoBoost`, en el mismo
   * fichero, consulta `db.boostActivation.findMany` con todo derecho —no está dentro de ninguna
   * transacción—, así que un guard sobre el fichero entero se pone rojo por código inocente. Es la
   * forma en la que un guard ancho acaba borrado por molesto.
   */
  const codigo = (() => {
    const desde = limpio.indexOf("export async function activarBoost");
    const hasta = limpio.indexOf("export interface MiEstadoBoost");
    expect(desde, "no encuentro `activarBoost`").toBeGreaterThan(-1);
    expect(hasta, "no encuentro el final del bloque").toBeGreaterThan(desde);
    return limpio.slice(desde, hasta);
  })();

  it("el conteo y el insert están DENTRO de `trasAplicar`", () => {
    const tras = codigo.indexOf("trasAplicar:");
    const cuenta = codigo.indexOf("boostActivation.count(");
    const inserta = codigo.indexOf("boostActivation.create(");

    expect(tras, "no encuentro `trasAplicar`").toBeGreaterThan(-1);
    expect(cuenta, "el conteo se ha salido de la transacción").toBeGreaterThan(tras);
    expect(inserta, "el insert se ha salido de la transacción").toBeGreaterThan(tras);
  });

  it("y el conteo usa el cliente de la transacción, no el del pool", () => {
    // Para el LÍMITE da igual (lo serializa el bloqueo), pero pedirle una conexión nueva al pool
    // mientras esta transacción tiene una tomada y locks puestos es cómo se agota el pool.
    expect(codigo).toContain("tx.boostActivation.count(");
    expect(codigo).toContain("tx.boostActivation.create(");
    expect(codigo, "se cuenta con el cliente del pool dentro de la transacción").not.toContain(
      "db.boostActivation",
    );
  });

  it("el día sale de `diaUTC`, no de una fecha local", () => {
    // Una fecha local parte el día donde esté el servidor, y el límite se duplica en el borde.
    expect(codigo).toContain("diaUTC(ahora)");
    expect(codigo, "vuelve una fecha local").not.toMatch(
      /getFullYear\(\)|getMonth\(\)|getDate\(\)/,
    );
  });

  it("el detector mira el CÓDIGO, no el comentario que lo explica", () => {
    // Control doble: el fichero MENCIONA `db.boostActivation` en un comentario (explica por qué no
    // se usa ahí) y `miEstadoBoost` lo usa de verdad más abajo. Si el recorte fallara, los dos
    // casos de arriba pasarían o fallarían por el motivo equivocado.
    expect(fuente).toContain("db.boostActivation");
    expect(codigo, "el recorte se ha llevado código de más").not.toContain("miEstadoBoost");
    expect(codigo.length).toBeLessThan(limpio.length);
  });
});

describe("mi estado: cuántas hoy y si estoy destacado ahora", () => {
  it("sin nada, cero y null", async () => {
    expect(await miEstadoBoost(prisma, userId, MEDIODIA)).toEqual({
      usadasHoy: 0,
      vigenteHastaMs: null,
    });
  });

  it("cuenta las de hoy y dice hasta cuándo estoy destacado", async () => {
    const r = await activarBoost(prisma, { userId, token: "t1", ahora: MEDIODIA });
    const e = await miEstadoBoost(prisma, userId, new Date(MEDIODIA.getTime() + 60_000));

    expect(e.usadasHoy).toBe(1);
    expect(e.vigenteHastaMs).toBe(r.estado === "activado" ? r.expiraEnMs : null);
  });

  it("una aparición EXPIRADA sigue contando para el límite, pero ya no está vigente", async () => {
    // Son dos preguntas distintas y es fácil contestarlas con la misma consulta: gastar el boost
    // cuenta para el día aunque la aparición ya se haya terminado.
    await activarBoost(prisma, { userId, token: "t1", ahora: MEDIODIA });
    const despues = new Date(MEDIODIA.getTime() + (BOOST_DURACION_MIN + 5) * 60_000);

    const e = await miEstadoBoost(prisma, userId, despues);
    expect(e.usadasHoy).toBe(1);
    expect(e.vigenteHastaMs).toBeNull();
  });

  it("una de AYER que sigue vigente NO cuenta para hoy, pero sí se ve vigente", async () => {
    // El borde: activada a las 23:40 de ayer, mirada a las 00:10 de hoy. Es el caso que obliga a que
    // las dos preguntas tengan ventanas distintas.
    const ayerTarde = new Date("2026-06-15T23:40:00.000Z");
    const hoyTemprano = new Date("2026-06-16T00:10:00.000Z");
    await activarBoost(prisma, { userId, token: "t1", ahora: ayerTarde });

    const e = await miEstadoBoost(prisma, userId, hoyTemprano);
    expect(e.usadasHoy, "una aparición de ayer se está contando como de hoy").toBe(0);
    expect(e.vigenteHastaMs, "una aparición vigente se está dando por terminada").not.toBeNull();
  });

  it("y es MÍO: lo de otro no sale aquí", async () => {
    const otra = await crearUsuario(prisma, { username: "la_ajena", boostBalance: 3 });
    await activarBoost(prisma, { userId: otra, token: "t1", ahora: MEDIODIA });

    expect((await miEstadoBoost(prisma, userId, MEDIODIA)).usadasHoy).toBe(0);
    expect((await miEstadoBoost(prisma, otra, MEDIODIA)).usadasHoy).toBe(1);
  });
});
