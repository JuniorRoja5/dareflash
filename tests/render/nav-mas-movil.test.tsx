/**
 * EL MENÚ "MÁS" DE LA BARRA DE MÓVIL — render real.
 *
 * Lo que se fija aquí es el comportamiento que la derivación no cubre:
 *  - ARRANCA CERRADO, y el botón lo dice (`aria-expanded`).
 *  - DESPLIEGA Y REPLIEGA con el mismo botón.
 *  - SE CIERRA al elegir un destino (la nav vive en el armazón y no se desmonta al navegar: si no se
 *    cerrara a mano, el menú taparía la pantalla a la que acabas de llegar), al tocar FUERA y con
 *    Escape.
 *  - LLEVA LOS DESTINOS DERIVADOS, con sus rutas de verdad.
 *  - Y SI LO QUE SE VE ESTÁ DENTRO, el botón se enciende como cualquier otro destino.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { destinosDe, NAV_MOVIL_MAS } from "@/components/ui/logic";
import { MenuMasMovil } from "@/components/ui/menu-mas-movil";

afterEach(cleanup);

/** Iconos de pega: aquí se prueba el menú, no los dibujos (los pone la barra). */
const ICONO = Object.fromEntries(NAV_MOVIL_MAS.map((c) => [c, null]));

const montar = (activo?: string) => render(<MenuMasMovil activo={activo} icono={ICONO} />);
const boton = () => screen.getByRole("button", { name: /Más/ });
const filas = () => screen.queryAllByRole("link");

describe("abrir y cerrar", () => {
  it("arranca CERRADO y lo dice", () => {
    montar();
    expect(boton().getAttribute("aria-expanded")).toBe("false");
    expect(filas()).toHaveLength(0);
  });

  it("el mismo botón despliega y repliega", () => {
    montar();
    fireEvent.click(boton());
    expect(boton().getAttribute("aria-expanded")).toBe("true");
    expect(filas().length).toBeGreaterThan(0);

    fireEvent.click(boton());
    expect(boton().getAttribute("aria-expanded")).toBe("false");
    expect(filas()).toHaveLength(0);
  });

  it("se cierra al ELEGIR un destino", () => {
    // La nav no se desmonta al navegar: sin este cierre, el menú se queda abierto tapando la
    // pantalla a la que acabas de llegar.
    montar();
    fireEvent.click(boton());
    fireEvent.click(filas()[0]!);
    expect(boton().getAttribute("aria-expanded")).toBe("false");
  });

  it("se cierra al tocar FUERA", () => {
    montar();
    fireEvent.click(boton());
    fireEvent.pointerDown(document.body);
    expect(boton().getAttribute("aria-expanded")).toBe("false");
  });

  it("pero NO al tocar dentro del propio menú", () => {
    montar();
    fireEvent.click(boton());
    fireEvent.pointerDown(screen.getByRole("list"));
    expect(boton().getAttribute("aria-expanded")).toBe("true");
  });

  it("y se cierra con Escape", () => {
    montar();
    fireEvent.click(boton());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(boton().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("lo que lleva dentro", () => {
  it("un destino por clave derivada, con su ruta de verdad", () => {
    montar();
    fireEvent.click(boton());

    const esperados = destinosDe(NAV_MOVIL_MAS);
    expect(filas().map((a) => a.getAttribute("href"))).toEqual(esperados.map((d) => d.href));
    expect(filas().map((a) => a.textContent)).toEqual(esperados.map((d) => d.nombre));
  });

  it("y hoy eso es Inicio, Ranking, Boost, Puntos y Referidos", () => {
    montar();
    fireEvent.click(boton());
    expect(filas().map((a) => a.textContent)).toEqual([
      "Inicio",
      "Ranking",
      "Boost",
      "Puntos",
      "Referidos",
    ]);
  });

  it("el menú tiene nombre accesible y el botón manda a él", () => {
    montar();
    fireEvent.click(boton());
    expect(screen.getByRole("list").getAttribute("aria-label")).toBe("Más");
    expect(boton().getAttribute("aria-controls")).toBe(screen.getByRole("list").id);
  });
});

describe("el destino activo", () => {
  it("si está DENTRO, la fila se marca y el botón se enciende", () => {
    montar("puntos");
    // Encendido aunque esté cerrado: lo que se está viendo vive aquí dentro.
    expect(boton().className).toContain("text-text");
    expect(boton().className).not.toContain("text-text-dim");

    fireEvent.click(boton());
    const puntos = filas().find((a) => a.textContent === "Puntos")!;
    expect(puntos.getAttribute("aria-current")).toBe("page");
  });

  it("si está FUERA, el botón va apagado y ninguna fila se marca", () => {
    montar("feed");
    expect(boton().className).toContain("text-text-dim");

    fireEvent.click(boton());
    for (const a of filas()) expect(a.getAttribute("aria-current")).toBeNull();
  });
});
