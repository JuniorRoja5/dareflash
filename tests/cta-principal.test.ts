/**
 * CTA PRINCIPAL por rol. Dos mitades, y las dos con dientes:
 *
 *  - la FUNCIÓN: ADMIN -> "Crear reto" al panel; cualquier otro (y el invitado) -> su acción real,
 *    "Subir vídeo" a /crear;
 *  - ESTRUCTURAL, como la guarda del panel: ningún componente de la app pinta "Crear reto" ni escribe
 *    la ruta de /crear por su cuenta; los TRES sitios del CTA (barra de escritorio, hero y [+] de la nav
 *    móvil) salen de `ctaPrincipal`. Así estaba antes, con el texto escrito en cada sitio, y el no-admin
 *    veía una acción de admin que además mentía sobre su destino. Si alguien vuelve a escribirlo, no
 *    fallaría nada más.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NAV_DESTINOS } from "../src/components/ui/logic";
import { CTA_ADMIN, CTA_USUARIO, ctaPrincipal } from "../src/lib/cta-principal";

describe("ctaPrincipal", () => {
  it("ADMIN -> crear un reto de verdad, en el panel", () => {
    expect(ctaPrincipal("ADMIN")).toEqual({ texto: "Crear reto", href: "/panel/retos" });
  });

  it("usuario, moderador e invitado -> su acción real: subir un vídeo", () => {
    for (const rol of ["USER", "MODERATOR", null]) {
      expect(ctaPrincipal(rol)).toEqual({ texto: "Subir vídeo", href: "/crear" });
    }
  });

  it("el CTA del no-admin no lleva al panel ni se llama como el del admin", () => {
    // El copy final lo decide Junior; lo que no puede pasar es que el no-admin vea la acción del admin.
    expect(CTA_USUARIO.href.startsWith("/panel")).toBe(false);
    expect(CTA_USUARIO.texto).not.toBe(CTA_ADMIN.texto);
  });
});

describe("nadie pinta el CTA por su cuenta (estructural)", () => {
  const src = path.resolve(__dirname, "..", "src");
  const leer = (rel: string): string => readFileSync(path.join(src, rel), "utf8");

  function ficheros(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) return ficheros(p);
      return /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }
  /** Sin comentarios (de bloque, JSX incluidos, y de línea entera): un comentario no pinta nada. */
  const sinComentarios = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // El panel es del admin: ahí SÍ se crea un reto (y su botón lo dice). Todo lo demás, fuera.
  const fueraDelPanel = [
    ...ficheros(path.join(src, "app")),
    ...ficheros(path.join(src, "components")),
  ]
    .filter((f) => !f.includes(`${path.sep}app${path.sep}panel${path.sep}`))
    .map((f) => ({ f: path.relative(src, f), codigo: sinComentarios(readFileSync(f, "utf8")) }));

  it('fuera del panel ningún componente escribe "Crear reto"', () => {
    const culpables = fueraDelPanel.filter((x) => x.codigo.includes("Crear reto")).map((x) => x.f);
    expect(culpables).toEqual([]);
  });

  it('ningún componente escribe la ruta "/crear" a mano: sale de `ctaPrincipal`', () => {
    // Ni en un `href` ni en un catálogo: la nav móvil la tenía escrita en su lista de destinos.
    const culpables = fueraDelPanel
      .filter((x) => /["'`]\/crear["'`]/.test(x.codigo))
      .map((x) => x.f);
    expect(culpables).toEqual([]);
  });

  it("la barra, el hero y el [+] de la nav móvil sacan el CTA de `ctaPrincipal`", () => {
    expect(sinComentarios(leer("app/(app)/(shell)/cta-crear.tsx"))).toMatch(/ctaPrincipal\(/);
    expect(sinComentarios(leer("app/(app)/(shell)/inicio/page.tsx"))).toMatch(/ctaPrincipal\(/);
    expect(sinComentarios(leer("components/ui/navegacion.tsx"))).toMatch(/ctaPrincipal\(/);
  });

  it("el rol que llega a los CTA es el de la SESIÓN, nunca uno fijo", () => {
    // Los componentes deciden bien por rol, pero solo si les llega el de verdad: un `rol="ADMIN"`
    // escrito en un layout enseñaría la acción de admin a todo el mundo sin que fallara nada más.
    expect(sinComentarios(leer("app/(app)/(shell)/layout.tsx"))).toMatch(
      /rol=\{user\?\.role \?\? null\}/,
    );
    const armazon = sinComentarios(leer("app/(app)/layout.tsx"));
    expect(armazon).toMatch(/\(await getCurrentUser\(\)\)\?\.role \?\? null/);
    expect(armazon).toMatch(/<NavInferiorActiva rol=\{rol\}[\s/]/);
    const fijos = fueraDelPanel.filter((x) => /rol=\{?["'`]ADMIN/.test(x.codigo)).map((x) => x.f);
    expect(fijos).toEqual([]);
  });

  it("el destino `crear` del catálogo de la nav es el del CTA del no-admin", () => {
    // `destinoActivo` marca /crear con él: si divergiera, la nav y el CTA hablarían de sitios distintos.
    const crear = NAV_DESTINOS.find((d) => d.clave === "crear");
    expect(crear?.href).toBe(CTA_USUARIO.href);
    expect(crear?.nombre).toBe(CTA_USUARIO.texto);
  });
});
