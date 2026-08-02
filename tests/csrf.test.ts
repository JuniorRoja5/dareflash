import { describe, expect, it } from "vitest";

import { issueCsrfToken, verifyCsrfToken } from "../src/server/auth/csrf";

const SECRET = "TEST-FIXTURE-auth-secret-0123456789abcdef";
const SESSION_A = "hash-de-sesion-A";
const SESSION_B = "hash-de-sesion-B";

describe("CSRF (HMAC atado a la sesion)", () => {
  it("un token emitido para una sesion se verifica con esa sesion", () => {
    const token = issueCsrfToken(SECRET, SESSION_A);
    expect(verifyCsrfToken(SECRET, SESSION_A, token)).toBe(true);
  });

  it("un token de OTRA sesion NO vale (evita que el atacante use su token contra la victima)", () => {
    const tokenA = issueCsrfToken(SECRET, SESSION_A);
    expect(verifyCsrfToken(SECRET, SESSION_B, tokenA)).toBe(false); // <- el punto de la revision
  });

  it("token manipulado o vacio -> invalido", () => {
    const token = issueCsrfToken(SECRET, SESSION_A);
    expect(verifyCsrfToken(SECRET, SESSION_A, `${token}x`)).toBe(false);
    expect(verifyCsrfToken(SECRET, SESSION_A, "sin-punto")).toBe(false);
    expect(verifyCsrfToken(SECRET, SESSION_A, undefined)).toBe(false);
  });

  it("firmado con OTRO secreto -> invalido", () => {
    const token = issueCsrfToken(SECRET, SESSION_A);
    expect(verifyCsrfToken("TEST-FIXTURE-otro-secret-abcdef", SESSION_A, token)).toBe(false);
  });
});
