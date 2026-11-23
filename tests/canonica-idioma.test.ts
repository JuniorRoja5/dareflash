/**
 * LA CANÓNICA, EL `hreflang` Y `<html lang>` (Fase 11 · P5a), desde UN sitio: el layout raíz.
 *
 *  - `alternativasDeLaPeticion()` arma la canónica y el `hreflang` a partir de `x-df-ruta` (la pone el
 *    proxy en TODA página; ver `proxy-idioma`): solo idiomas publicados + `x-default`. Sin la cabecera
 *    (panel, build) no publica nada y no lee `APP_URL` (el build corre sin variables).
 *  - El layout raíz la usa en su `generateMetadata`, y ninguna otra página pone sus `alternates`: si una
 *    lo hiciera, taparía la del layout con la suya y dejaría de seguir a los idiomas publicados.
 *  - `<html lang>` es el idioma de la petición, no un literal.
 *
 * Para romperlo: quitar `alternates` del layout (rojo), poner unos `alternates` en una página (rojo con el
 * fichero), devolver la canónica sin `x-df-ruta` (rojo), o volver a `lang="es"` (rojo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ cabeceras: {} as Record<string, string>, leidoAppUrl: 0 }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(H.cabeceras),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/config/env", () => ({
  env: {
    get APP_URL() {
      H.leidoAppUrl += 1;
      return "https://plataforma.test";
    },
  },
}));

import { alternativasDeLaPeticion } from "../src/server/metadatos-idioma";

const SRC = path.join(process.cwd(), "src");
const sinComentarios = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

beforeEach(() => {
  H.cabeceras = {};
  H.leidoAppUrl = 0;
});

describe("alternativasDeLaPeticion", () => {
  it("con la ruta del proxy: canónica absoluta y hreflang de los publicados + x-default", async () => {
    H.cabeceras = { "x-df-idioma": "es", "x-df-ruta": "/retos/abc-x" };
    expect(await alternativasDeLaPeticion()).toEqual({
      canonical: "https://plataforma.test/retos/abc-x",
      languages: {
        es: "https://plataforma.test/retos/abc-x",
        "x-default": "https://plataforma.test/retos/abc-x",
      },
    });
  });

  it("sin la cabecera (panel, build): nada, y sin leer APP_URL", async () => {
    expect(await alternativasDeLaPeticion()).toBeUndefined();
    expect(H.leidoAppUrl).toBe(0);
  });

  it("una ruta rara en la cabecera no se publica", async () => {
    H.cabeceras = { "x-df-ruta": "//otro.example/x" };
    expect(await alternativasDeLaPeticion()).toBeUndefined();
  });
});

describe("un solo sitio", () => {
  const layout = sinComentarios(readFileSync(path.join(SRC, "app", "layout.tsx"), "utf8"));

  it("el layout raíz pone los alternates de la petición en su generateMetadata", () => {
    expect(layout).toMatch(/export async function generateMetadata\(\)/);
    expect(layout).toMatch(/alternates:\s*await alternativasDeLaPeticion\(\)/);
  });

  it("<html lang> es el idioma de la petición, no un literal", () => {
    expect(layout).toMatch(/<html\s+lang=\{idioma\}/);
    expect(layout).not.toMatch(/lang="[a-z]{2}"/);
  });

  it("ninguna otra página ni layout pone sus `alternates` (los taparía)", () => {
    const todos = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = path.join(d, n);
        return statSync(p).isDirectory() ? todos(p) : /\.tsx?$/.test(n) ? [p] : [];
      });
    const conAlternates = todos(path.join(SRC, "app"))
      .filter((f) => f !== path.join(SRC, "app", "layout.tsx"))
      .filter((f) => /\balternates\s*:/.test(sinComentarios(readFileSync(f, "utf8"))))
      .map((f) => path.relative(process.cwd(), f));
    expect(conAlternates, `ponen sus propios alternates: ${conAlternates.join(", ")}`).toEqual([]);
  });
});
