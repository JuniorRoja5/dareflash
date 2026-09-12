/**
 * LA GRÁFICA "Rendimiento en el tiempo" (Fase 4) pinta la serie tal cual llega del servicio: una barra
 * por día y serie, con su valor, y vacíos honestos. Render real (jsdom).
 *
 * Para romperla a propósito: pintar una sola serie (rojo), dibujar ceros cuando no hay actividad
 * (rojo), o colorearla de dinero (rojo).
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RendimientoTiempo } from "@/app/panel/retos/[id]/rendimiento-tiempo";
import type { SerieReto } from "@/server/services/panel-metricas";

const serie = (dias: SerieReto["dias"]): SerieReto => ({
  desde: new Date(`${dias[0]?.dia ?? "2026-03-01"}T00:00:00Z`),
  hasta: new Date(`${dias.at(-1)?.dia ?? "2026-03-01"}T12:00:00Z`),
  dias,
  total: {
    participaciones: dias.reduce((s, d) => s + d.participaciones, 0),
    votos: dias.reduce((s, d) => s + d.votos, 0),
  },
});

const CON_ACTIVIDAD = serie([
  { dia: "2026-03-01", participaciones: 2, votos: 400 },
  { dia: "2026-03-02", participaciones: 0, votos: 0 },
  { dia: "2026-03-03", participaciones: 1, votos: 1 },
]);

const seccion = () => screen.getByRole("region", { name: "Rendimiento en el tiempo" });
const barras = (c: HTMLElement, clave: string) =>
  [...c.querySelectorAll<HTMLElement>(`[data-serie="${clave}"]`)].map((b) => ({
    dia: b.dataset["dia"],
    valor: Number(b.dataset["valor"]),
    alto: b.style.height,
  }));

describe("con actividad", () => {
  it("una barra por día EN CADA serie, con el valor de ese día", () => {
    const { container } = render(<RendimientoTiempo serie={CON_ACTIVIDAD} />);
    expect(barras(container, "participaciones").map((b) => [b.dia, b.valor])).toEqual([
      ["2026-03-01", 2],
      ["2026-03-02", 0],
      ["2026-03-03", 1],
    ]);
    expect(barras(container, "votos").map((b) => [b.dia, b.valor])).toEqual([
      ["2026-03-01", 400],
      ["2026-03-02", 0],
      ["2026-03-03", 1],
    ]);
  });

  it("cada serie con SU escala: el máximo de cada una llena su gráfica", () => {
    const { container } = render(<RendimientoTiempo serie={CON_ACTIVIDAD} />);
    expect(barras(container, "participaciones").map((b) => b.alto)).toEqual(["100%", "0%", "50%"]);
    // 1 voto frente a 400 redondea a 0 % y parecería un día sin nada: se deja una raya visible.
    expect(barras(container, "votos").map((b) => b.alto)).toEqual(["100%", "0%", "3%"]);
  });

  it("los totales y los extremos del eje salen de la serie (días UTC)", () => {
    render(<RendimientoTiempo serie={CON_ACTIVIDAD} />);
    const texto = seccion().textContent ?? "";
    expect(texto).toContain("3 en total");
    expect(texto).toContain("401 en total");
    expect(texto).toMatch(/1 mar/);
    expect(texto).toMatch(/3 mar/);
  });

  it("los mismos números, en tabla, para lectores de pantalla", () => {
    render(<RendimientoTiempo serie={CON_ACTIVIDAD} />);
    const filas = within(seccion()).getAllByRole("row").slice(1); // fuera la cabecera
    expect(filas.map((f) => [...f.children].map((c) => c.textContent))).toEqual([
      ["2026-03-01", "2", "400"],
      ["2026-03-02", "0", "0"],
      ["2026-03-03", "1", "1"],
    ]);
  });

  it("dice que es actividad registrada (puede sumar más votos que la tarjeta de visibles)", () => {
    render(<RendimientoTiempo serie={CON_ACTIVIDAD} />);
    expect(seccion().textContent).toContain("incluye lo que después se retiró");
  });

  it("NEUTRA: recuentos en gris, ni lima ni oro", () => {
    const { container } = render(<RendimientoTiempo serie={CON_ACTIVIDAD} />);
    expect(container.innerHTML).not.toMatch(/money|--df-rank|--color-rank|text-rank/);
  });
});

describe("vacíos honestos", () => {
  it("sin actividad en la ventana: lo dice, sin dibujar una gráfica de ceros", () => {
    const { container } = render(
      <RendimientoTiempo
        serie={serie([
          { dia: "2026-03-01", participaciones: 0, votos: 0 },
          { dia: "2026-03-02", participaciones: 0, votos: 0 },
        ])}
      />,
    );
    expect(seccion().textContent).toContain("Todavía no hay participaciones ni votos");
    expect(container.querySelectorAll("[data-serie]")).toHaveLength(0);
  });

  it("un reto que aún no ha abierto: lo dice, distinto de 'sin actividad'", () => {
    const { container } = render(<RendimientoTiempo serie={serie([])} />);
    expect(seccion().textContent).toContain("aún no ha abierto");
    expect(container.querySelectorAll("[data-serie]")).toHaveLength(0);
  });
});
