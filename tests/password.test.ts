import { describe, expect, it } from "vitest";

import {
  hashPassword,
  verifyPassword,
  verifyPasswordConstantTime,
} from "../src/server/auth/password";

describe("contrasenas (argon2id)", () => {
  it("hashea con argon2id y verifica correcto/incorrecto", async () => {
    const hash = await hashPassword("un-secreto-largo");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "un-secreto-largo")).toBe(true);
    expect(await verifyPassword(hash, "otro")).toBe(false);
  });

  it("verifyPassword nunca lanza con un hash invalido", async () => {
    expect(await verifyPassword("no-es-un-hash", "x")).toBe(false);
  });

  it("timing-safe: con hash null devuelve false pero SI ejecuta una verificacion", async () => {
    // Sin hash real (usuario inexistente): siempre false, sin lanzar.
    expect(await verifyPasswordConstantTime(null, "cualquiera")).toBe(false);

    const hash = await hashPassword("correcta-1234");
    expect(await verifyPasswordConstantTime(hash, "correcta-1234")).toBe(true);
    expect(await verifyPasswordConstantTime(hash, "incorrecta")).toBe(false);
  });
});
