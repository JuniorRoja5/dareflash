/**
 * LA PÁGINA 404 PROPIA (Fase 11 · P5b2b, aprobada por Junior el 25 nov).
 *
 * Lo que se fija:
 *  - LA PÁGINA: la marca, una frase humana del diccionario y UNA sola acción, el botón principal, que
 *    vuelve al inicio. Ni una cifra (nada inventado).
 *  - QUE LA USAN LAS DOS PUERTAS: una ruta sin página (`/no-existe-nada`) y lo que el proxy reescribe a
 *    `/_no-existe` (un idioma no publicado como `/en/feed`; eso lo fija `proxy-idioma`). Las dos caen
 *    en `app/not-found.tsx` porque NINGUNA tiene página: si alguien crea `app/_no-existe/page.tsx`, el
 *    proxy deja de dar un 404 y empieza a dar un 200 (rojo aquí).
 *
 * El 404 de verdad (estado y cuerpo) se comprueba contra el build: `curl` a `/no-existe-nada` y a
 * `/en/feed`, en el informe de la P5b2b.
 *
 * Para romperlo: borrar `app/not-found.tsx` (rojo), poner un segundo botón principal (rojo), o crear
 * `app/_no-existe/page.tsx` (rojo).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/no-existe-nada",
  useSearchParams: () => new URLSearchParams(),
}));

import NoEncontrada from "@/app/not-found";
import { MARCA } from "@/config/marca";
import { es } from "@/textos/es";

const APP = path.resolve(__dirname, "..", "..", "src", "app");

describe("la página 404 propia", () => {
  it("la marca, una frase humana y una sola acción: volver al inicio", async () => {
    const c = render(<>{await resolverServidor(await NoEncontrada())}</>).container;
    expect(c.querySelector(`[aria-label="${MARCA}"]`)).not.toBeNull();
    expect(c.querySelector("h1")?.textContent).toBe(es.noEncontrada.titulo);
    expect(c.textContent).toContain(es.noEncontrada.texto.replace("{marca}", MARCA));
    const enlaces = [...c.querySelectorAll("a")];
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]!.getAttribute("href")).toBe("/");
    expect(enlaces[0]!.textContent).toBe(es.noEncontrada.volver);
    expect(c.querySelectorAll("button")).toHaveLength(0);
    // Nada inventado: ni una cifra en la página.
    expect(c.textContent).not.toMatch(/\d/);
  });

  it("está en la raíz de `app`, que es la que recoge toda ruta sin página", () => {
    expect(existsSync(path.join(APP, "not-found.tsx"))).toBe(true);
  });

  it("y lo que el proxy manda a `/_no-existe` no tiene página propia: cae en ella, con su 404", () => {
    const rutas: string[] = [];
    const recorrer = (dir: string, base: string) => {
      for (const n of readdirSync(dir)) {
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) recorrer(p, `${base}/${n}`);
        else if (/^page\.tsx?$/.test(n)) rutas.push(base);
      }
    };
    recorrer(APP, "");
    expect(rutas.length).toBeGreaterThan(30);
    // Ni `_no-existe` ni `no-existe-nada` (los grupos `(…)` no cuentan en la URL).
    const sinGrupos = rutas.map((r) => r.replace(/\/\([^)]+\)/g, ""));
    expect(sinGrupos.filter((r) => /_no-existe|no-existe-nada/.test(r))).toEqual([]);
  });
});
