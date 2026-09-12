/**
 * PRIMER test de RENDER (jsdom). Monta un componente de verdad y mira el DOM que sale.
 *
 * POR QUÉ HACÍA FALTA ESTA RED. Hasta ahora los tests estructurales leían el FICHERO y comprobaban
 * que un literal estuviera presente. Eso fija decisiones, pero no ve lo que sale por pantalla: varios
 * fallos de maqueta se colaron precisamente por ahí —un color aplicado al elemento equivocado, un
 * texto que existe en el código pero no se llega a pintar— y no había dónde ponerles un test.
 *
 * Se estrena con `FilaPuesto` a propósito: es la primitiva que comparten el rail de la portada y la
 * página de Ranking, y donde vive una regla de MARCA que se puede romper en silencio — el oro solo en
 * el podio, y los puntos NUNCA en lima, porque la lima es dinero y los puntos no lo son.
 *
 * Y el AVATAR: la fila pintaba un círculo gris fijo aunque el usuario tuviera foto. Para romperlo a
 * propósito: volver al `<span className="... bg-raised" />` (rojo), o pasar `imagen={null}` desde un
 * llamante de verdad (rojo el estructural del final).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FilaPuesto } from "@/components/ui/fila-puesto";

/** El número del puesto: primer elemento con `tabular-nums` de la fila. */
function celdaPuesto(contenedor: HTMLElement, puesto: number): HTMLElement {
  const el = [...contenedor.querySelectorAll<HTMLElement>("span")].find(
    (s) => s.textContent === String(puesto),
  );
  if (!el) throw new Error(`no se pintó el puesto ${puesto}`);
  return el;
}

describe("FilaPuesto pinta lo que dice pintar", () => {
  it("muestra el puesto, el handle y la cifra", () => {
    render(
      <FilaPuesto puesto={4} username="lucia" imagen={null} cifra={1234} unidad="victorias" />,
    );
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("@lucia")).toBeDefined();
    // Con separador de millares: 1234 a secas sería otra cifra a ojo.
    expect(screen.getByText(/1,234/)).toBeDefined();
  });

  it("el ORO es solo del podio: 1, 2 y 3 sí; el 4 no", () => {
    // Es una regla de marca, y la clase de cosa que se rompe sin que falle nada más.
    for (const puesto of [1, 2, 3]) {
      const { container, unmount } = render(
        <FilaPuesto puesto={puesto} username="x" imagen={null} cifra={1} unidad="victorias" />,
      );
      expect(celdaPuesto(container, puesto).style.color).toContain("--color-rank");
      unmount();
    }
    const { container } = render(
      <FilaPuesto puesto={4} username="x" imagen={null} cifra={1} unidad="victorias" />,
    );
    expect(celdaPuesto(container, 4).style.color).not.toContain("--color-rank");
  });

  it("los puntos NUNCA van en lima: la lima es dinero y los puntos no lo son", () => {
    const { container } = render(
      <FilaPuesto puesto={1} username="x" imagen={null} cifra={999} unidad="victorias" />,
    );
    const cifra = [...container.querySelectorAll<HTMLElement>("span")].find((s) =>
      s.textContent?.includes("999"),
    );
    expect(cifra).toBeDefined();
    expect(cifra?.className ?? "").not.toMatch(/money/);
    expect(cifra?.style.color ?? "").not.toContain("--color-money");
  });

  it("la insignia es un slot OPCIONAL: sin pasarla, la fila no la inventa", () => {
    const { container: sin } = render(
      <FilaPuesto puesto={1} username="x" imagen={null} cifra={1} unidad="victorias" />,
    );
    const antes = sin.querySelectorAll("span").length;
    const { container: con } = render(
      <FilaPuesto
        puesto={1}
        username="x"
        imagen={null}
        cifra={1}
        unidad="victorias"
        insignia={<b>N</b>}
      />,
    );
    expect(screen.getByText("N")).toBeDefined();
    expect(con.querySelectorAll("span").length).toBeGreaterThan(antes);
  });

  it("la UNIDAD viene de fuera: la fila no clava 'pts'", () => {
    // La cifra tiene que ser el CRITERIO DE ORDEN de quien la usa. Con "pts" clavado, un ranking
    // ordenado por victorias enseñaba puntos: alguien con 1 victoria y 4.000 puntos aparecía debajo
    // de otro con 3 victorias y 90, y el número visible contradecía el orden.
    const { container } = render(
      <FilaPuesto puesto={1} username="x" imagen={null} cifra={3} unidad="victorias" />,
    );
    expect(container.textContent).toContain("3 victorias");
    expect(container.textContent).not.toContain("pts");
  });

  it("un handle larguísimo no desborda: se trunca", () => {
    const { container } = render(
      <FilaPuesto
        puesto={1}
        username="usuario_con_un_handle_absurdamente_largo_2026"
        imagen={null}
        cifra={1}
        unidad="victorias"
      />,
    );
    const nombre = [...container.querySelectorAll<HTMLElement>("span")].find((s) =>
      s.textContent?.startsWith("@usuario_con"),
    );
    // `truncate` + `min-w-0`: sin los dos, un nombre largo empuja la cifra fuera de la fila.
    expect(nombre?.className).toMatch(/truncate/);
    expect(nombre?.className).toMatch(/min-w-0/);
  });
});

describe("el avatar de la fila es el de verdad", () => {
  const FOTO = "/avatars/lucia-1a2b.webp";

  it("con foto: la pinta, y en PEREZOSO (las filas son listas largas)", () => {
    const { container } = render(
      <FilaPuesto puesto={4} username="lucia" imagen={FOTO} cifra={2} unidad="victorias" />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(FOTO);
    expect(img?.getAttribute("loading")).toBe("lazy");
    // Decorativa: el nombre ya se lee al lado, no se anuncia dos veces.
    expect(img?.getAttribute("alt")).toBe("");
  });

  it("sin foto: sale la INICIAL, no un círculo vacío", () => {
    const { container } = render(
      <FilaPuesto puesto={4} username="lucia" imagen={null} cifra={2} unidad="victorias" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("L")).toBeDefined();
  });

  it("si la foto no carga, cae a la inicial en vez de dejar un icono roto", () => {
    const { container } = render(
      <FilaPuesto puesto={4} username="lucia" imagen={FOTO} cifra={2} unidad="victorias" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("L")).toBeDefined();
  });
});

describe("todo llamante de verdad pasa la foto (estructural)", () => {
  /** Todos los `.tsx` bajo src/app, salvo la guía de estilo (no tiene usuarios reales). */
  function ficheros(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) return n === "style-guide" ? [] : ficheros(p);
      return p.endsWith(".tsx") ? [p] : [];
    });
  }

  it("ninguna <FilaPuesto> fuera de la guía pasa `imagen={null}`", () => {
    // El tipo obliga a pasar `imagen`, pero `null` compila: sería volver al círculo vacío con la foto
    // en la mano. Cada fila de verdad la saca de su dato.
    const raiz = path.resolve(__dirname, "..", "..", "src", "app");
    const usos = ficheros(raiz).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/<FilaPuesto\b[\s\S]*?\/>/g)].map((m) => ({
        f: path.relative(raiz, f),
        jsx: m[0],
      })),
    );
    // El rail de la portada, la lista mensual y el top del reto.
    expect(usos.length).toBeGreaterThanOrEqual(3);
    for (const { f, jsx } of usos) {
      expect(jsx, f).toMatch(/imagen=\{\w+\.image\}/);
    }
  });
});
