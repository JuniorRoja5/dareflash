/**
 * QUE /referidos EXISTA NO BASTA: HAY QUE PODER LLEGAR.
 *
 * El enlace de invitación vivía enterrado en "editar perfil", donde nadie iba a buscarlo. Moverlo a
 * su propia página solo arregla algo si de verdad se llega, así que aquí se afirma lo que ninguna
 * pantalla afirma sola: la entrada está en la navegación de escritorio (como una sección más, no
 * como un caso especial) y en el perfil propio para móvil, donde no hay lateral.
 *
 * Para romperlo: sacar "referidos" de `NAV_ESCRITORIO` (rojo), quitar el botón del perfil (rojo), o
 * devolver el enlace de invitación a /perfil/editar (rojo).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  destinoActivo,
  NAV_DESTINOS,
  NAV_ESCRITORIO,
  destinosDe,
} from "../src/components/ui/logic";

const RAIZ = process.cwd();
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const soloCodigo = (f: string) =>
  f.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

describe("la entrada de escritorio es una sección MÁS, no un caso especial", () => {
  it("`referidos` es un destino del catálogo y está en la barra lateral", () => {
    const destino = NAV_DESTINOS.find((d) => d.clave === "referidos");
    expect(destino, "referidos no está en NAV_DESTINOS").toBeDefined();
    expect(destino?.href).toBe("/referidos");
    expect([...NAV_ESCRITORIO]).toContain("referidos");
    // Y se resuelve por la misma vía que los demás, así que la lateral lo pinta sin saber nada de él.
    expect(destinosDe(NAV_ESCRITORIO).map((d) => d.clave)).toContain("referidos");
  });

  it("el ACTIVO funciona igual que en el resto de secciones", () => {
    expect(destinoActivo("/referidos")).toBe("referidos");
    // Y sus subrutas, como en Retos. Una ruta que solo empieza parecido NO cuenta.
    expect(destinoActivo("/referidos/lo-que-sea")).toBe("referidos");
    expect(destinoActivo("/referidosxyz")).not.toBe("referidos");
  });

  it("la lateral NO trata a referidos aparte: pinta la lista y ya", () => {
    const nav = soloCodigo(leer("src", "components", "ui", "navegacion.tsx"));
    // Si alguien añadiera un <Link href="/referidos"> suelto al lado del bucle, esto lo caza.
    expect(nav).not.toContain('"/referidos"');
    expect(nav).toContain("destinosDe(NAV_ESCRITORIO)");
  });
});

describe("la entrada de móvil es el perfil propio", () => {
  it("el perfil enlaza a /referidos, y solo en el propio", () => {
    const perfil = leer("src", "app", "(app)", "(shell)", "perfil", "perfil-vista.tsx");
    expect(perfil).toContain('href="/referidos"');
    // Va dentro del bloque de `esPropio`, con Editar perfil: no se le ofrece a quien mira a otro.
    const propio = perfil.slice(perfil.indexOf("esPropio ? ("));
    expect(propio).toContain('href="/referidos"');
    expect(propio.indexOf('href="/referidos"')).toBeLessThan(propio.indexOf("</>"));
  });
});

describe("el enlace de invitación se MUDÓ, no se duplicó", () => {
  it("ya no está en /perfil/editar", () => {
    const dir = ["src", "app", "(app)", "(shell)", "perfil", "editar"];
    for (const f of ["page.tsx", "formulario-editar-perfil.tsx"]) {
      const codigo = leer(...dir, f);
      expect(codigo, `${f} sigue montando el enlace`).not.toContain("EnlaceInvitacion");
      expect(codigo, `${f} sigue leyendo el código de referido`).not.toContain("referralCode");
    }
  });

  it("y sí está en /referidos", () => {
    const pagina = leer("src", "app", "(app)", "(shell)", "referidos", "page.tsx");
    expect(pagina).toContain("EnlaceInvitacion");
    expect(pagina).toContain("enlaceReferido");
  });

  it("/referidos exige sesión, y al invitado lo manda a entrar (no lo deja en blanco)", () => {
    const pagina = soloCodigo(leer("src", "app", "(app)", "(shell)", "referidos", "page.tsx"));
    expect(pagina).toContain("getCurrentUser");
    expect(pagina).toMatch(/if \(!sesion\) redirect\("\/entrar\?siguiente=/);
  });

  it("la paginación del historial es por CURSOR, nunca OFFSET ni scroll infinito", () => {
    const pagina = soloCodigo(leer("src", "app", "(app)", "(shell)", "referidos", "page.tsx"));
    expect(pagina).toMatch(/q\.set\("cursor", /);
    expect(pagina).toContain("Anterior");
    expect(pagina).toContain("Siguiente");
    for (const prohibido of [/\boffset\b/i, /\bskip:/, /q\.set\("page"/, /IntersectionObserver/]) {
      expect(pagina, String(prohibido)).not.toMatch(prohibido);
    }
  });
});
