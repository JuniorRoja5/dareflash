/**
 * COMPARTIR — el botón que estaba muerto.
 *
 * Era un `<Accion>` sin `onClick`: se pulsaba y no pasaba nada, igual que el corazón de adorno.
 * Se arregla con el mismo par de tests que aquel enseñó a poner — este es el de INTERACCIÓN; el de
 * composición vive en `tests/feed-rail-sin-botones-muertos.test.ts`.
 *
 * Lo que se fija:
 *  - LA HOJA NATIVA PRIMERO donde la hay (móvil), y el portapapeles donde no.
 *  - CANCELAR NO ES UN ERROR: cerrar la hoja lanza `AbortError`, y decir "no se pudo" a quien
 *    cambió de idea es mentirle.
 *  - El enlace es ABSOLUTO y sale de la fuente única del deep-link, no de una URL escrita a mano.
 *  - SIN CONTADOR: antes decía `0` siempre, y nada cuenta las veces que se comparte algo.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BotonCompartir } from "@/components/ui/boton-compartir";
import { enlaceVideo } from "@/lib/enlace-comentario";

const compartirNativo = vi.fn();
const escribir = vi.fn();

beforeEach(() => {
  compartirNativo.mockReset().mockResolvedValue(undefined);
  escribir.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: escribir },
    configurable: true,
  });
  // Por defecto, SIN hoja nativa: es el caso de escritorio, el más común al revisar.
  Reflect.deleteProperty(navigator, "share");
});
afterEach(cleanup);

const conHojaNativa = () => {
  Object.defineProperty(navigator, "share", { value: compartirNativo, configurable: true });
};

const boton = () => screen.getByRole("button");
/** La etiqueta de debajo. Se busca por `data-estado` y NO por `role="status"`: en reposo no es una
 *  region de estado, justamente para no dejar un aviso permanente por cada video del feed. */
const etiqueta = () => boton().querySelector("[data-estado]")!;
const urlEsperada = `http://localhost:3000${enlaceVideo("vid-1")}`;

describe("donde HAY hoja nativa (móvil)", () => {
  it("la abre con el enlace absoluto del vídeo, y no toca el portapapeles", async () => {
    conHojaNativa();
    render(<BotonCompartir videoId="vid-1" titulo="El reto del agua" />);

    fireEvent.click(boton());

    await waitFor(() => expect(compartirNativo).toHaveBeenCalledTimes(1));
    expect(compartirNativo.mock.calls[0]?.[0]).toMatchObject({
      url: urlEsperada,
      title: "El reto del agua",
    });
    expect(escribir).not.toHaveBeenCalled();
  });

  it("sin título, comparte solo el enlace (no inventa uno)", async () => {
    conHojaNativa();
    render(<BotonCompartir videoId="vid-1" titulo={null} />);

    fireEvent.click(boton());

    await waitFor(() => expect(compartirNativo).toHaveBeenCalledTimes(1));
    expect(compartirNativo.mock.calls[0]?.[0]).toEqual({ url: urlEsperada });
  });

  it("CANCELAR la hoja no dice nada: no es un error", async () => {
    conHojaNativa();
    const abort = new Error("cancelado");
    abort.name = "AbortError";
    compartirNativo.mockRejectedValue(abort);
    render(<BotonCompartir videoId="vid-1" />);

    fireEvent.click(boton());

    await waitFor(() => expect(compartirNativo).toHaveBeenCalled());
    // Ni "copiado" ni "no se pudo": se queda como estaba, y NO cae al portapapeles.
    expect(etiqueta().getAttribute("data-estado")).toBe("idle");
    expect(escribir).not.toHaveBeenCalled();
  });

  it("pero si la hoja falla de VERDAD, cae al portapapeles", async () => {
    conHojaNativa();
    compartirNativo.mockRejectedValue(new Error("el sistema dijo que no"));
    render(<BotonCompartir videoId="vid-1" />);

    fireEvent.click(boton());

    await waitFor(() => expect(escribir).toHaveBeenCalledTimes(1));
    expect(escribir.mock.calls[0]?.[0]).toBe(urlEsperada);
    expect(etiqueta().textContent).toBe("Copiado");
  });
});

describe("donde NO hay hoja nativa (escritorio)", () => {
  it("copia el enlace y lo dice", async () => {
    render(<BotonCompartir videoId="vid-1" />);

    fireEvent.click(boton());

    await waitFor(() => expect(escribir).toHaveBeenCalledTimes(1));
    expect(escribir.mock.calls[0]?.[0]).toBe(urlEsperada);
    expect(etiqueta().textContent).toBe("Copiado");
  });

  it("y si el portapapeles no se deja, lo dice también en vez de callarse", async () => {
    escribir.mockRejectedValue(new Error("permiso denegado"));
    render(<BotonCompartir videoId="vid-1" />);

    fireEvent.click(boton());

    await waitFor(() => expect(etiqueta().textContent).toBe("No se pudo"));
  });
});

describe("lo que NO hace", () => {
  it("no pinta un contador: nada cuenta las veces que se comparte", () => {
    // Antes decía `0` siempre. Una cifra que no se mueve nunca es una cifra falsa.
    render(<BotonCompartir videoId="vid-1" />);
    expect(boton().textContent).toBe("Compartir");
    expect(boton().textContent).not.toMatch(/\d/);
  });

  it("y en reposo no promete nada: solo dice qué es", () => {
    render(<BotonCompartir videoId="vid-1" />);
    expect(etiqueta().getAttribute("data-estado")).toBe("idle");
    expect(boton().getAttribute("aria-label")).toBe("Compartir");
  });
});
