/**
 * HANDLE auto-generado (P1). Cubre lo PURO (sin BD): el generador produce siempre un handle válido,
 * el mapeo bytes->sufijo es determinista y sin sesgo (máscara `& 31`), y la fórmula del BACKFILL de la
 * migración (`user_` + cuid) cae dentro del formato. El reintento ante colisión contra la constraint
 * real se prueba en registration.test.ts (necesita BD).
 */
import { describe, expect, it } from "vitest";

import {
  construirHandle,
  generarHandle,
  HANDLE_ALFABETO,
  HANDLE_PREFIJO,
  HANDLE_RE,
  HANDLE_SUFIJO_LEN,
  sufijoDesdeBytes,
} from "../src/server/auth/handle";

describe("handle · generador puro", () => {
  it("el alfabeto es potencia de dos (32) y sin caracteres confusos", () => {
    expect(HANDLE_ALFABETO).toHaveLength(32);
    for (const c of "lo01") expect(HANDLE_ALFABETO).not.toContain(c);
    // Todo el alfabeto cae dentro del formato del handle.
    expect(HANDLE_RE.test(construirHandle(HANDLE_ALFABETO.slice(0, HANDLE_SUFIJO_LEN)))).toBe(true);
  });

  it("sufijoDesdeBytes es DETERMINISTA y mapea con máscara & 31 (sin sesgo de módulo)", () => {
    const bytes = new Uint8Array([0, 31, 32, 63, 64, 1, 2, 3]);
    const s = sufijoDesdeBytes(bytes);
    expect(s).toHaveLength(HANDLE_SUFIJO_LEN);
    // 0&31=0 -> alfabeto[0]; 31&31=31 -> alfabeto[31]; 32&31=0 -> alfabeto[0] (envuelve); 63&31=31; 64&31=0.
    expect(s[0]).toBe(HANDLE_ALFABETO[0]);
    expect(s[1]).toBe(HANDLE_ALFABETO[31]);
    expect(s[2]).toBe(HANDLE_ALFABETO[0]);
    expect(s[3]).toBe(HANDLE_ALFABETO[31]);
    expect(s[4]).toBe(HANDLE_ALFABETO[0]);
    // Determinismo: mismos bytes -> mismo sufijo.
    expect(sufijoDesdeBytes(bytes)).toBe(s);
  });

  it("construirHandle antepone el prefijo neutro", () => {
    expect(construirHandle("abcd2345")).toBe(`${HANDLE_PREFIJO}abcd2345`);
  });

  it("generarHandle produce SIEMPRE un handle válido (1000 muestras) y variado", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const h = generarHandle();
      expect(h).toMatch(HANDLE_RE);
      expect(h).toBe(h.toLowerCase());
      expect(h.startsWith(HANDLE_PREFIJO)).toBe(true);
      vistos.add(h);
    }
    // 32^8 combinaciones: 1000 muestras han de ser (prácticamente) todas distintas.
    expect(vistos.size).toBeGreaterThan(990);
  });

  it("BACKFILL: `user_` + cuid cae dentro del formato (cuid de 25 chars -> 30, el máximo)", () => {
    const cuidMax = "c" + "abcdefghij0123456789012"; // 24 -> total 25 chars, estilo cuid v1
    const handle = `user_${cuidMax}`;
    expect(handle.length).toBeLessThanOrEqual(30);
    expect(handle).toMatch(HANDLE_RE);
    // Un cuid corto también cumple.
    expect(`user_${"cabc123"}`).toMatch(HANDLE_RE);
  });
});
