/**
 * EL MARCADO DE /privacidad, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2b): la página entera, con
 * sus huecos `[PENDIENTE — …]`, sus resaltados y sus enlaces. Se confirmó CONTRA EL CÓDIGO DE ANTES: el
 * snapshot de `__snapshots__/` es ese HTML; después de la extracción tiene que dar idéntico, palabra por
 * palabra.
 *
 * Para romperlo: cambiar una letra de la política en `es.ts`, o la etiqueta que envuelve un trozo.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/privacidad",
  useSearchParams: () => new URLSearchParams(),
}));

import PrivacidadPage from "@/app/privacidad/page";

describe("/privacidad", () => {
  it("la política entera", async () => {
    const nodo = await (PrivacidadPage as () => React.ReactNode | Promise<React.ReactNode>)();
    expect(render(<>{await resolverServidor(nodo)}</>).container.innerHTML).toMatchSnapshot();
  });
});
