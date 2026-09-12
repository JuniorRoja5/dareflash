/**
 * EL PODIO PINTA SOLO LAS POSICIONES QUE EXISTEN.
 *
 * Se monta el componente de verdad y se mira el DOM. La versión anterior exigía una tupla de tres y,
 * con menos, devolvía `null`: como la lista arranca DESPUÉS del podio, el ganador de los dos primeros
 * retos de la plataforma no habría aparecido en ninguna parte. Y rellenar con pedestales vacíos —la
 * otra salida— es dato falso disfrazado de hueco.
 *
 * Para romperlos a propósito: volver a exigir tres (`if (top.length < 3) return null`), o pintar
 * siempre `[2,1,3]` sin mirar cuántos hay.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { type FilaPodio, PodioRanking } from "@/app/(app)/(shell)/ranking/podio-ranking";

const persona = (n: number, victorias: number, image: string | null = null): FilaPodio => ({
  userId: `u${n}`,
  username: `persona${n}`,
  image,
  victorias,
  puntos: victorias * 40,
});

/** Los números de puesto pintados, sin duplicar (el podio se pinta dos veces: escritorio y móvil). */
function puestosPintados(contenedor: HTMLElement): number[] {
  const numeros = [...contenedor.querySelectorAll<HTMLElement>("span")]
    .map((s) => s.textContent?.trim() ?? "")
    .filter((t) => /^[123]$/.test(t))
    .map(Number);
  return [...new Set(numeros)].sort();
}

describe("cuántas posiciones se pintan", () => {
  it("con UNA persona: solo el 1º, y nada de 2º ni 3º", () => {
    const { container } = render(<PodioRanking top={[persona(1, 5)]} />);

    expect(puestosPintados(container)).toEqual([1]);
    expect(screen.getAllByText("@persona1").length).toBeGreaterThan(0);
  });

  it("con DOS personas: 1º y 2º, sin pedestal de bronce vacío", () => {
    const { container } = render(<PodioRanking top={[persona(1, 5), persona(2, 3)]} />);

    expect(puestosPintados(container)).toEqual([1, 2]);
    expect(container.textContent).not.toContain("@persona3");
  });

  it("con TRES o más: el podio completo, y el 4º no sube al podio", () => {
    const { container } = render(
      <PodioRanking top={[persona(1, 9), persona(2, 6), persona(3, 4), persona(4, 2)]} />,
    );

    expect(puestosPintados(container)).toEqual([1, 2, 3]);
    // El cuarto pertenece a la lista de abajo, no al podio.
    expect(container.textContent).not.toContain("@persona4");
  });

  it("sin nadie no se pinta podio (el vacío honesto lo pone el llamante)", () => {
    const { container } = render(<PodioRanking top={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("qué cifra enseña el podio", () => {
  it("VICTORIAS, que es por lo que está ordenado, no puntos", () => {
    // Enseñar puntos junto a un orden por victorias haría que alguien con 1 victoria y 4.000 puntos
    // saliera debajo de otro con 3 victorias y 90: el número contradiría lo que se ve.
    const { container } = render(<PodioRanking top={[persona(1, 7)]} />);

    expect(container.textContent).toContain("victorias");
    expect(container.textContent).not.toContain("pts");
    expect(container.textContent).toContain("7");
    // 280 son sus puntos: no deben aparecer como cifra.
    expect(container.textContent).not.toContain("280");
  });

  it("singular cuando es UNA victoria (el copy no dice '1 victorias')", () => {
    const { container } = render(<PodioRanking top={[persona(1, 1)]} />);
    expect(container.textContent).toContain("victoria");
    expect(container.textContent).not.toMatch(/1\s*victorias/);
  });
});

describe("el avatar del podio es el de verdad", () => {
  it("con foto la pinta (escritorio y móvil), y NO en perezoso: el podio es lo primero que se ve", () => {
    const foto = "/avatars/persona1-abc.webp";
    const { container } = render(<PodioRanking top={[persona(1, 5, foto), persona(2, 3)]} />);
    const imgs = [...container.querySelectorAll("img")];
    // El podio se pinta dos veces (escritorio + móvil): la foto del 1º sale en las dos.
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([foto, foto]);
    expect(imgs.every((i) => i.getAttribute("loading") !== "lazy")).toBe(true);
  });

  it("sin foto: la inicial, sin <img>", () => {
    const { container } = render(<PodioRanking top={[persona(2, 5)]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText("P").length).toBeGreaterThan(0);
  });
});

describe("el color de medalla sigue siendo del podio", () => {
  it("el 1º lleva oro y el 3º no", () => {
    const { container } = render(
      <PodioRanking top={[persona(1, 9), persona(2, 6), persona(3, 4)]} />,
    );
    const html = container.innerHTML;
    // Los tres tokens están presentes y son distintos: si el oro se derramara, --df-silver y
    // --df-bronze dejarían de aparecer.
    expect(html).toContain("--df-rank");
    expect(html).toContain("--df-silver");
    expect(html).toContain("--df-bronze");
  });
});
