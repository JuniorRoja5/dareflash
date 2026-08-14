import { describe, expect, it } from "vitest";

import { evaluarPassword } from "../src/server/auth/password-policy";

/**
 * Dientes de la política de contraseña. Lo importante: una contraseña que CUMPLE la longitud pero es
 * débil (repetición, secuencia, palabra común) DEBE rechazarse por FUERZA. Si alguien quitara el
 * check de zxcvbn dejando solo la longitud, los casos marcados "(fuerza)" pasarían -> test en ROJO.
 */
describe("evaluarPassword", () => {
  it("rechaza por LONGITUD (< 10)", () => {
    expect(evaluarPassword({ password: "12345678" }).ok).toBe(false);
    expect(evaluarPassword({ password: "aBc$1" }).ok).toBe(false);
  });

  it("rechaza débiles que SÍ cumplen longitud (fuerza)", () => {
    // 12 y 10+ caracteres: pasan la longitud, pero son adivinables -> deben caer por fuerza.
    expect(evaluarPassword({ password: "aaaaaaaaaaaa" }).ok).toBe(false); // repetición
    expect(evaluarPassword({ password: "1234567890" }).ok).toBe(false); // secuencia
    expect(evaluarPassword({ password: "password12" }).ok).toBe(false); // palabra común + números
    expect(evaluarPassword({ password: "qwertyuiop" }).ok).toBe(false); // patrón de teclado
  });

  it("rechaza si contiene la marca 'dareflash' (aunque sea larga)", () => {
    expect(evaluarPassword({ password: "dareflash2026" }).ok).toBe(false);
    expect(evaluarPassword({ password: "Dareflash-2026!" }).ok).toBe(false);
  });

  it("rechaza si contiene la parte local del email", () => {
    const email = "juanperez@correo.com";
    expect(evaluarPassword({ password: "juanperez-2024!", email }).ok).toBe(false);
    expect(evaluarPassword({ password: "xxJUANPEREZxx99", email }).ok).toBe(false);
  });

  it("acepta una passphrase larga y poco predecible", () => {
    expect(evaluarPassword({ password: "cordillera-tejado-ambar-79" }).ok).toBe(true);
    expect(evaluarPassword({ password: "vT7#kmueble-lejano-42", email: "ana@x.com" }).ok).toBe(
      true,
    );
  });

  it("el mensaje es humano (sin score ni códigos)", () => {
    const r = evaluarPassword({ password: "password12" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.mensaje).toMatch(/adivinar|caracteres/i);
      expect(r.mensaje).not.toMatch(/score|zxcvbn|\d{3}|VALIDATION/i);
    }
  });
});
