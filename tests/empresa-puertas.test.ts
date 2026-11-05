/**
 * EL ALTA DE EMPRESA NO PUEDE ESTAR ESCONDIDA (Fase 9 · corrección de P1).
 *
 * Junior lo encontró en producción: a `/empezar` solo se llegaba escribiendo la dirección. Una página
 * a la que no lleva ningún camino es una página que no existe para quien no la conoce — el mismo
 * patrón que dejó `/privacidad` inalcanzable (ver `pie-legal`).
 *
 * Tres puertas, y cada una con su razón:
 *  - `/entrar`, VISIBLE desde la vista inicial (no solo tras pulsar «Crear cuenta», que además es la
 *    cuenta equivocada para un negocio) y a la altura del registro, como botón secundario;
 *  - la portada, para INVITADOS, con el aviso de Socios Fundadores;
 *  - el pie de página, «Para empresas».
 *
 * Y una fuente: el texto y el destino salen de `CTA_NEGOCIO` / `ENLACE_PIE_EMPRESAS`, no se escriben
 * a mano en cada sitio.
 *
 * Para romperlo a propósito: quitar el botón de la vista de login de `/entrar` (rojo el primero);
 * enseñar el bloque de la portada a todo el mundo (rojo el de invitados); quitar el enlace del pie.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CTA_NEGOCIO, ENLACE_PIE_EMPRESAS } from "../src/config/constants";

const leer = (rel: string) => readFileSync(path.resolve(__dirname, "..", rel), "utf8");
/** Sin comentarios: un guard que cuenta la prosa que explica la regla acaba borrado. */
const soloCodigo = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("las puertas van al alta, desde una sola fuente", () => {
  it("el botón y el pie llevan al ALTA, no a la pantalla de elección", () => {
    // Quien pulsa «tengo un negocio» ya ha elegido: mandarle a elegir otra vez es un paso de más.
    expect(CTA_NEGOCIO.href).toBe("/empezar/empresa");
    expect(ENLACE_PIE_EMPRESAS.href).toBe("/empezar/empresa");
    expect(CTA_NEGOCIO.texto).toBe("¿Tienes un negocio? Regístralo aquí");
    expect(ENLACE_PIE_EMPRESAS.texto).toBe("Para empresas");
  });

  it("nadie escribe la ruta a mano en las puertas: sale de la constante", () => {
    for (const rel of [
      "src/app/entrar/tarjeta-acceso.tsx",
      "src/app/entrar/formulario-registro.tsx",
      "src/app/(app)/(shell)/inicio/page.tsx",
      "src/components/ui/pie-legal.tsx",
    ]) {
      expect(soloCodigo(leer(rel)), rel).not.toContain('"/empezar/empresa"');
    }
  });
});

describe("/entrar", () => {
  const tarjeta = soloCodigo(leer("src/app/entrar/tarjeta-acceso.tsx"));

  it("se ve en la vista INICIAL (login), en móvil y en el panel de escritorio", () => {
    // Dos apariciones en la tarjeta: la línea de móvil bajo el login y el panel oscuro de escritorio.
    const usos = tarjeta.match(/href=\{CTA_NEGOCIO\.href\}/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(2);
    // Y es SECUNDARIO: la acción principal de la vista sigue siendo la del formulario.
    expect(tarjeta).toMatch(/variante="secundario" href=\{CTA_NEGOCIO\.href\}/);
  });

  it("y a la altura del registro, como botón y no como letra pequeña", () => {
    const registro = soloCodigo(leer("src/app/entrar/formulario-registro.tsx"));
    expect(registro).toMatch(/<Boton variante="secundario" href=\{CTA_NEGOCIO\.href\}/);
  });
});

describe("la portada", () => {
  const portada = soloCodigo(leer("src/app/(app)/(shell)/inicio/page.tsx"));

  it("tiene un bloque «¿Tienes un negocio?» con el aviso de Socios Fundadores y su botón", () => {
    expect(portada).toContain("¿Tienes un negocio?");
    expect(portada).toContain("msgSocioFundador()");
    expect(portada).toContain("href={CTA_NEGOCIO.href}");
  });

  it("SOLO para invitados: a quien ya tiene cuenta no le sirve", () => {
    // Un participante no puede convertir su cuenta y una empresa aterriza en su portal.
    expect(portada).toMatch(/\{sesion \? null : \(\s*<section\s+aria-labelledby="para-negocios"/);
  });
});

describe("el pie de página", () => {
  it("enlaza «Para empresas»", () => {
    const pie = soloCodigo(leer("src/components/ui/pie-legal.tsx"));
    expect(pie).toContain("href={ENLACE_PIE_EMPRESAS.href}");
    expect(pie).toContain("{ENLACE_PIE_EMPRESAS.texto}");
  });
});
