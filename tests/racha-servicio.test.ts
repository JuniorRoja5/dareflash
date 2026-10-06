/**
 * LA RACHA CONTRA LA BASE: lo que se escribe, cuándo NO se escribe, y cuándo se paga.
 *
 * `tests/racha.test.ts` ata el cálculo; esto ata que el servicio lo use bien. Lo que se fija:
 *
 *  - IDEMPOTENTE DENTRO DEL DÍA: la segunda acción del día no toca `User`. Se comprueba de verdad
 *    —contando escrituras con un espía—, no mirando el resultado: el resultado sería el mismo
 *    escribiendo cincuenta veces, y esas cincuenta escrituras en la tabla más caliente son
 *    exactamente lo que no puede pasar.
 *  - EL PREMIO, UNA VEZ POR RACHA: siete días pagan una; el octavo, el noveno y el trigésimo no.
 *    Romperla y reconstruirla SÍ vuelve a pagar, porque es otra racha.
 *  - SE REPARA SOLO: si el premio falla el día 7, el día 8 lo paga. Por eso se intenta en cada día
 *    nuevo a partir del umbral y no solo justo al cruzar.
 *  - NO TUMBA A QUIEN LA LLAMA: un fallo al marcar no se propaga.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { POINTS, RACHA_DIAS_PREMIO, RAZON_RACHA } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { claveRacha, marcarDiaActivo, rachaDe } from "../src/server/services/racha";

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
  userId = await crearUsuario(prisma, { username: "la_constante" });
});

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const instante = (a: number, m: number, d: number, h: number) => new Date(Date.UTC(a, m - 1, d, h));

const premios = () => prisma.pointsLedger.findMany({ where: { userId, reason: RAZON_RACHA } });

const guardado = async () => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { inicio: u.rachaInicioEn, ultimo: u.rachaUltimoEn };
};

/** Marca `dias` días consecutivos desde el 1 de octubre. Devuelve el último día marcado. */
async function diasSeguidos(dias: number): Promise<Date> {
  let ultimo = dia(2026, 10, 1);
  for (let d = 1; d <= dias; d += 1) {
    ultimo = dia(2026, 10, d);
    await marcarDiaActivo(prisma, userId, ultimo);
  }
  return ultimo;
}

