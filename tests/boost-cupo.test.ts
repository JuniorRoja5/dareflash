/**
 * EL CUPO GLOBAL DE BOOSTS — exacto bajo concurrencia, o no sirve.
 *
 * ┌─ POR QUÉ ESTE TEST ES LA PIEZA ────────────────────────────────────────────────────────────────┐
 * │ El límite de 3/día ya era correcto solo con contar, porque `applyBoostCredits` bloquea la fila │
 * │ del `User` y eso serializa al MISMO comprador. El cupo global NO se puede apoyar en eso: dos   │
 * │ personas distintas bloquean filas distintas. Y «se puede pasar por uno o dos» no vale: el      │
 * │ máximo es lo que sostiene la promesa de los 5 minutos en portada, y 61 activaciones son 61     │
 * │ repartos de 300 minutos-hueco — alguien se queda corto.                                        │
 * │                                                                                                 │
 * │ ESTE CASO ENCONTRÓ DOS MECANISMOS ROTOS antes del que hay, y por eso vale la pena tenerlo:     │
 * │  - un cerrojo de una fila + `COUNT` dejaba entrar las 61 (REPEATABLE READ: la lectura devuelve │
 * │    el snapshot de ANTES de esperar al cerrojo);                                                 │
 * │  - una lectura bloqueante del rango reventaba con el error 1020 de MariaDB.                     │
 * │ Lo que sí funciona es OCUPAR una plaza con un UPDATE (ver el modelo `BoostPlaza`). Los tres    │
 * │ pasaban la revisión de código por igual; solo este test los distingue.                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y LO QUE SE RECHAZA NO SE COBRA: si el cupo está lleno, la transacción entera se deshace, así
 * que el crédito sigue en la cuenta y no queda fila de ledger. Cobrar por una aparición que no
 * existe sería peor que no tener cupo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  BOOST_CARRILES,
  BOOST_DESTACADOS_PORTADA,
  BOOST_DURACION_MIN,
  BOOST_MAX_SIMULTANEOS,
  msgBoostAgotado,
} from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  activarBoost,
  estadoCupo,
  minutosParaHueco,
} from "../src/server/services/boost-activacion";
import { retirarDelEscaparate } from "../src/server/services/boost-admin";
import {
  paginaDestacados,
  portadaDestacados,
  type PaginaDestacados,
} from "../src/server/services/boost-destacados";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

/** `cuantos` usuarios distintos, cada uno con saldo para destacar. */
async function gente(cuantos: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < cuantos; i += 1) {
    ids.push(await crearUsuario(prisma, { username: `cupo_${i}`, boostBalance: 3 }));
  }
  return ids;
}

const vigentes = (ahora = new Date()) =>
  prisma.boostActivation.count({ where: { expiresAt: { gt: ahora } } });

describe("las plazas SON el cupo", () => {
  it("hay exactamente `BOOST_MAX_SIMULTANEOS`, y la constante no puede alejarse de las filas", () => {
    // El cupo no es una comprobación, son estas filas: si alguien sube la constante sin añadir
    // plazas en una migración, el máximo real seguiría siendo el viejo y la pantalla prometería
    // otro. Este caso es lo que impide que esas dos cifras se separen en silencio.
    return prisma.boostPlaza.count().then((n) => {
      expect(n).toBe(BOOST_MAX_SIMULTANEOS);
    });
  });

  it("repartidas en carriles iguales: ni un carril con más huecos que otro", async () => {
    const filas = await prisma.boostPlaza.findMany({ select: { carril: true } });
    const porCarril = new Map<number, number>();
    for (const f of filas) porCarril.set(f.carril, (porCarril.get(f.carril) ?? 0) + 1);
    expect(porCarril.size).toBe(BOOST_CARRILES);
    for (const [carril, n] of porCarril) {
      expect(n, `carril ${carril}`).toBe(BOOST_DESTACADOS_PORTADA);
    }
  });
});

