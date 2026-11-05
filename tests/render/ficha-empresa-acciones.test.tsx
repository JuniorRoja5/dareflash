/**
 * LA FICHA DE UNA EMPRESA NO OFRECE ACCIONES QUE NO CAMBIAN NADA (Fase 9 · P4).
 *
 * Ya verificada → sin «Verificar»; ya rechazada → sin «Rechazar». Lo decide UNA regla,
 * `puedeDecidirEmpresa`, que es la MISMA que aplican `verificarEmpresa` y `rechazarEmpresa` en el
 * servidor: un botón nunca promete un cambio que el servidor no va a hacer.
 *
 * Se pinta la FICHA de verdad (no el componente de botones suelto): lo que se fija es lo que ve el
 * admin. Y se comprueba que el servidor lee la misma regla, para que no puedan separarse.
 *
 * Para romperlo a propósito: pintar los dos botones siempre (rojo el de la verificada y el de la
 * rechazada); volver a comparar el estado a mano en `verificarEmpresa` (rojo el estructural).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

import { FichaEmpresa } from "@/app/panel/empresas/ficha";
import type { EstadoEmpresa } from "@/config/constants";
import { puedeDecidirEmpresa } from "@/lib/empresa";
import type { FichaEmpresa as DatosFicha } from "@/server/services/empresas";

afterEach(cleanup);

const ficha = (estado: EstadoEmpresa): DatosFicha => ({
  id: "e1",
  nombre: "Panadería La Espiga",
  tipoCuenta: "EMPRESA",
  tipoNegocio: "FISICO",
  estado,
  paisIso: "ES",
  ciudadTexto: null,
  personaContacto: "Lucía",
  webUrl: "https://laespiga.test",
  redes: null,
  direccion: null,
  motivoRechazo: estado === "RECHAZADA" ? "DUPLICADA" : null,
  notaInterna: null,
  dueno: "lucia",
  creadaMs: Date.UTC(2026, 10, 5),
  verificadaMs: estado === "VERIFICADA" ? Date.UTC(2026, 10, 5) : null,
  verificadaPor: null,
  tieneFiscal: false,
});

const botones = () => screen.queryAllByRole("button").map((b) => b.textContent?.trim() ?? "");

describe("la ficha solo ofrece lo que haría algo", () => {
  it("una VERIFICADA no lleva «Verificar» (sí «Rechazar»)", () => {
    render(<FichaEmpresa ficha={ficha("VERIFICADA")} />);
    expect(botones()).not.toContain("Verificar");
    expect(botones()).toContain("Rechazar…");
  });

  it("una RECHAZADA no lleva «Rechazar» (sí «Verificar»)", () => {
    render(<FichaEmpresa ficha={ficha("RECHAZADA")} />);
    expect(botones()).not.toContain("Rechazar…");
    expect(botones()).toContain("Verificar");
  });

  it("una PENDIENTE lleva las dos", () => {
    render(<FichaEmpresa ficha={ficha("PENDIENTE")} />);
    expect(botones()).toEqual(expect.arrayContaining(["Verificar", "Rechazar…"]));
  });

  it("la regla, entera: cada decisión desde los estados en los que cambia algo", () => {
    const matriz = (["PENDIENTE", "VERIFICADA", "RECHAZADA", "SUSPENDIDA"] as const).map((e) => [
      e,
      puedeDecidirEmpresa(e, "VERIFICAR"),
      puedeDecidirEmpresa(e, "RECHAZAR"),
    ]);
    expect(matriz).toEqual([
      ["PENDIENTE", true, true],
      ["VERIFICADA", false, true],
      ["RECHAZADA", true, false],
      ["SUSPENDIDA", true, true],
    ]);
  });
});

describe("el servidor y la ficha leen la MISMA regla", () => {
  const leer = (...p: string[]) =>
    readFileSync(path.resolve(__dirname, "..", "..", ...p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("verificar y rechazar se niegan con `puedeDecidirEmpresa`, no con un if propio", () => {
    const svc = leer("src", "server", "services", "empresas.ts");
    expect(svc).toMatch(/if \(!puedeDecidirEmpresa\(actual\.estado, "VERIFICAR"\)\)/);
    expect(svc).toMatch(/if \(!puedeDecidirEmpresa\(actual\.estado, "RECHAZAR"\)\)/);
    expect(svc).not.toMatch(/actual\.estado === "VERIFICADA"/);
  });

  it("y los botones de la ficha, también", () => {
    const ui = leer("src", "app", "panel", "empresas", "acciones-empresa.tsx");
    expect(ui).toMatch(/puedeDecidirEmpresa\(estado, "VERIFICAR"\)/);
    expect(ui).toMatch(/puedeDecidirEmpresa\(estado, "RECHAZAR"\)/);
    expect(leer("src", "app", "panel", "empresas", "ficha.tsx")).toMatch(
      /<AccionesEmpresa id=\{ficha\.id\} nombre=\{ficha\.nombre\} estado=\{ficha\.estado\} \/>/,
    );
  });
});
