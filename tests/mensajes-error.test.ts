/**
 * Mapeo de errores de API a copy humano. Una sola regla (`motivoDeError`, antes `mensajeError`,
 * duplicado en login/registro) y, desde la P5b3, las FRASES de cada pantalla en su espacio del
 * diccionario. Con DIENTES: los códigos compartidos dan el mismo mensaje (`errorComun`); el 400 y el
 * genérico son POR PANTALLA (no se colapsan: el 400 de registro habla de edad/contraseña y no vale para
 * login); un código desconocido cae SIEMPRE en el genérico seguro de la pantalla.
 */
import { describe, expect, it } from "vitest";

import { es } from "@/textos/es";

import { fraseDeError, motivoDeError, type FrasesDeError } from "../src/lib/mensajes-error";

const COMUNES = { limite: es.errorComun.limite, ocupado: es.errorComun.ocupado };
const LOGIN: FrasesDeError = {
  ...COMUNES,
  credenciales: es.login.errorCredenciales,
  validacion: es.login.errorValidacion,
  generico: es.login.errorConexion,
};
const REGISTRO: FrasesDeError = {
  ...COMUNES,
  validacion: es.registro.errorValidacion,
  generico: es.registro.errorConexion,
};
const login = (status: number, code: string) =>
  fraseDeError(motivoDeError(status, code, { credenciales: true }), LOGIN);
const registro = (status: number, code: string) =>
  fraseDeError(motivoDeError(status, code), REGISTRO);

describe("motivoDeError + las frases de cada pantalla", () => {
  it("códigos COMPARTIDOS: rate-limit (429/RATE_LIMITED) y servicio ocupado (503/OVERLOADED)", () => {
    expect(login(429, "")).toMatch(/Demasiados intentos/);
    expect(registro(200, "RATE_LIMITED")).toMatch(/Demasiados intentos/);
    expect(login(503, "")).toMatch(/ocupado/);
    expect(registro(200, "OVERLOADED")).toMatch(/ocupado/);
  });

  it("login: credenciales -> mismo mensaje (sin enumerar); 400 y genérico propios", () => {
    expect(login(401, "")).toBe("Correo o contraseña incorrectos.");
    expect(login(200, "INVALID_CREDENTIALS")).toBe("Correo o contraseña incorrectos.");
    expect(login(400, "")).toBe(LOGIN.validacion);
    expect(login(500, "CUALQUIERA")).toBe(LOGIN.generico);
  });

  it("registro: NO trata 401 como credencial; 400 y genérico propios", () => {
    // Sin `credenciales`, un 401 NO da el mensaje de credencial: cae en el genérico (como antes).
    expect(registro(401, "")).toBe(REGISTRO.generico);
    expect(registro(400, "")).toBe(REGISTRO.validacion);
    expect(registro(500, "DESCONOCIDO")).toBe(REGISTRO.generico);
  });

  it("el 400 de registro y el de login son DISTINTOS (no se colapsan)", () => {
    expect(registro(400, "")).not.toBe(login(400, ""));
  });

  it("las frases son las de antes (P5b3: el castellano no cambia)", () => {
    expect(LOGIN.validacion).toBe("Revisa el correo y la contraseña.");
    expect(LOGIN.generico).toBe("No se pudo iniciar sesión. Reintenta.");
    expect(REGISTRO.generico).toBe("No se pudo crear la cuenta. Reintenta.");
    expect(COMUNES.limite).toBe("Demasiados intentos, espera un momento.");
    expect(COMUNES.ocupado).toBe("El servicio está ocupado. Reinténtalo en unos segundos.");
  });
});
