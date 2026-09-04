/**
 * TRAS VERIFICAR EL CORREO, EL DESTINO ES INICIAR SESIÓN.
 *
 * Verificar la dirección NO deja al usuario dentro de la app: confirma su correo y lo siguiente que
 * quiere es entrar. El botón le mandaba a la home, donde seguía siendo un invitado y tenía que buscar
 * el login por su cuenta — y encima el propio mensaje ya le decía "ya puedes iniciar sesión".
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.join(raiz, rel), "utf8");

const TARJETA = "src/app/verify/tarjeta-verificacion.tsx";
const RUTA = "src/app/api/auth/verify/route.ts";

/** Sobre el CÓDIGO: el comentario que explica por qué ya no va a la home menciona la home. */
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

describe("destino tras verificar", () => {
  /** El bloque del estado "ok" (verificación correcta), que es el único que aquí importa. */
  const bloqueOk = (): string => {
    const src = soloCodigo(leer(TARJETA));
    const desde = src.indexOf('estado === "ok"');
    expect(desde).toBeGreaterThan(-1);
    return src.slice(desde, src.indexOf('estado === "error"'));
  };

  it("lleva a la pantalla de LOGIN, no a la home", () => {
    const ok = bloqueOk();
    expect(ok).toContain('href="/entrar"');
    expect(ok).not.toContain('href="/"');
  });

  it("es la acción principal: es lo único que se puede hacer en esa pantalla", () => {
    expect(bloqueOk()).toContain('variante="principal"');
  });

  it("el botón y el mensaje del servidor dicen LO MISMO", () => {
    // El mensaje ya decía "Ya puedes iniciar sesion" mientras el botón mandaba a la home: la pantalla
    // se contradecía a sí misma.
    expect(leer(RUTA)).toMatch(/iniciar sesion/i);
    expect(bloqueOk()).toMatch(/Iniciar sesión/i);
  });
});
