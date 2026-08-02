import argon2 from "argon2";
import { describe, expect, it } from "vitest";

import {
  ARGON2_PARAMS,
  Argon2Sobrecargado,
  DUMMY_HASH,
  hashPassword,
  needsRehash,
  Semaforo,
  verifyPassword,
  verifyPasswordConstantTime,
} from "../src/server/auth/password";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("contrasenas (argon2id)", () => {
  it("hashea con argon2id y verifica correcto/incorrecto", async () => {
    const hash = await hashPassword("TEST-FIXTURE-pass-secreto-largo");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "TEST-FIXTURE-pass-secreto-largo")).toBe(true);
    expect(await verifyPassword(hash, "otro")).toBe(false);
  });

  it("verifyPassword nunca lanza con un hash invalido", async () => {
    expect(await verifyPassword("no-es-un-hash", "x")).toBe(false);
  });

  it("timing-safe: con hash null devuelve false pero SI ejecuta una verificacion", async () => {
    // Sin hash real (usuario inexistente): siempre false, sin lanzar.
    expect(await verifyPasswordConstantTime(null, "cualquiera")).toBe(false);

    const hash = await hashPassword("TEST-FIXTURE-pass-correcta-1234");
    expect(await verifyPasswordConstantTime(hash, "TEST-FIXTURE-pass-correcta-1234")).toBe(true);
    expect(await verifyPasswordConstantTime(hash, "TEST-FIXTURE-pass-incorrecta")).toBe(false);
  });
});

describe("argon2: parametros fijos y coherentes (medidos en el VPS: p=1)", () => {
  it("ARGON2_PARAMS es m=65536, t=3, p=1 y hashPassword lo aplica", async () => {
    expect(ARGON2_PARAMS).toMatchObject({ memoryCost: 65536, timeCost: 3, parallelism: 1 });
    const h = await hashPassword("TEST-FIXTURE-pass-larga-1234");
    expect(h).toContain("m=65536");
    expect(h).toContain("p=1");
    expect(h).toContain("t=3");
  });

  it("DUMMY_HASH lleva EXACTAMENTE los parametros actuales (si divergen, reaparece el oraculo)", () => {
    // needsRehash=false <=> el dummy tiene los mismos params que los hashes reales -> mismo tiempo
    // de verificacion exista o no la cuenta. Este test salta si alguien cambia los params y no el dummy.
    expect(needsRehash(DUMMY_HASH)).toBe(false);
  });

  it("needsRehash detecta un hash con parametros VIEJOS (p=4)", async () => {
    const viejo = await argon2.hash("x", {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    expect(needsRehash(viejo)).toBe(true);
  });
});

describe("semaforo de concurrencia de argon2", () => {
  it("nunca deja correr mas de `max` a la vez y pasa el hueco al que espera", async () => {
    const s = new Semaforo(2, 1000);
    let enVuelo = 0;
    let maxVisto = 0;
    const tarea = (): Promise<void> =>
      s.ejecutar(async () => {
        enVuelo += 1;
        maxVisto = Math.max(maxVisto, enVuelo);
        await sleep(30);
        enVuelo -= 1;
      });
    await Promise.all([tarea(), tarea(), tarea(), tarea()]);
    expect(maxVisto).toBe(2); // 4 tareas, 2 plazas: nunca 3 a la vez
  });

  it("rechaza con Argon2Sobrecargado si no hay hueco dentro del tope de espera", async () => {
    const s = new Semaforo(1, 20);
    const ocupa = s.ejecutar(() => sleep(200)); // toma la unica plaza 200 ms
    // El segundo espera >20 ms sin hueco -> se rechaza (la ruta lo hace 503, no cola infinita).
    await expect(s.ejecutar(async () => "ok")).rejects.toBeInstanceOf(Argon2Sobrecargado);
    await ocupa;
  });
});
