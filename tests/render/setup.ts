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

// LOS TEXTOS, por el mismo motivo (Fase 11 · P5b1): en la app los espacios de cliente los baja un
// `TextosProvider` del layout o de la página, y los de servidor salen de `textos()` con el idioma de la
// petición. Aquí no hay ni layout ni petición: los dos sirven el castellano, que es la fuente.
vi.mock("@/components/textos-provider", async (original) => {
  const real = await original<typeof import("../../src/components/textos-provider")>();
  const { es } = await import("../../src/textos/es");
  const { crearT } = await import("../../src/textos/plantilla");
  return {
    ...real,
    useTextos: (n: keyof typeof es) => crearT(es[n] as never, "es"),
    useEspacios: (ns: readonly (keyof typeof es)[]) =>
      Object.fromEntries(ns.map((n) => [n, es[n]])),
  };
});
vi.mock("@/textos/servidor", async () => {
  const { es } = await import("../../src/textos/es");
  const { crearT } = await import("../../src/textos/plantilla");
  const corte = (ns: readonly (keyof typeof es)[]) => Object.fromEntries(ns.map((n) => [n, es[n]]));
  return {
    textos: async (n: keyof typeof es) => crearT(es[n] as never, "es"),
    textosParaCliente: (_idioma: string, ns: readonly (keyof typeof es)[]) => corte(ns),
    textosClienteDeLaPeticion: async (ns: readonly (keyof typeof es)[]) => corte(ns),
  };
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
