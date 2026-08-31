/**
 * Test ESTRUCTURAL del Caddyfile: HTTP/3 (QUIC) tiene que seguir DESACTIVADO.
 *
 * Por que merece un test, como el de `noindex`: el default de Caddy es `h1 h2 h3`, asi que basta con
 * BORRAR el bloque de opciones globales para que h3 vuelva solo, sin que nada falle ni avise. Y su
 * vuelta no se nota en local ni en CI —solo en produccion, y solo al forzar recarga— porque el fallo
 * depende de la ruta de red entre el cliente y el VPS: Caddy anuncia `Alt-Svc: h3`, una conexion NUEVA
 * intenta QUIC sobre UDP, el UDP no llega y la peticion se cuelga sin establecerse. Es exactamente la
 * clase de regresion que nadie encuentra revisando un diff.
 *
 * No comprueba la sintaxis (de eso se encarga `caddy validate`, y se paso antes de commitear): fija la
 * DECISION.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CADDYFILE = readFileSync(join(process.cwd(), "caddy", "Caddyfile"), "utf8");

/** Lineas de CONFIGURACION (sin comentarios): el `h3` de una explicacion no es un `h3` activo. */
const CONFIG = CADDYFILE.split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

describe("Caddyfile · HTTP/3 desactivado", () => {
  it("declara explicitamente los protocolos, sin h3", () => {
    // Espacios flexibles, orden fijo: h1 y h2 (activar h2 implica h1, segun la doc de Caddy).
    expect(CONFIG).toMatch(/servers\s*\{[\s\S]*?protocols\s+h1\s+h2\s*(\n|\})/);
  });

  it("no activa h3 en ninguna parte de la configuracion", () => {
    expect(CONFIG).not.toMatch(/\bh3\b/);
  });

  it("el bloque de opciones globales es el PRIMER bloque (si no, Caddy no arranca)", () => {
    // Caddy exige que las opciones globales vayan en el primer bloque del fichero. Si alguien las
    // mueve debajo del bloque del dominio, el contenedor no levanta — mejor caerlo aqui.
    const primeraLlave = CONFIG.indexOf("{");
    const antesDeLaLlave = CONFIG.slice(0, primeraLlave).trim();
    expect(antesDeLaLlave).toBe(""); // nada (ni un nombre de sitio) antes de la primera llave
    expect(CONFIG.slice(primeraLlave)).toMatch(/^\{\s*\n\s*servers\s*\{/);
  });

  it("sigue proxyando a la app y fijando X-Real-IP (el rate-limit depende de esa cabecera)", () => {
    // El cambio de protocolos no puede haberse llevado por delante lo que ya funcionaba.
    expect(CONFIG).toContain("reverse_proxy web:3000");
    expect(CONFIG).toMatch(/header_up X-Real-IP \{remote_host\}/);
  });
});