describe("61 a la vez dejan exactamente 60", () => {
  it("una se queda fuera, y su crédito sigue intacto", async () => {
    const ids = await gente(BOOST_MAX_SIMULTANEOS + 1);

    // `holdMs` abre la ventana de carrera a propósito: sin él, las transacciones se solapan poco y
    // el caso podría pasar con un cupo roto.
    const rs = await Promise.all(
      ids.map((id, i) => activarBoost(prisma, { userId: id, token: `t${i}` }, { holdMs: 25 })),
    );

    const activadas = rs.filter((r) => r.estado === "activado");
    const agotadas = rs.filter((r) => r.estado === "agotado");

    expect(activadas).toHaveLength(BOOST_MAX_SIMULTANEOS);
    expect(agotadas).toHaveLength(1);
    expect(await vigentes()).toBe(BOOST_MAX_SIMULTANEOS);

    // LA RECHAZADA NO PAGA: ni saldo movido ni fila de ledger.
    const idxFuera = rs.findIndex((r) => r.estado === "agotado");
    const fuera = ids[idxFuera]!;
    const u = await prisma.user.findUniqueOrThrow({ where: { id: fuera } });
    expect(u.boostBalance).toBe(3);
    expect(await prisma.boostLedger.count({ where: { userId: fuera } })).toBe(0);
    expect(await prisma.boostActivation.count({ where: { userId: fuera } })).toBe(0);
  });

  it("y la rechazada dice CUÁNDO volver, no solo que no", async () => {
    const r = (
      await Promise.all(
        (await gente(BOOST_MAX_SIMULTANEOS + 1)).map((id, i) =>
          activarBoost(prisma, { userId: id, token: `t${i}` }, { holdMs: 25 }),
        ),
      )
    ).find((x) => x.estado === "agotado");

    expect(r).toBeDefined();
    if (r?.estado !== "agotado") throw new Error("imposible");
    expect(r.maximo).toBe(BOOST_MAX_SIMULTANEOS);
    // Las vigentes acaban de empezar, así que falta casi la hora entera.
    expect(r.minutosParaHueco).toBeGreaterThan(BOOST_DURACION_MIN - 2);
    expect(r.minutosParaHueco).toBeLessThanOrEqual(BOOST_DURACION_MIN);
  });
});

describe("los minutos que se le dicen a la persona", () => {
  it("redondean HACIA ARRIBA y nunca bajan de 1", () => {
    const ahora = 1_000_000;
    // 40 segundos no son "0 min": quien vuelve a los 0 y lo encuentra lleno deja de creerse el dato.
    expect(minutosParaHueco(ahora + 40_000, ahora)).toBe(1);
    expect(minutosParaHueco(ahora + 61_000, ahora)).toBe(2);
    expect(minutosParaHueco(ahora + 600_000, ahora)).toBe(10);
    // Ya caducó (carrera con el barrido): sigue sin decir 0.
    expect(minutosParaHueco(ahora - 5_000, ahora)).toBe(1);
  });

  it("el copy lleva el número dentro", () => {
    expect(msgBoostAgotado(7)).toContain("7");
    expect(msgBoostAgotado(7)).toMatch(/agotado/i);
  });
});

describe("el estado que ve /boosts antes de pulsar", () => {
  it("con sitio: no está lleno y no promete minutos que no hacen falta", async () => {
    const [uno] = await gente(1);
    await activarBoost(prisma, { userId: uno!, token: "a" });

    const e = await estadoCupo(prisma);
    expect(e.lleno).toBe(false);
    expect(e.vigentes).toBe(1);
    expect(e.minutosParaHueco).toBeNull();
  });

  it("lleno: lo dice ANTES de que nadie gaste nada", async () => {
    const ids = await gente(BOOST_MAX_SIMULTANEOS);
    for (const [i, id] of ids.entries()) {
      await activarBoost(prisma, { userId: id, token: `t${i}` });
    }

    const e = await estadoCupo(prisma);
    expect(e.lleno).toBe(true);
    expect(e.vigentes).toBe(BOOST_MAX_SIMULTANEOS);
    expect(e.minutosParaHueco).toBeGreaterThan(0);
  });
});

