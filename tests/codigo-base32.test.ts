/**
 * Primitiva PURA codigoBase32 (M2). Compartida por el handle y el publicCode de retos. Con dientes:
 * determinismo, máscara `& 31` (sin sesgo), alfabeto sin confusos, y que el handle sigue byte-idéntico.
 */
import { describe, expect, it } from "vitest";

import { codigoBase32, CODIGO_BASE32_ALFABETO } from "../src/lib/codigo-base32";
import { sufijoDesdeBytes } from "../src/server/auth/handle";

describe("codigoBase32", () => {
  it("alfabeto de 32 sin caracteres confusos (l, o, 0, 1)", () => {
    expect(CODIGO_BASE32_ALFABETO).toHaveLength(32);
    for (const c of "lo01") expect(CODIGO_BASE32_ALFABETO).not.toContain(c);
  });

  it("determinista y con máscara & 31 (mismos bytes -> mismo código; envuelve en 32)", () => {
    const bytes = new Uint8Array([0, 31, 32, 63, 1]);
    const s = codigoBase32(bytes, 5);
    expect(s[0]).toBe(CODIGO_BASE32_ALFABETO[0]); // 0 & 31 = 0
    expect(s[1]).toBe(CODIGO_BASE32_ALFABETO[31]); // 31 & 31 = 31
    expect(s[2]).toBe(CODIGO_BASE32_ALFABETO[0]); // 32 & 31 = 0 (envuelve)
    expect(s[3]).toBe(CODIGO_BASE32_ALFABETO[31]); // 63 & 31 = 31
    expect(codigoBase32(bytes, 5)).toBe(s);
  });

  it("respeta la longitud pedida", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(codigoBase32(bytes, 3)).toHaveLength(3);
    expect(codigoBase32(bytes, 8)).toHaveLength(8);
  });

  it("REUSO: el handle (sufijoDesdeBytes) sigue byte-idéntico a codigoBase32(bytes, 8)", () => {
    const bytes = new Uint8Array([200, 17, 4, 255, 0, 128, 63, 42]);
    expect(sufijoDesdeBytes(bytes)).toBe(codigoBase32(bytes, 8));
  });
});
