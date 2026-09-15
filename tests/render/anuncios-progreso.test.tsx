/**
 * EL PROGRESO DE LOS ANUNCIOS SE ACTUALIZA SOLO — con temporizadores falsos y un servidor simulado
 * cuyo COUNT sube entre ciclo y ciclo, como hace el reparto de verdad (el worker va por tramos).
 *
 * El defecto que cierra: el progreso era la foto del servidor al cargar la página, y un anuncio
 * "Repartiendo…" se quedaba congelado hasta recargar aunque el reparto avanzara. Mismo defecto, y
 * mismo arreglo, que el número de avisos (el sondeo es el compartido: `useSondeoVisible`).
 *
 * Para romperlo a propósito: quitar el refresco (la barra se queda congelada, rojo); dejar el sondeo
 * encendido sin nada repartiendo (sigue pidiendo, rojo); sondear con la pestaña oculta (rojo);
 * redondear la barra hacia arriba (12.499 de 12.500 sale llena, rojo).
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ANUNCIOS_SONDEO_MS } from "@/config/constants";

const mocks = vi.hoisted(() => ({ getJson: vi.fn() }));

vi.mock("@/lib/cliente-http", async (orig) => ({
  ...(await orig<typeof import("@/lib/cliente-http")>()),
  getJson: mocks.getJson,
}));

import { ListaAnuncios } from "@/app/panel/notificaciones/lista-anuncios";
import type { AnuncioRevision } from "@/server/services/anuncios";

let visibilidad: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibilidad = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibilidad,
  });
  mocks.getJson.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

const anuncio = (id: string, extra: Partial<AnuncioRevision> = {}): AnuncioRevision => ({
  id,
  texto: `Texto del anuncio ${id}`,
  creadoEnMs: Date.UTC(2026, 8, 12, 10, 30),
  autor: "admin_anuncios",
  targetCount: 12500,
  entregadas: 0,
  estado: "repartiendo",
  ...extra,
});
const respuesta = (items: AnuncioRevision[], status = 200) => ({
  ok: status < 400,
  status,
  code: "",
  data: status < 400 ? { items, nextCursor: null } : {},
});

async function pasan(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function pestana(v: DocumentVisibilityState): Promise<void> {
  visibilidad = v;
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
  });
}

function montar(inicial: AnuncioRevision[]) {
  const { container } = render(<ListaAnuncios inicial={inicial} cursorInicial={null} />);
  const item = (id: string) => container.querySelector<HTMLElement>(`[data-anuncio="${id}"]`)!;
  return {
    texto: (id: string) => item(id).textContent ?? "",
    barra: (id: string) => item(id).querySelector<HTMLElement>("[data-barra]")!.style.width,
  };
}

describe("el progreso de los anuncios se refresca solo", () => {
  it("un anuncio REPARTIENDO avanza sin recargar según sube el COUNT, y al llegar al objetivo para", async () => {
    mocks.getJson
      .mockResolvedValueOnce(respuesta([anuncio("a1", { entregadas: 5000 })]))
      .mockResolvedValueOnce(
        respuesta([anuncio("a1", { entregadas: 12500, estado: "entregado" })]),
      );
    const v = montar([anuncio("a1")]);

    // La primera pintura es la del servidor, sin pedir nada.
    expect(v.barra("a1")).toBe("0%");
    expect(mocks.getJson).not.toHaveBeenCalled();

    await pasan(ANUNCIOS_SONDEO_MS);
    expect(mocks.getJson).toHaveBeenLastCalledWith("/api/panel/anuncios?ids=a1");
    expect(v.barra("a1")).toBe("40%");
    expect(v.texto("a1")).toContain("5000 / 12.500 entregados");
    expect(v.texto("a1")).toContain("Repartiendo…");

    await pasan(ANUNCIOS_SONDEO_MS);
    expect(v.barra("a1")).toBe("100%");
    expect(v.texto("a1")).toContain("12.500 / 12.500 entregados");
    expect(v.texto("a1")).toContain("Entregado");

    // Entregado: ya no queda nada que vigilar, y el sondeo se apaga solo.
    await pasan(ANUNCIOS_SONDEO_MS * 5);
    expect(mocks.getJson).toHaveBeenCalledTimes(2);
  });

  it("pide SOLO los que están repartiendo; si ninguno lo está, no pide nada", async () => {
    mocks.getJson.mockResolvedValue(respuesta([anuncio("a1", { entregadas: 10 })]));
    const { unmount } = render(
      <ListaAnuncios
        cursorInicial={null}
        inicial={[
          anuncio("a1"),
          anuncio("a2", { entregadas: 12500, estado: "entregado" }),
          anuncio("a3", { entregadas: 3, estado: "fallido" }),
        ]}
      />,
    );
    await pasan(ANUNCIOS_SONDEO_MS);
    expect(mocks.getJson).toHaveBeenCalledWith("/api/panel/anuncios?ids=a1");
    unmount();

    mocks.getJson.mockClear();
    montar([
      anuncio("b1", { entregadas: 12500, estado: "entregado" }),
      anuncio("b2", { entregadas: 12490, estado: "terminado" }),
    ]);
    await pasan(ANUNCIOS_SONDEO_MS * 5);
    expect(mocks.getJson).not.toHaveBeenCalled();
  });

  it("con la pestaña OCULTA no pide nada; al VOLVER pide en el acto", async () => {
    mocks.getJson.mockResolvedValue(respuesta([anuncio("a1", { entregadas: 2500 })]));
    const v = montar([anuncio("a1")]);
    await pestana("hidden");
    await pasan(ANUNCIOS_SONDEO_MS * 5);
    expect(mocks.getJson).not.toHaveBeenCalled();

    await pestana("visible");
    expect(mocks.getJson).toHaveBeenCalledTimes(1);
    expect(v.barra("a1")).toBe("20%");
  });

  it("un fallo de red no borra lo pintado; el ciclo siguiente lo reintenta", async () => {
    mocks.getJson
      .mockRejectedValueOnce(new Error("red caída"))
      .mockResolvedValueOnce(respuesta([anuncio("a1", { entregadas: 6250 })]));
    const v = montar([anuncio("a1", { entregadas: 1250 })]);

    await pasan(ANUNCIOS_SONDEO_MS);
    expect(v.barra("a1")).toBe("10%");
    await pasan(ANUNCIOS_SONDEO_MS);
    expect(v.barra("a1")).toBe("50%");
  });

  it("sin permiso (403) o sin sesión (401), el sondeo se apaga", async () => {
    mocks.getJson.mockResolvedValue(respuesta([], 403));
    montar([anuncio("a1")]);
    await pasan(ANUNCIOS_SONDEO_MS);
    expect(mocks.getJson).toHaveBeenCalledTimes(1);
    await pasan(ANUNCIOS_SONDEO_MS * 3);
    await pestana("hidden");
    await pestana("visible");
    expect(mocks.getJson).toHaveBeenCalledTimes(1);
  });

  it("la barra nunca dice más que el COUNT: 12.499 de 12.500 no sale llena", () => {
    const v = montar([anuncio("a1", { entregadas: 12499 })]);
    expect(v.barra("a1")).toBe("99%");
    expect(v.texto("a1")).toContain("Repartiendo…");
  });
});
