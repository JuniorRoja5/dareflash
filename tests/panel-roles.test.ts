/**
 * QUIÉN VE QUÉ EN EL PANEL. Desde que entran moderadores, el shell ya no es la barrera: cada sección
 * declara su rol en `secciones.ts` y cada página lo exige con `requireSeccion`.
 *
 * Los dos dientes que sostienen la pieza son ESTRUCTURALES, y por eso están aquí:
 *   (a) una sección sin rol declarado -> rojo;
 *   (b) una página bajo /panel que no pase por `requireSeccion` (o que pida el rol de OTRA sección)
 *       -> rojo. Que nazca imposible una página del panel sin guard.
 *
 * Lo demás es la resolución pura rol-por-ruta, que es lo que comparten la nav y el guard.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  primeraSeccionPara,
  rolDeRuta,
  SECCIONES_PANEL,
  seccionParaRuta,
  seccionesPara,
} from "../src/app/panel/secciones";
import { alcanzaRol } from "../src/lib/permisos";

const ROLES_VALIDOS = ["ADMIN", "MODERATOR"];

describe("cada sección declara su rol", () => {
  it("todas, y solo con un rol válido", () => {
    const sinRol = SECCIONES_PANEL.filter((s) => !ROLES_VALIDOS.includes(s.rol)).map((s) => s.href);
    expect(sinRol).toEqual([]);
  });

  it("el trabajo del moderador es moderación y cuentas; el resto es del administrador", () => {
    const deModerador = SECCIONES_PANEL.filter((s) => s.rol === "MODERATOR").map((s) => s.href);
    expect(deModerador.sort()).toEqual(["/panel/moderacion", "/panel/usuarios"]);
    // Y lo que toca negocio NO se abre de paso: dinero, puntos, retos y anuncios siguen siendo ADMIN.
    for (const href of [
      "/panel",
      "/panel/retos",
      "/panel/ranking",
      "/panel/notificaciones",
      "/panel/monedero",
      "/panel/boost",
    ]) {
      expect(SECCIONES_PANEL.find((s) => s.href === href)?.rol, href).toBe("ADMIN");
    }
  });
});

describe("rol por ruta (puro)", () => {
  it("resuelve la sección de cada ruta, y sus subrutas", () => {
    expect(rolDeRuta("/panel/moderacion")).toBe("MODERATOR");
    expect(rolDeRuta("/panel/usuarios")).toBe("MODERATOR");
    expect(rolDeRuta("/panel/retos")).toBe("ADMIN");
    expect(rolDeRuta("/panel/retos/abc123")).toBe("ADMIN");
    expect(rolDeRuta("/panel")).toBe("ADMIN");
  });

  it("una ruta que no es de ninguna sección REVIENTA (no se resuelve dejando pasar)", () => {
    expect(() => rolDeRuta("/panel/lo-que-sea")).toThrow(/sin sección declarada/i);
    expect(() => rolDeRuta("/otra-cosa")).toThrow(/sin sección declarada/i);
  });

  it("`/panel` es EXACTA: no se come las subrutas de las demás", () => {
    expect(seccionParaRuta("/panel")?.href).toBe("/panel");
    expect(seccionParaRuta("/panel/usuarios")?.href).toBe("/panel/usuarios");
  });
});

describe("lo que ve cada rol", () => {
  it("el moderador ve solo lo suyo; el admin, todo", () => {
    expect(seccionesPara("MODERATOR").map((s) => s.href)).toEqual([
      "/panel/moderacion",
      "/panel/usuarios",
    ]);
    expect(seccionesPara("ADMIN")).toHaveLength(SECCIONES_PANEL.length);
    // Un usuario normal no ve nada (no debería ni entrar).
    expect(seccionesPara("USER")).toEqual([]);
  });

  it("quien entra a /panel aterriza en su primera sección, no en un callejón", () => {
    expect(primeraSeccionPara("ADMIN")).toBe("/panel");
    expect(primeraSeccionPara("MODERATOR")).toBe("/panel/moderacion");
    expect(primeraSeccionPara("USER")).toBeNull();
  });

  it("la jerarquía es una sola (la del RBAC): un rol alto cumple lo que exige uno bajo", () => {
    expect(alcanzaRol("ADMIN", "MODERATOR")).toBe(true);
    expect(alcanzaRol("MODERATOR", "ADMIN")).toBe(false);
    expect(alcanzaRol("MODERATOR", "MODERATOR")).toBe(true);
    expect(alcanzaRol("cualquier-cosa", "MODERATOR")).toBe(false);
  });
});

describe("ninguna página del panel se queda sin guard (estructural)", () => {
  const PANEL = path.resolve(__dirname, "..", "src", "app", "panel");

  /** Todas las `page.tsx` bajo /panel, con la RUTA que les corresponde en la app. */
  function paginas(dir = PANEL): { ruta: string; codigo: string }[] {
    return readdirSync(dir).flatMap((nombre) => {
      const p = path.join(dir, nombre);
      if (statSync(p).isDirectory()) return paginas(p);
      if (nombre !== "page.tsx") return [];
      const rel = path.relative(PANEL, path.dirname(p)).split(path.sep).filter(Boolean);
      return [{ ruta: ["/panel", ...rel].join("/"), codigo: readFileSync(p, "utf8") }];
    });
  }

  const PAGINAS = paginas();

  it("hay páginas que comprobar (si esto falla, el recorrido está roto)", () => {
    expect(PAGINAS.length).toBeGreaterThanOrEqual(8);
  });

  it("todas llaman a `requireSeccion`, y con la ruta de SU sección", () => {
    const culpables: string[] = [];
    for (const p of PAGINAS) {
      const m = /requireSeccion\(\s*"([^"]+)"\s*\)/.exec(p.codigo);
      if (!m) {
        culpables.push(`${p.ruta}: sin requireSeccion`);
        continue;
      }
      // La sección que pide tiene que ser la SUYA: pedir la de otra sería elegirse el guard.
      const pedida = seccionParaRuta(m[1]!)?.href;
      const suya = seccionParaRuta(p.ruta)?.href;
      if (pedida !== suya) culpables.push(`${p.ruta}: pide ${pedida ?? "nada"}, le toca ${suya}`);
    }
    expect(culpables).toEqual([]);
  });

  it("/panel no es un callejón: manda a quien no alcanza el Resumen a su primera sección", () => {
    // El Resumen es del administrador, pero `/panel` es la puerta de todos. Sin este desvío, un
    // moderador que escribe la dirección de su propia herramienta se come un 404.
    const resumen = PAGINAS.find((p) => p.ruta === "/panel")!.codigo;
    expect(resumen).toContain("primeraSeccionPara(");
    expect(resumen).toMatch(/redirect\(destino\)/);
  });

  it("y ninguna escribe su rol a mano: el rol vive en `secciones.ts`", () => {
    const culpables = PAGINAS.filter((p) => /requireRole\(/.test(p.codigo)).map((p) => p.ruta);
    expect(culpables).toEqual([]);
  });
});
