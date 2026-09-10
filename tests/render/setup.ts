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

afterEach(() => {
  cleanup();
});

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
