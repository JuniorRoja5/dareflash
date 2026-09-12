/**
 * LA TARJETA "Interacción por participación" (Fase 3) pinta los votos de cada participación, tal cual
 * llegan del servicio. Render real (jsdom).
 *
 * Para romperla a propósito: pintar otra cifra en lugar de `votos` (rojo), pintar un 0 o una raya
 * cuando no hay participaciones (rojo), o colorearla de dinero (rojo).
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TarjetaInteraccion } from "@/app/panel/retos/[id]/interaccion-participacion";

const fila = (n: number, votos: number, titulo: string | null = `Vídeo ${n}`) => ({
  submissionId: `s${n}`,
  titulo,
  username: `autor${n}`,
  displayName: null,
  votos,
});

const tarjeta = () => screen.getByRole("region", { name: "Interacción por participación" });
const filasPintadas = () => within(tarjeta()).queryAllByRole("listitem");

describe("con participaciones visibles", () => {
  it("cada fila dice de qué participación es y cuántos votos tiene, en el orden recibido", () => {
    render(
      <TarjetaInteraccion filas={[fila(1, 12345), fila(2, 1), fila(3, 0, null)]} visibles={3} />,
    );
    const filas = filasPintadas();
    expect(filas).toHaveLength(3);
    expect(filas[0]!.textContent).toContain("Vídeo 1");
    // El autor con el mismo nombre que la tabla de participaciones (`nombreMostrado`).
    expect(filas[0]!.textContent).toContain("Vídeo 1 · autor1");
    // Con separador de millares (es-ES): 12345 a secas sería otra cifra a ojo.
    expect(filas[0]!.textContent).toContain("12.345 votos");
    expect(filas[1]!.textContent).toContain("1 voto");
    expect(filas[1]!.textContent).not.toContain("1 votos");
    // Sin título: se dice, en vez de dejar el hueco vacío.
    expect(filas[2]!.textContent).toContain("Sin título");
    expect(filas[2]!.textContent).toContain("0 votos");
  });

  it("la barra es la proporción frente a la más votada", () => {
    const { container } = render(
      <TarjetaInteraccion filas={[fila(1, 8), fila(2, 4), fila(3, 0)]} visibles={3} />,
    );
    const anchos = [...container.querySelectorAll<HTMLElement>("[data-barra]")].map(
      (b) => b.style.width,
    );
    expect(anchos).toEqual(["100%", "50%", "0%"]);
  });

  it("si hay más visibles que filas, lo dice (y si no, no)", () => {
    const { unmount } = render(
      <TarjetaInteraccion filas={[fila(1, 5), fila(2, 3)]} visibles={14} />,
    );
    expect(tarjeta().textContent).toContain("Las 2 más votadas de 14 visibles");
    unmount();
    render(<TarjetaInteraccion filas={[fila(1, 5), fila(2, 3)]} visibles={2} />);
    expect(tarjeta().textContent).not.toContain("más votadas");
  });

  it("NEUTRA: son recuentos, ni lima (dinero) ni oro (podio)", () => {
    const { container } = render(<TarjetaInteraccion filas={[fila(1, 9)]} visibles={1} />);
    expect(container.innerHTML).not.toMatch(/money|--df-rank|--color-rank|text-rank/);
  });
});

describe("sin participaciones visibles", () => {
  it("vacío HONESTO: lo dice con palabras, sin un 0 ni una raya que parezcan una medida", () => {
    render(<TarjetaInteraccion filas={[]} visibles={0} />);
    expect(tarjeta().textContent).toContain("Aún no hay participaciones visibles");
    expect(filasPintadas()).toHaveLength(0);
    expect(tarjeta().textContent).not.toMatch(/\d/);
    expect(tarjeta().textContent).not.toContain("—");
  });
});
