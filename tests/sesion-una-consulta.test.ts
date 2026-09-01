/**
 * `getCurrentUser` se resuelve UNA vez por petición.
 *
 * ESTE TEST ES ESTRUCTURAL A PROPÓSITO, y conviene saber por qué antes de "mejorarlo": `cache()` de
 * React solo deduplica donde React establece el ámbito de petición (Server Components y route
 * handlers del App Router). En un test de Node NO hay ámbito, así que llamar dos veces a la función
 * memoizada ejecuta el cuerpo dos veces — comprobado. Un test de comportamiento aquí no probaría
 * nada: pasaría igual con y sin el arreglo.
 *
 * La prueba de COMPORTAMIENTO se hizo como traza sobre una petición real (log de consultas de
 * MariaDB sobre `/perfil`, servidor de desarrollo, sesión válida):
 *   - sin `cache()`: cuerpo ejecutado 2 veces, 1 consulta a `Session` (la juntaba el batching de
 *     `findUnique` de Prisma, que depende de que las dos llamadas caigan en el mismo tick).
 *   - con `cache()`: cuerpo ejecutado 1 vez, 1 consulta. La propiedad deja de depender de los tiempos.
 * Está en el mensaje del commit; repetirla es `SET GLOBAL general_log=1` + una petición autenticada.
 *
 * Lo que este test SÍ impide es la regresión silenciosa: que alguien quite el envoltorio y volvamos a
 * depender de la casualidad sin que nada avise.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const FUENTE = readFileSync(
  join(process.cwd(), "src", "server", "auth", "current-user.ts"),
  "utf8",
);
/** Sin comentarios: la palabra `cache` en una explicación no memoiza nada. */
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("getCurrentUser está memoizado por petición", () => {
  it("se exporta envuelto en `cache()` de React", () => {
    expect(CODIGO).toMatch(/import \{ cache \} from "react";/);
    expect(CODIGO).toMatch(/export const getCurrentUser = cache\(/);
  });

  it("no se ha convertido en una caché entre peticiones (eso sí sería un fallo de seguridad)", () => {
    // `cache()` muere con la petición. Un `unstable_cache`, un TTL o un Map a nivel de módulo
    // compartirían la sesión de un usuario con otro: exactamente lo que NO puede pasar aquí.
    expect(CODIGO).not.toMatch(/unstable_cache|revalidate|new Map\(/);
  });

  it("sigue leyendo la cookie y delegando en `validateSession` (mismo contrato de antes)", () => {
    expect(CODIGO).toContain("SESSION_COOKIE");
    expect(CODIGO).toContain("validateSession(prisma, token)");
  });
});
