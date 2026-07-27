import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Test ESTRUCTURAL (con dientes de verdad): recorre src/app/api/**\/route.ts y falla
 * si alguna ruta que exporta un metodo MUTANTE (POST/PUT/PATCH/DELETE) no pasa por el
 * envoltorio `mutatingRoute` (Origin + sesion + CSRF). No depende de que nadie se
 * acuerde de llamar a un helper: si alguien anade un POST sin proteger, esto se pone
 * rojo.
 *
 * Exenciones JUSTIFICADAS: puntos de entrada sin sesion a la que atar el token CSRF
 * (sameSite=lax + rate-limit los cubren).
 */
const API_DIR = join(process.cwd(), "src", "app", "api");

// Rutas exentas (ruta relativa dentro de src/app/api, con "/").
const EXEMPT = new Set(["auth/login", "auth/register", "auth/verify", "auth/resend-verification"]);

const MUTATING = /export\s+(?:const|async\s+function)\s+(POST|PUT|PATCH|DELETE)\b/;

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("proteccion estructural CSRF de rutas mutantes", () => {
  it("toda ruta con POST/PUT/PATCH/DELETE pasa por mutatingRoute (o esta exenta y justificada)", () => {
    const files = findRouteFiles(API_DIR);
    expect(files.length).toBeGreaterThan(0); // sanity: el escaner encuentra rutas

    const desprotegidas: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!MUTATING.test(src)) continue; // no muta: no aplica

      // Ruta relativa "auth/login" a partir de .../api/<ruta>/route.ts
      const rel = relative(API_DIR, file)
        .split(sep)
        .join(posix.sep)
        .replace(/\/route\.ts$/, "");
      if (EXEMPT.has(rel)) continue;

      if (!src.includes("mutatingRoute(")) desprotegidas.push(rel);
    }

    expect(desprotegidas, `rutas mutantes SIN mutatingRoute: ${desprotegidas.join(", ")}`).toEqual(
      [],
    );
  });
});
