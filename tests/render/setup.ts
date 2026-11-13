/**
 * Preparación de los tests de RENDER (jsdom). Solo dos cosas, y las dos por el mismo motivo: que un
 * test no se lleve estado del anterior.
 *
 *  - `cleanup()` tras cada test: testing-library monta en un contenedor pegado a `document.body`. Sin
 *    esto, el segundo test encuentra el DOM del primero y `getByText` puede acertar por la razón
 *    equivocada — un verde falso, que es peor que un rojo.
 *  - `matchMedia`: jsdom NO lo implementa, y varios componentes lo leen para decidir si están en
 *    móvil. Sin este doble, montarlos revienta con un TypeError que no dice nada del componente.
 */
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { formatoDePrueba } from "../helpers/formato-prueba";

afterEach(() => {
  cleanup();
  formatoDePrueba.zona = null;
});

// EL LAYOUT, que aquí no se monta (Fase 11 · P1): en la app, el idioma y la zona los baja el
// `FormatoProvider` del layout raíz. Aquí salen de `formatoDePrueba`, que un test puede cambiar.
vi.mock("@/components/formato-provider", async (original) => ({
  ...(await original<typeof import("../../src/components/formato-provider")>()),
  useFormato: () => formatoDePrueba,
}));

if (!window.matchMedia) {
  window.matchMedia = ((consulta: string) => ({
    matches: false, // por defecto ESCRITORIO; un test que quiera móvil lo sobrescribe explícitamente
    media: consulta,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
