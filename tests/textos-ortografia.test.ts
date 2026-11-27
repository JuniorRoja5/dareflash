/**
 * EL DICCIONARIO SIN LAS FALTAS QUE YA SE CORRIGIERON (Fase 11 · P5b3, aprobado por Junior el 27 nov).
 *
 * Tres censos sobre TODOS los textos de `src/textos/es.ts` (los valores, no las claves ni los
 * comentarios):
 *  - una LISTA CERRADA de palabras que salieron sin tilde en los mensajes de la API («contrasena»,
 *    «sesion», «invalido»…). Si vuelve una, rojo con su clave. Solo palabras que NO existen sin tilde
 *    en castellano (no «esta» ni «mas», que sí existen): un censo que da rojos falsos se acaba
 *    desactivando;
 *  - ninguna JERGA técnica en un texto de pantalla («CSRF», «token», «origen»): quien la lee no sabe qué
 *    hacer con ella (así hablaban `mutatingRoute` y las pantallas de un enlace incompleto);
 *  - ninguna EDAD escrita: la cifra entra como `{edad}` desde `EDAD_MIN_USO` (el registro decía «16
 *    años» cuando la edad mínima es 18).
 *
 * Para romperlo: escribir «contrasena» en cualquier texto (rojo), «Token CSRF inválido» en `api`
 * (rojo), o «mayor de 18 años» en cualquier texto (rojo).
 */
import { describe, expect, it } from "vitest";

import { es } from "@/textos/es";

/** Todos los textos del diccionario con su clave (también las formas de un plural). */
function textos(v: unknown, ruta: string): [string, string][] {
  if (typeof v === "string") return [[ruta, v]];
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => textos(x, ruta ? `${ruta}.${k}` : k));
  }
  return [];
}
const TODOS = textos(es, "");
/** El texto sin sus huecos: `{categoria}` es un parámetro, no una palabra. */
const sinHuecos = (t: string) => t.replace(/\{[^}]*\}/g, " ");

/** Sin tilde, tal como salieron; ninguna existe así en castellano. */
const SIN_TILDE = [
  "contrasena",
  "contrasenas",
  "sesion",
  "invalido",
  "invalidos",
  "invalida",
  "invalidas",
  "direccion",
  "intentalo",
  "categoria",
  "verificacion",
  "participacion",
  "peticion",
  "asi",
];
const PALABRA_SIN_TILDE = new RegExp(`(?<![\\p{L}])(${SIN_TILDE.join("|")})(?![\\p{L}])`, "iu");

describe("las faltas corregidas no vuelven", () => {
  it("el censo ve una (control)", () => {
    expect(PALABRA_SIN_TILDE.test("La contrasena no es correcta.")).toBe(true);
    expect(PALABRA_SIN_TILDE.test("La contraseña no es correcta.")).toBe(false);
    expect(PALABRA_SIN_TILDE.test("Así que")).toBe(false);
  });

  it("ningún texto del diccionario lleva una de esas palabras sin tilde", () => {
    const fuera = TODOS.filter(([, t]) => PALABRA_SIN_TILDE.test(sinHuecos(t))).map(
      ([k, t]) => `${k}: ${t}`,
    );
    expect(fuera, "una falta que ya se corrigió ha vuelto").toEqual([]);
  });
});

describe("sin jerga en ningún texto de pantalla (usuarios y empresas; el panel no vive aquí)", () => {
  const JERGA = /(?<![\p{L}])(csrf|token|origen|unauthorized|forbidden)(?![\p{L}])/iu;

  it("el censo ve una (control)", () => {
    expect(JERGA.test("Token CSRF inválido o ausente.")).toBe(true);
    expect(JERGA.test("Tu sesión ha caducado. Recarga la página e inténtalo de nuevo.")).toBe(
      false,
    );
  });

  it("ningún texto del diccionario habla de CSRF, tokens ni orígenes", () => {
    // TODO el diccionario, no solo `api` (P5b3): «Falta el token en el enlace» estaba en las
    // pantallas de recuperar, desbloquear, verificar y cambiar el correo.
    const fuera = TODOS.filter(([, t]) => JERGA.test(sinHuecos(t))).map(([k, t]) => `${k}: ${t}`);
    expect(fuera, "jerga técnica en un mensaje que lee una persona").toEqual([]);
  });
});

describe("ninguna edad escrita en el diccionario", () => {
  const EDAD = /\b\d{1,3}\s*años\b/u;

  it("el censo ve una (control)", () => {
    expect(EDAD.test("que tengas al menos 16 años.")).toBe(true);
    expect(EDAD.test("que tengas al menos {edad} años.")).toBe(false);
  });

  it("la cifra entra como `{edad}` desde `EDAD_MIN_USO`, nunca escrita", () => {
    const fuera = TODOS.filter(([, t]) => EDAD.test(t)).map(([k, t]) => `${k}: ${t}`);
    expect(fuera, "una edad escrita se queda desfasada de EDAD_MIN_USO").toEqual([]);
  });
});
