/**
 * Test ESTRUCTURAL del Caddyfile: las CABECERAS DE SEGURIDAD siguen ahí, y con el valor conservador
 * con el que se decidieron.
 *
 * Por qué merece un test, como el de `noindex` o el de h3: una cabecera que desaparece **no rompe
 * nada**. La app sigue funcionando igual, ningún test de producto se cae, el despliegue sale verde —
 * y el sitio se queda sin la protección sin que nadie se entere. Es exactamente la clase de regresión
 * que no se ve revisando un diff.
 *
 * NO comprueba sintaxis (de eso se encarga `caddy validate`, que se pasó con la imagen real antes de
 * commitear) ni que lleguen al navegador (eso es la verificación EN VIVO con `curl -sI` tras
 * desplegar, que es la otra mitad de esta pieza). Fija las DECISIONES.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const CADDYFILE = readFileSync(join(RAIZ, "caddy", "Caddyfile"), "utf8");

/** Solo CONFIGURACIÓN: una cabecera nombrada en un comentario no protege nada. */
const CONFIG = CADDYFILE.split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

describe("Caddyfile · cabeceras de seguridad presentes", () => {
  it.each([
    ["X-Content-Type-Options", /X-Content-Type-Options\s+"nosniff"/],
    ["X-Frame-Options", /X-Frame-Options\s+"DENY"/],
    ["Referrer-Policy", /Referrer-Policy\s+"strict-origin-when-cross-origin"/],
    ["Permissions-Policy", /Permissions-Policy\s+"[^"]+"/],
    ["Strict-Transport-Security", /Strict-Transport-Security\s+"max-age=\d+"/],
    ["Content-Security-Policy-Report-Only", /Content-Security-Policy-Report-Only\s+"[^"]+"/],
  ])("%s", (_nombre, patron) => {
    expect(CONFIG).toMatch(patron);
  });

  it("se definen UNA vez (snippet) y se importan donde hagan falta: nada de listas copiadas", () => {
    expect(CONFIG).toMatch(/\(cabeceras_seguridad\)\s*\{/);
    // Importado en los dos sitios (apex y www); definido en uno solo.
    expect(CONFIG.match(/import cabeceras_seguridad/g)).toHaveLength(2);
    expect(CONFIG.match(/X-Frame-Options/g)).toHaveLength(1);
  });
});

describe("Caddyfile · HSTS conservador (aún no es irreversible)", () => {
  const hsts = /Strict-Transport-Security\s+"([^"]+)"/.exec(CONFIG)?.[1] ?? "";

  it("max-age corto: horas o pocos días, NUNCA un año todavía", () => {
    // HSTS es PEGAJOSO: el navegador recuerda el valor. Con un año encima, un fallo de certificado
    // no tiene vuelta atrás para quien ya lo recibió. Se sube cuando llevemos semanas sin fallos.
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? "0");
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(7 * 24 * 3600); // <= 7 días
  });

  it("sin `preload` (entrar en la lista de los navegadores es casi irreversible)", () => {
    expect(hsts).not.toMatch(/preload/);
  });

  it("sin `includeSubDomains` (mail.dareflash.com es OTRA máquina, no la servimos nosotros)", () => {
    expect(hsts).not.toMatch(/includeSubDomains/i);
  });
});

describe("Caddyfile · la CSP no puede romper la app", () => {
  const csp = /Content-Security-Policy-Report-Only\s+"([^"]+)"/.exec(CONFIG)?.[1] ?? "";

  it("va en REPORT-ONLY: nunca en enforce sin conocer el conjunto exacto de orígenes", () => {
    expect(csp).not.toBe("");
    // Que no exista la variante que SÍ bloquea. Ponerla sin haber visto los reportes es el fallo.
    expect(CONFIG).not.toMatch(/^\s*Content-Security-Policy\s+"/m);
  });

  it.each([
    // hls.js reproduce por MediaSource: el <video> apunta a un blob:, no a una URL. Sin esto, negro.
    ["media-src con blob:", /media-src[^;]*\bblob:/],
    // hls.js demultiplexa en un Web Worker creado desde un blob.
    ["worker-src con blob:", /worker-src[^;]*\bblob:/],
    // La playlist y los segmentos los pide hls.js al CDN de Bunny.
    ["connect-src con el CDN", /connect-src[^;]*b-cdn\.net/],
    // La subida del vídeo va DIRECTA del navegador al endpoint TUS de Bunny.
    ["connect-src con el endpoint TUS", /connect-src[^;]*video\.bunnycdn\.com/],
    // Los pósters del CDN.
    ["img-src con el CDN", /img-src[^;]*b-cdn\.net/],
    // Next inyecta scripts en línea para arrancar React y el payload RSC.
    ["script-src permite lo que Next necesita", /script-src[^;]*'unsafe-inline'/],
  ])("permite lo que la app SÍ usa: %s", (_nombre, patron) => {
    expect(csp).toMatch(patron);
  });

  it("prohíbe el framing también por CSP (además del X-Frame-Options)", () => {
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });

  it("no abre el CDN con un comodín (valdría para la zona de cualquier otro cliente de Bunny)", () => {
    expect(csp).not.toMatch(/\*\.b-cdn\.net/);
  });
});

describe("no se pisa lo que ya existía", () => {
  it("el X-Robots-Tag sigue en next.config.ts y NO se duplica en Caddy", () => {
    // Duplicarlo daría dos fuentes de verdad para la misma decisión; su test vive en `noindex`.
    expect(readFileSync(join(RAIZ, "next.config.ts"), "utf8")).toContain("X-Robots-Tag");
    expect(CONFIG).not.toMatch(/X-Robots-Tag/);
  });

  it("siguen el proxy a la app y el X-Real-IP del que depende el rate-limit", () => {
    expect(CONFIG).toContain("reverse_proxy web:3000");
    expect(CONFIG).toMatch(/header_up X-Real-IP \{remote_host\}/);
  });
});
