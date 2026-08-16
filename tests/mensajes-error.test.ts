/**
 * Mapeo de errores de API a copy humano. Un solo `mensajeError` (antes duplicado en login/registro).
 * Con DIENTES: los codigos compartidos dan el mismo mensaje; el 400 y el generico son POR CONTEXTO
 * (no se colapsan: el 400 de registro habla de edad/contrasena y no vale para login); un codigo
 * desconocido cae SIEMPRE en el generico seguro del contexto.
 */
import { describe, expect, it } from "vitest";

import { mensajeError, MSG_LOGIN, MSG_REGISTRO } from "../src/lib/mensajes-error";

describe("mensajeError", () => {
  it("codigos COMPARTIDOS: rate-limit (429/RATE_LIMITED) y servicio ocupado (503/OVERLOADED)", () => {
    expect(mensajeError(429, "", MSG_LOGIN)).toMatch(/Demasiados intentos/);
    expect(mensajeError(200, "RATE_LIMITED", MSG_REGISTRO)).toMatch(/Demasiados intentos/);
    expect(mensajeError(503, "", MSG_LOGIN)).toMatch(/ocupado/);
    expect(mensajeError(200, "OVERLOADED", MSG_REGISTRO)).toMatch(/ocupado/);
  });

  it("login: credenciales -> mismo mensaje (sin enumerar); 400 y generico propios", () => {
    expect(mensajeError(401, "", MSG_LOGIN)).toBe("Correo o contraseña incorrectos.");
    expect(mensajeError(200, "INVALID_CREDENTIALS", MSG_LOGIN)).toBe(
      "Correo o contraseña incorrectos.",
    );
    expect(mensajeError(400, "", MSG_LOGIN)).toBe(MSG_LOGIN.validacion);
    expect(mensajeError(500, "CUALQUIERA", MSG_LOGIN)).toBe(MSG_LOGIN.generico);
  });

  it("registro: NO trata 401 como credencial; 400 y generico propios", () => {
    // Sin `credenciales`, un 401 NO da el mensaje de credencial: cae en el generico (como antes).
    expect(mensajeError(401, "", MSG_REGISTRO)).toBe(MSG_REGISTRO.generico);
    expect(mensajeError(400, "", MSG_REGISTRO)).toBe(MSG_REGISTRO.validacion);
    expect(mensajeError(500, "DESCONOCIDO", MSG_REGISTRO)).toBe(MSG_REGISTRO.generico);
  });

  it("el 400 de registro y el de login son DISTINTOS (no se colapsan)", () => {
    expect(mensajeError(400, "", MSG_REGISTRO)).not.toBe(mensajeError(400, "", MSG_LOGIN));
  });
});