describe("lo que se guarda", () => {
  it("el primer día empieza la racha", async () => {
    expect(await marcarDiaActivo(prisma, userId, dia(2026, 10, 6))).toBe(1);
    const g = await guardado();
    expect(g.inicio?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(g.ultimo?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });

  it("días seguidos la alargan sin mover el inicio", async () => {
    await marcarDiaActivo(prisma, userId, dia(2026, 10, 6));
    expect(await marcarDiaActivo(prisma, userId, dia(2026, 10, 7))).toBe(2);
    const g = await guardado();
    expect(g.inicio?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(g.ultimo?.toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("saltarse un día la reinicia", async () => {
    await marcarDiaActivo(prisma, userId, dia(2026, 10, 6));
    expect(await marcarDiaActivo(prisma, userId, dia(2026, 10, 9))).toBe(1);
    expect((await guardado()).inicio?.toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });

  it("un usuario que no existe no revienta nada", async () => {
    expect(await marcarDiaActivo(prisma, "no-existe", dia(2026, 10, 6))).toBe(0);
  });

  it("y si la escritura FALLA, no se propaga: la acción de la persona ya ocurrió", async () => {
    // El contrato entero de esta función: puede perderse un día de racha, pero no puede llevarse
    // por delante el voto, el comentario o el like que la persona acaba de hacer.
    const db = new Proxy(prisma, {
      get(obj, prop) {
        if (prop === "user") {
          const real = Reflect.get(obj, prop) as object;
          return new Proxy(real, {
            get(u, p) {
              if (p === "update") return () => Promise.reject(new Error("User caído"));
              const v = Reflect.get(u, p) as unknown;
              return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(u) : v;
            },
          });
        }
        const v = Reflect.get(obj, prop) as unknown;
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(obj) : v;
      },
    }) as PrismaClient;

    await expect(marcarDiaActivo(db, userId, dia(2026, 10, 6))).resolves.toBe(0);
    // Y no quedó nada escrito a medias.
    expect((await guardado()).ultimo).toBeNull();
  });
});

describe("idempotente dentro del día", () => {
  it("la segunda acción del día NO escribe en User", async () => {
    const espia = vi.fn();
    const db = new Proxy(prisma, {
      get(obj, prop) {
        if (prop === "user") {
          const real = Reflect.get(obj, prop) as object;
          return new Proxy(real, {
            get(u, p) {
              const v = Reflect.get(u, p) as unknown;
              if (p !== "update") {
                return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(u) : v;
              }
              return (...args: unknown[]) => {
                espia();
                return (v as (...a: unknown[]) => unknown).apply(u, args);
              };
            },
          });
        }
        const v = Reflect.get(obj, prop) as unknown;
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(obj) : v;
      },
    }) as PrismaClient;

    await marcarDiaActivo(db, userId, instante(2026, 10, 6, 9));
    expect(espia, "la primera sí escribe").toHaveBeenCalledTimes(1);

    // Cuatro acciones más en el mismo día, a horas distintas: ni una escritura.
    for (const h of [10, 13, 18, 23]) {
      await marcarDiaActivo(db, userId, instante(2026, 10, 6, h));
    }
    expect(espia, "la acción número N del día volvió a escribir").toHaveBeenCalledTimes(1);

    // Y el día siguiente sí.
    await marcarDiaActivo(db, userId, instante(2026, 10, 7, 1));
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it("y la racha no se infla por marcar muchas veces", async () => {
    for (const h of [1, 5, 9, 14, 20]) {
      await marcarDiaActivo(prisma, userId, instante(2026, 10, 6, h));
    }
    expect(await rachaDe(prisma, userId, dia(2026, 10, 6))).toBe(1);
  });
});

describe("el premio, una vez por racha", () => {
  it(`no paga antes de los ${RACHA_DIAS_PREMIO} días`, async () => {
    await diasSeguidos(RACHA_DIAS_PREMIO - 1);
    expect(await premios()).toHaveLength(0);
  });

  it("paga al llegar, y lo paga una sola vez", async () => {
    const ultimo = await diasSeguidos(RACHA_DIAS_PREMIO);
    const p = await premios();
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      delta: POINTS.RACHA_7_DIAS,
      idempotencyKey: claveRacha(userId, dia(2026, 10, 1)),
    });
    expect(await rachaDe(prisma, userId, ultimo)).toBe(RACHA_DIAS_PREMIO);
  });

  it("los días siguientes de la MISMA racha no vuelven a pagar", async () => {
    await diasSeguidos(RACHA_DIAS_PREMIO + 5);
    expect(await premios()).toHaveLength(1);
  });

  it("y el saldo sube una sola vez", async () => {
    await diasSeguidos(RACHA_DIAS_PREMIO + 3);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.pointsBalance).toBe(POINTS.RACHA_7_DIAS);
  });

  it("ROMPERLA y reconstruirla SÍ vuelve a pagar: es otra racha", async () => {
    await diasSeguidos(RACHA_DIAS_PREMIO);
    expect(await premios()).toHaveLength(1);

    // Un hueco, y siete días nuevos desde el 20.
    for (let d = 20; d < 20 + RACHA_DIAS_PREMIO; d += 1) {
      await marcarDiaActivo(prisma, userId, dia(2026, 10, d));
    }
    const p = await premios();
    expect(p).toHaveLength(2);
    expect(p[1]?.idempotencyKey).toBe(claveRacha(userId, dia(2026, 10, 20)));
  });

  it("se REPARA SOLO: si el premio falla el día 7, el día 8 lo paga", async () => {
    await diasSeguidos(RACHA_DIAS_PREMIO - 1);
    // El día 7 el premio no llega a escribirse (se rompe el ledger por debajo).
    const db = new Proxy(prisma, {
      get(obj, prop) {
        if (prop === "$transaction") {
          return (fn: unknown, opts: unknown) => {
            // Solo revienta la transacción del LEDGER (la que lleva opciones); la del resto pasa.
            if (opts) return Promise.reject(new Error("ledger caído"));
            return (obj as PrismaClient).$transaction(
              fn as Parameters<PrismaClient["$transaction"]>[0],
            );
          };
        }
        const v = Reflect.get(obj, prop) as unknown;
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(obj) : v;
      },
    }) as PrismaClient;

    await marcarDiaActivo(db, userId, dia(2026, 10, RACHA_DIAS_PREMIO));
    expect(await premios(), "no debería haber pagado").toHaveLength(0);
    // Pero el día quedó marcado: la racha sigue viva.
    expect(await rachaDe(prisma, userId, dia(2026, 10, RACHA_DIAS_PREMIO))).toBe(RACHA_DIAS_PREMIO);

    // Día 8, por la vía normal: se intenta otra vez y esta vez sí.
    await marcarDiaActivo(prisma, userId, dia(2026, 10, RACHA_DIAS_PREMIO + 1));
    expect(await premios(), "el reintento no pagó").toHaveLength(1);
  });
});

describe("la racha que se enseña se calcula", () => {
  it("una racha vieja vale cero aunque siga guardada", async () => {
    await diasSeguidos(RACHA_DIAS_PREMIO);
    // Las columnas siguen ahí...
    expect((await guardado()).ultimo).not.toBeNull();
    // ...pero mirada un mes después, vale cero. Nadie ha tenido que romperla.
    expect(await rachaDe(prisma, userId, dia(2026, 11, 15))).toBe(0);
  });

  it("y mirada al día siguiente sigue viva (queda el día de hoy)", async () => {
    await diasSeguidos(3);
    expect(await rachaDe(prisma, userId, dia(2026, 10, 4))).toBe(3);
    expect(await rachaDe(prisma, userId, dia(2026, 10, 5))).toBe(0);
  });
});
