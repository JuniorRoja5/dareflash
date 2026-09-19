/**
 * EL CONMUTADOR DE TEMA — render real. Un clic tiene que hacer TRES cosas, y las tres importan:
 * cambiar el atributo de `<html>` (se ve al instante), guardar la cookie (sobrevive a la recarga y el
 * servidor pinta ya con ella) y mover el color de la barra del navegador.
 *
 * Para romperlo: quitar la cookie (el tema vuelve atrás al recargar, sin fallar nada más), o quitar el
 * cambio de atributo (no pasa nada hasta que navegas).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ConmutadorTema } from "@/components/ui/conmutador-tema";
import { TEMA_COLOR_BARRA } from "@/lib/tema";

beforeEach(() => {
  document.documentElement.dataset.theme = "dark";
  document.head.innerHTML = '<meta name="theme-color" content="#07090d" />';
  // Cookies de un test anterior: se vacían poniéndolas caducadas.
  for (const c of document.cookie.split(";")) {
    document.cookie = `${c.split("=")[0]!.trim()}=; max-age=0; path=/`;
  }
});

const barra = () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content");

describe("de oscuro a claro", () => {
  it("el botón dice lo que VA A HACER, no en qué tema estás", () => {
    render(<ConmutadorTema inicial="oscuro" />);
    expect(screen.getByRole("button", { name: "Cambiar a tema claro" })).toBeDefined();
  });

  it("un clic: atributo, cookie y barra del navegador", () => {
    render(<ConmutadorTema inicial="oscuro" />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar a tema claro" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.cookie).toContain("df-tema=claro");
    expect(barra()).toBe(TEMA_COLOR_BARRA.claro);
    // Y ahora ofrece la vuelta.
    expect(screen.getByRole("button", { name: "Cambiar a tema oscuro" })).toBeDefined();
  });

  it("dos clics dejan las cosas como estaban", () => {
    render(<ConmutadorTema inicial="oscuro" />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar a tema claro" }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar a tema oscuro" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("df-tema=oscuro");
    expect(barra()).toBe(TEMA_COLOR_BARRA.oscuro);
  });
});

describe("desde claro (lo que sirvió el servidor)", () => {
  it("nace ofreciendo volver a oscuro: el HTML y el botón no se contradicen", () => {
    document.documentElement.dataset.theme = "light";
    render(<ConmutadorTema inicial="claro" />);

    expect(screen.getByRole("button", { name: "Cambiar a tema oscuro" })).toBeDefined();
    // Sin tocar nada: pintar el botón no cambia el tema.
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("la variante con texto (la vía del móvil, en el perfil)", () => {
  it("lleva la etiqueta escrita, no solo el icono", () => {
    render(<ConmutadorTema inicial="oscuro" conTexto />);
    const boton = screen.getByRole("button", { name: /Cambiar a tema claro/ });
    expect(boton.textContent).toContain("Cambiar a tema claro");
    fireEvent.click(boton);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
