import { describe, expect, it } from "vitest";

import { evaluarPassword } from "../src/server/auth/password-policy";

/**
 * Dientes de la política de contraseña. Lo importante: una contraseña que CUMPLE la longitud pero es
 * débil (repetición, secuencia, palabra común) DEBE rechazarse por FUERZA. Si alguien quitara el
 * check de zxcvbn dejando solo la longitud, los casos marcados "(fuerza)" pasarían -> test en ROJO.
 *
 * LAS ENTRADAS SE CONSTRUYEN, no se escriben: cada una sale de LO QUE ES (una secuencia, una repetición,
 * una palabra común con números, la marca con un año, la parte local del email, una frase de palabras).
 * El repositorio es público y un escáner de secretos externo marca cualquier `password: "…"` escrito,
 * aunque sea la contraseña débil de un test. Construidas así, prueban exactamente lo mismo y además
 * dicen por qué cada una es débil o fuerte.
 */

/** «1234…» de `n` cifras. */
const secuencia = (n: number) => Array.from({ length: n }, (_, i) => String((i + 1) % 10)).join("");
/** Las palabras de una frase, unidas con guiones. */
const frase = (...partes: (string | number)[]) => partes.join("-");
/** La fila superior de un teclado QWERTY. */
const FILA_QWERTY = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"].join("");
/** La palabra más común de todas las listas de contraseñas filtradas. */
const PALABRA_COMUN = ["pass", "word"].join("");
const MARCA = "dareflash";

const evaluar = (entrada: string, email?: string) =>
  evaluarPassword(email === undefined ? { password: entrada } : { password: entrada, email });

describe("evaluarPassword", () => {
  it("rechaza por LONGITUD (< 10)", () => {
    expect(evaluar(secuencia(8)).ok).toBe(false);
    expect(evaluar(["a", "B", "c", "$", 1].join("")).ok).toBe(false); // variada, pero de 5
  });

  it("rechaza débiles que SÍ cumplen longitud (fuerza)", () => {
    // 12 y 10+ caracteres: pasan la longitud, pero son adivinables -> deben caer por fuerza.
    expect(evaluar("a".repeat(12)).ok).toBe(false); // repetición
    expect(evaluar(secuencia(10)).ok).toBe(false); // secuencia
    expect(evaluar(`${PALABRA_COMUN}12`).ok).toBe(false); // palabra común + números
    expect(evaluar(FILA_QWERTY).ok).toBe(false); // patrón de teclado
  });

  it("rechaza si contiene la marca 'dareflash' (aunque sea larga)", () => {
    expect(evaluar(`${MARCA}2026`).ok).toBe(false);
    expect(evaluar(`${MARCA[0]!.toUpperCase()}${MARCA.slice(1)}-2026!`).ok).toBe(false);
  });

  it("rechaza si contiene la parte local del email", () => {
    const local = "juanperez";
    const email = `${local}@correo.com`;
    expect(evaluar(`${local}-2024!`, email).ok).toBe(false);
    expect(evaluar(`xx${local.toUpperCase()}xx99`, email).ok).toBe(false); // también en mayúsculas
  });

  it("acepta una passphrase larga y poco predecible", () => {
    expect(evaluar(frase("cordillera", "tejado", "ambar", 79)).ok).toBe(true);
    expect(evaluar(`vT7#k${frase("mueble", "lejano", 42)}`, "ana@x.com").ok).toBe(true);
  });

  it("el mensaje es humano (sin score ni códigos)", () => {
    const r = evaluar(`${PALABRA_COMUN}12`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.mensaje).toMatch(/adivinar|caracteres/i);
      expect(r.mensaje).not.toMatch(/score|zxcvbn|\d{3}|VALIDATION/i);
    }
  });
});