describe("un hueco se libera al momento", () => {
  it("retirar un destacado desde el panel deja entrar al siguiente", async () => {
    const ids = await gente(BOOST_MAX_SIMULTANEOS + 1);
    const dentro = ids.slice(0, BOOST_MAX_SIMULTANEOS);
    const fuera = ids[BOOST_MAX_SIMULTANEOS]!;
    for (const [i, id] of dentro.entries()) {
      await activarBoost(prisma, { userId: id, token: `t${i}` });
    }
    expect((await activarBoost(prisma, { userId: fuera, token: "x" })).estado).toBe("agotado");

    // El panel retira: `expiresAt = ahora`, y como el cupo cuenta `expiresAt > ahora`, el hueco
    // queda libre SIN job ni barrido. El estado se calcula, no se dispara.
    await retirarDelEscaparate(prisma, dentro[0]!);

    expect((await activarBoost(prisma, { userId: fuera, token: "y" })).estado).toBe("activado");
    expect(await vigentes()).toBe(BOOST_MAX_SIMULTANEOS);
  });
});

describe("la vitrina completa los enseña a TODOS, paginando", () => {
  it("los 60 salen entre las páginas, sin repetir ninguno y sin perder ninguno", async () => {
    const ids = await gente(BOOST_MAX_SIMULTANEOS);
    for (const [i, id] of ids.entries()) {
      // Instantes distintos: el orden de la vitrina es por `startsAt`, y con todos a la vez el
      // desempate por id haría el test dependiente de cómo se generan los ids.
      await activarBoost(prisma, {
        userId: id,
        token: `t${i}`,
        ahora: new Date(Date.UTC(2026, 0, 1, 10, 0, i)),
      });
    }
    const ahora = new Date(Date.UTC(2026, 0, 1, 10, 30, 0));

    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const p: PaginaDestacados = await paginaDestacados(prisma, {
        ahora,
        cursor,
        porPagina: 24,
      });
      vistos.push(...p.items.map((x) => x.userId));
      cursor = p.nextCursor;
      paginas += 1;
      if (paginas > 10) throw new Error("la paginación no termina");
    } while (cursor !== null);

    expect(paginas).toBeGreaterThan(1); // de verdad paginó, no cupo todo en una
    expect(vistos).toHaveLength(BOOST_MAX_SIMULTANEOS);
    expect(new Set(vistos).size).toBe(BOOST_MAX_SIMULTANEOS); // ni uno repetido entre páginas
    expect(new Set(vistos)).toEqual(new Set(ids)); // ni uno perdido
  });

  it("y la PORTADA enseña solo los huecos que tiene, de los mismos vigentes", async () => {
    const ids = await gente(BOOST_MAX_SIMULTANEOS);
    for (const [i, id] of ids.entries()) {
      await activarBoost(prisma, {
        userId: id,
        token: `t${i}`,
        ahora: new Date(Date.UTC(2026, 0, 1, 10, 0, i)),
      });
    }
    const portada = await portadaDestacados(prisma, {
      ahora: new Date(Date.UTC(2026, 0, 1, 10, 30, 0)),
    });
    expect(portada).toHaveLength(BOOST_DESTACADOS_PORTADA);
    expect(new Set(portada.map((p) => p.userId)).size).toBe(BOOST_DESTACADOS_PORTADA);
  });
});

describe("los carriles salen repartidos", () => {
  it("ninguno pasa de los huecos de la portada, que es lo que sostiene la promesa", async () => {
    const ids = await gente(BOOST_MAX_SIMULTANEOS);
    for (const [i, id] of ids.entries()) {
      await activarBoost(prisma, { userId: id, token: `t${i}` });
    }

    const filas = await prisma.boostActivation.findMany({ select: { carril: true } });
    const cuenta = new Map<number, number>();
    for (const f of filas) cuenta.set(f.carril, (cuenta.get(f.carril) ?? 0) + 1);

    expect(cuenta.size).toBe(BOOST_CARRILES);
    for (const [carril, n] of cuenta) {
      expect(n, `el carril ${carril} tiene ${n}`).toBeLessThanOrEqual(BOOST_DESTACADOS_PORTADA);
    }
  });
});
