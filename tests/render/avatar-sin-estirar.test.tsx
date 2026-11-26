/**
 * EL AVATAR NO SE ESTIRA EN UNA FILA FLEX (PU1).
 *
 * El fallo, visto en un comentario con «Borrar»: la fila es `flex` con el `align-items` por defecto
 * (`stretch`), y la envoltura del emblema (`relative inline-flex`, sin alto propio) se estiraba hasta
 * el alto del texto. El emblema, anclado abajo a la derecha de esa envoltura, acababa en la esquina de
 * la FILA, lejos de la cara. jsdom no maqueta, así que no se puede medir: se fija la CAUSA, que la raíz
 * del avatar lleve SIEMPRE una caja fija (alto y ancho de su tamaño) y `shrink-0`, con emblema y sin él.
 *
 * Altura fija, no `self-start`: `stretch` no toca a un elemento con alto propio, y `self-start` habría
 * subido el avatar en las filas que centran (cabecera, ranking, menú de cuenta).
 *
 * Para romperlo: quitar `shrink-0` o la caja de `RAIZ_CON_EMBLEMA` en `components/ui/avatar.tsx`
 * (rojo), o volver a `relative inline-flex` a secas (rojo).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Avatar, type TamanoAvatar } from "@/components/ui/avatar";

afterEach(cleanup);

const CAJA: Record<TamanoAvatar, readonly [string, string]> = {
  sm: ["h-8", "w-8"],
  md: ["h-12", "w-12"],
  lg: ["h-16", "w-16"],
  xl: ["h-20", "w-20"],
};

/** Clases de la RAÍZ: el nodo que la fila flex coloca (y estiraría). */
function clasesDeLaRaiz(props: { puntos?: number; tamano: TamanoAvatar; imagen?: string }) {
  const { container } = render(
    // La fila del comentario, tal cual: `flex gap-3`, sin `items-*`.
    <div className="flex gap-3">
      <Avatar nombre="Yuyu" {...props} />
      <div className="min-w-0 flex-1">texto largo</div>
    </div>,
  );
  const raiz = container.firstElementChild!.firstElementChild as HTMLElement;
  return raiz.className.split(/\s+/);
}

describe("la raíz del avatar lleva su caja y no encoge", () => {
  for (const tamano of Object.keys(CAJA) as TamanoAvatar[]) {
    for (const [caso, props] of [
      ["con emblema (Pro)", { puntos: 600 }],
      ["con emblema y foto", { puntos: 600, imagen: "/avatars/x.webp" }],
      ["sin emblema (Rookie)", { puntos: 0 }],
      ["sin puntos", {}],
    ] as const) {
      it(`${tamano}, ${caso}`, () => {
        const clases = clasesDeLaRaiz({ tamano, ...props });
        expect(clases, "sin shrink-0, una fila estrecha lo aplasta").toContain("shrink-0");
        for (const c of CAJA[tamano]) {
          expect(clases, `sin ${c}, la fila flex lo estira`).toContain(c);
        }
      });
    }
  }

  it("con emblema, la raíz es la ENVOLTURA (relative) y el emblema va dentro de ella", () => {
    const { container } = render(<Avatar nombre="Yuyu" tamano="sm" puntos={600} />);
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.className).toContain("relative");
    expect(
      raiz.querySelector("svg"),
      "el emblema cuelga de la raíz que tiene la caja",
    ).not.toBeNull();
  });
});
