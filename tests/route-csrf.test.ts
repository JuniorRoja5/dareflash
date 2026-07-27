import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Test ESTRUCTURAL (con dientes de verdad): recorre src/app/api/**\/route.ts y falla
 * si algun metodo MUTANTE exportado (POST/PUT/PATCH/DELETE) no pasa por el envoltorio
 * `mutatingRoute` (Origin + sesion + CSRF). No depende de que nadie se acuerde de
 * llamar a un helper: si alguien anade un POST sin proteger, esto se pone rojo.
 *
 * La comprobacion es POR METODO, no por fichero: un route.ts con el POST envuelto pero
 * un DELETE suelto tiene que caer (antes, un simple `includes("mutatingRoute(")` a nivel
 * de fichero lo daba por bueno). Y reconoce las tres formas de exportar un handler:
 * `export const M = ...`, `export function M`, `export async function M`.
 *
 * Exenciones JUSTIFICADAS: puntos de entrada sin sesion a la que atar el token CSRF
 * (sameSite=lax + rate-limit los cubren).
 */
const API_DIR = join(process.cwd(), "src", "app", "api");

// Rutas exentas (ruta relativa dentro de src/app/api, con "/").
const EXEMPT = new Set(["auth/login", "auth/register", "auth/verify", "auth/resend-verification"]);

const METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * ¿El fichero exporta el metodo `m`? Cubre las cuatro formas que Next acepta:
 *  - `export const M = ...`
 *  - `export function M` / `export async function M`
 *  - `export { handler as M }` (lista de exportacion, con o sin alias)
 * La ultima es la mas peligrosa: si el escaner no la ve, la ruta pasa SIN examinar
 * (fallo silencioso). Como `envueltoEnMutatingRoute` solo reconoce la forma canonica
 * `export const M = mutatingRoute(...)`, una exportacion por lista queda marcada como
 * desprotegida -> obliga a usar la forma canonica, que es justo lo que queremos.
 */
function exportaMetodo(src: string, m: string): boolean {
  const directo = new RegExp(`export\\s+(?:const\\s+${m}\\b|(?:async\\s+)?function\\s+${m}\\b)`);
  const porLista = new RegExp(`export\\s*\\{[^}]*\\b${m}\\b[^}]*\\}`);
  return directo.test(src) || porLista.test(src);
}

/** ¿Ese metodo se exporta envuelto en mutatingRoute? (admite generico `mutatingRoute<...>(`) */
function envueltoEnMutatingRoute(src: string, m: string): boolean {
  return new RegExp(`export\\s+const\\s+${m}\\s*=\\s*mutatingRoute\\b`).test(src);
}

/**
 * Metodos MUTANTES de este fichero que NO estan protegidos. Si la ruta esta exenta,
 * ninguno cuenta (es un punto de entrada sin sesion, justificado).
 */
function metodosDesprotegidos(rel: string, src: string, exempt: Set<string>): string[] {
  if (exempt.has(rel)) return [];
  return METHODS.filter((m) => exportaMetodo(src, m) && !envueltoEnMutatingRoute(src, m));
}

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
  it("todo metodo POST/PUT/PATCH/DELETE pasa por mutatingRoute (o esta exento y justificado)", () => {
    const files = findRouteFiles(API_DIR);
    expect(files.length).toBeGreaterThan(0); // sanity: el escaner encuentra rutas

    const desprotegidas: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const rel = relative(API_DIR, file)
        .split(sep)
        .join(posix.sep)
        .replace(/\/route\.ts$/, "");
      const bad = metodosDesprotegidos(rel, src, EXEMPT);
      if (bad.length > 0) desprotegidas.push(`${rel} [${bad.join(",")}]`);
    }

    expect(
      desprotegidas,
      `metodos mutantes SIN mutatingRoute: ${desprotegidas.join(" | ")}`,
    ).toEqual([]);
  });

  // --- Dientes: el escaner sobre entradas sinteticas (no depende de las rutas reales) ---
  const VACIO = new Set<string>();

  it("caza `export function POST` sin async y sin envolver (el hueco del regex viejo)", () => {
    expect(metodosDesprotegidos("x/y", "export function POST() {}", VACIO)).toEqual(["POST"]);
  });

  it("es POR METODO: caza el DELETE suelto aunque el POST del mismo fichero SI este envuelto", () => {
    const src = [
      "export const POST = mutatingRoute(async () => new Response());",
      "export async function DELETE() { return new Response(); }",
    ].join("\n");
    expect(metodosDesprotegidos("x/y", src, VACIO)).toEqual(["DELETE"]);
  });

  it("acepta un metodo envuelto, incluida la forma generica mutatingRoute<...>()", () => {
    const src =
      "export const DELETE = mutatingRoute<{ params: Promise<{ id: string }> }>(async () => new Response());";
    expect(metodosDesprotegidos("x/y", src, VACIO)).toEqual([]);
  });

  it("caza `export { handler as POST }` (lista de exportacion) sin proteger", () => {
    const src = [
      "async function handler() { return new Response(); }",
      "export { handler as POST };",
    ].join("\n");
    expect(metodosDesprotegidos("x/y", src, VACIO)).toEqual(["POST"]);
  });

  it("respeta la exencion justificada aunque el metodo no este envuelto", () => {
    expect(metodosDesprotegidos("auth/login", "export async function POST() {}", EXEMPT)).toEqual(
      [],
    );
  });
});
