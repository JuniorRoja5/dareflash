/**
 * SI LA MARCA CAMBIA, TODO LA SIGUE, Y LA VIEJA SIGUE VETADA (Fase 11 · PM1).
 *
 * Se sustituye `config/marca` por una marca de prueba CON ESPACIO («Revol Flash», con «DareFlash» como
 * nombre ANTERIOR), recalculando lo derivado con las funciones REALES del módulo (`marcasVetadas`,
 * `tituloRaiz`), y se mira lo que lee la marca por los tres caminos —un título de página, el asunto de
 * un correo y el logo— y los dos vetos:
 *  - el título, el asunto y el aria-label del logo dicen «Revol Flash», no «DareFlash»;
 *  - una contraseña con «Dareflash» sigue rechazada y `dareflash` sigue siendo un @usuario reservado,
 *    igual que la marca nueva. Es el caso que justifica `MARCAS_ANTERIORES`: sin él, al renombrar,
 *    cualquiera podría registrar `@dareflash` y hacerse pasar por la plataforma;
 *  - y con el ESPACIO de la marca nueva: `revolflash` y `revol_flash` están reservados. Comparando la
 *    marca tal cual («revol flash») no lo estarían, porque ningún @usuario lleva espacios.
 *
 * Para romperlo a propósito: que el veto de contraseñas o los handles reservados usen solo `MARCA`
 * (rojo: la vieja queda libre); que comparen sin normalizar (rojo: `revolflash` libre); escribir
 * «DareFlash» a mano en el asunto o en el logo (rojo).
 */
import { render, screen } from "@testing-library/react";
import { contrasenaFalsa } from "../helpers/valores-falsos";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/marca", async (original) => {
  const real = await original<typeof import("@/config/marca")>();
  const MARCA = "Revol Flash";
  const MARCAS_ANTERIORES = ["DareFlash"];
  return {
    ...real,
    MARCA,
    MARCAS_ANTERIORES,
    MARCAS_VETADAS: real.marcasVetadas(MARCA, MARCAS_ANTERIORES),
    TITULO_RAIZ: real.tituloRaiz(MARCA),
  };
});

import { esHandleReservado } from "@/config/constants";
import { TITULO_RAIZ } from "@/config/marca";
import { Logo } from "@/components/ui/logo";
import { evaluarPassword } from "@/server/auth/password-policy";
import { buildVerificationEmail } from "@/server/services/email-verification";

describe("lo que nombra el producto sigue a la marca", () => {
  it("el título de una página: la plantilla del layout raíz", () => {
    // Next sustituye `%s` por el título de la página; la plantilla sale de `TITULO_RAIZ`, que es lo
    // que el layout raíz usa (lo fija `marca-un-sitio`).
    expect(TITULO_RAIZ.template.replace("%s", "Retos")).toBe("Retos · Revol Flash");
    expect(TITULO_RAIZ.default).toBe("Revol Flash");
  });

  it("el asunto y el cuerpo de un correo, también su logotipo", () => {
    const c = buildVerificationEmail("https://x.test", "a@b.test", "t");
    expect(c.subject).toBe("Verifica tu cuenta de Revol Flash");
    // EL HTML SE LEE SIN ETIQUETAS, como lo lee una persona: el logotipo del correo estuvo escrito a
    // mano partido en dos («DARE» + un `<span>` con «FLASH») y ningún buscador de texto lo veía, ni
    // este mismo caso, que antes miraba el HTML crudo (Fase 11 · PM2).
    expect(c.html, "el correo de verificación salió sin HTML").toBeTypeOf("string");
    const leido = (c.html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    expect(leido).toContain("Revol Flash");
    const sinSeparadores = `${c.subject} ${c.text} ${leido}`.toLowerCase().replace(/[\s._-]+/g, "");
    expect(sinSeparadores, "el correo sigue diciendo la marca vieja").not.toContain("dareflash");
  });

  it("el logo: lo que se anuncia y lo que se lee", () => {
    render(<Logo />);
    const logo = screen.getByRole("img");
    expect(logo.getAttribute("aria-label")).toBe("Revol Flash");
    expect(logo.textContent).toBe("REVOL FLASH");
  });
});

describe("la marca VIEJA sigue vetada, igual que la nueva", () => {
  it("como contraseña", () => {
    // SE COMPONEN, no se escriben (ninguna contraseña literal en el repositorio, ni de prueba): la
    // marca delante de una contraseña falsa que POR SÍ SOLA PASA la política. Así, si se rechaza, es
    // por la marca y no por débil —«Dareflash2026!x» escrita a mano no distinguiría las dos cosas—.
    const fuerte = contrasenaFalsa("marca-cambiada");
    expect(evaluarPassword({ password: fuerte }).ok, "control: sin marca, pasa").toBe(true);
    expect(evaluarPassword({ password: `Dareflash${fuerte}` }).ok, "la marca VIEJA").toBe(false);
    expect(evaluarPassword({ password: `Dare_Flash${fuerte}` }).ok, "la VIEJA con _").toBe(false);
    expect(evaluarPassword({ password: `RevolFlash${fuerte}` }).ok, "la nueva, junta").toBe(false);
    expect(evaluarPassword({ password: `Revol.Flash${fuerte}` }).ok, "la nueva, con .").toBe(false);
  });

  it("como @usuario: la vieja y la nueva, con o sin separadores, y dentro de otra palabra", () => {
    for (const h of ["dareflash", "DareFlash", "dare.flash", "dare_flash", "dareflash_oficial"]) {
      expect(esHandleReservado(h), h).toBe(true);
    }
    for (const h of ["revolflash", "revol_flash", "revol.flash", "el_revolflash"]) {
      expect(esHandleReservado(h), h).toBe(true);
    }
    // Control: ni «revol» ni «flash» sueltos, ni un nombre cualquiera.
    for (const h of ["marta_ruiz", "revolucion", "flashero", "daredevil"]) {
      expect(esHandleReservado(h), h).toBe(false);
    }
  });
});
