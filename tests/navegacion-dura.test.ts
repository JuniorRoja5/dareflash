/**
 * Cuando cambia QUIÉN es el usuario (entrar, salir), la navegación es DURA: `navegarDuro`, nunca
 * `router.push`. Estructural, porque el fallo no se ve en ningún test de comportamiento: solo en un
 * navegador, con lo que el router pre-cargó como invitado (ver src/lib/navegacion-dura.ts). Con
 * `router.push` en el login, un usuario ya logueado caía en /entrar al pulsar el CTA, y el segundo
 * login se quedaba en "Entrando…".
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const leer = (rel: string): string =>
  readFileSync(path.resolve(__dirname, "..", "src", rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("los cambios de identidad navegan en duro", () => {
  it("el LOGIN vuelve con `navegarDuro` y no toca el router de cliente", () => {
    const login = leer("app/entrar/formulario-login.tsx");
    expect(login).toMatch(/navegarDuro\(/);
    expect(login).not.toMatch(/useRouter|router\.(push|replace|refresh)/);
  });

  it("el LOGOUT también", () => {
    const logout = leer("app/(app)/(shell)/usar-cerrar-sesion.ts");
    expect(logout).toMatch(/navegarDuro\(/);
    expect(logout).not.toMatch(/useRouter|router\.(push|replace)/);
  });

  it("`navegarDuro` recarga el documento de verdad", () => {
    expect(leer("lib/navegacion-dura.ts")).toMatch(/window\.location\.assign\(destino\)/);
  });
});
