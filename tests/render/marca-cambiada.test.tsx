/**
 * SI LA MARCA CAMBIA, TODO LA SIGUE, Y LA VIEJA SIGUE VETADA (Fase 11 · PM1).
 *
 * Se sustituye `config/marca` por una marca de prueba («Prueba», con «DareFlash» como nombre
 * ANTERIOR), recalculando lo derivado con las funciones REALES del módulo (`marcasVetadas`,
 * `tituloRaiz`), y se mira lo que lee la marca por los tres caminos —un título de página, el asunto de
 * un correo y el logo— y los dos vetos:
 *  - el título, el asunto y el aria-label del logo dicen «Prueba», no «DareFlash»;
 *  - una contraseña con «Dareflash» sigue rechazada y `dareflash` sigue siendo un @usuario reservado,
 *    igual que la marca nueva. Es el caso que justifica `MARCAS_ANTERIORES`: sin él, al renombrar,
 *    cualquiera podría registrar `@dareflash` y hacerse pasar por la plataforma.
 *
 * Para romperlo a propósito: que el veto de contraseñas o los handles reservados usen solo `MARCA`
 * (rojo: la vieja queda libre); escribir «DareFlash» a mano en el asunto o en el logo (rojo).
 */
import { render, screen } from "@testing-library/react";
import { contrasenaFalsa } from "../helpers/valores-falsos";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/marca", async (original) => {
  const real = await original<typeof import("@/config/marca")>();
  const MARCA = "Prueba";
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
    expect(TITULO_RAIZ.template.replace("%s", "Retos")).toBe("Retos · Prueba");
    expect(TITULO_RAIZ.default).toBe("Prueba");
  });

  it("el asunto y el cuerpo de un correo", () => {
    const c = buildVerificationEmail("https://x.test", "a@b.test", "t");
    expect(c.subject).toBe("Verifica tu cuenta de Prueba");
    expect(`${c.subject}${c.text}${c.html}`).not.toMatch(/dareflash/i);
  });

  it("el logo: lo que se anuncia y lo que se lee", () => {
    render(<Logo />);
    const logo = screen.getByRole("img");
    expect(logo.getAttribute("aria-label")).toBe("Prueba");
    expect(logo.textContent).toBe("PRUEBA");
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
    expect(evaluarPassword({ password: `Prueba${fuerte}` }).ok, "la marca nueva").toBe(false);
  });

  it("como @usuario", () => {
    expect(esHandleReservado("dareflash")).toBe(true);
    expect(esHandleReservado("DareFlash")).toBe(true);
    expect(esHandleReservado("prueba")).toBe(true);
    expect(esHandleReservado("marta_ruiz")).toBe(false);
  });
});
