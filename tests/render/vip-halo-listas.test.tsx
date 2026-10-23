/**
 * EL HALO DORADO DEL VIP EN LAS LISTAS — render real de las tres superficies.
 *
 * ┌─ LO QUE SE FIJA AQUÍ, Y NO SE PUEDE VER LEYENDO EL FUENTE ─────────────────────────────────┐
 * │ Que un NO-VIP no lo lleva. Es el candado entero: todo lo demás del halo es cosmética, pero   │
 * │ que aparezca en quien no paga lo convierte en una mentira sobre quién es cliente — y esa es  │
 * │ la clase de fallo que no revienta nada y nadie reporta.                                       │
 * │                                                                                               │
 * │ Y que VIP y Boost CONVIVEN: oro en la tarjeta, verde en el avatar. Son dos cosas distintas    │
 * │ (una es suscripción, la otra alcance comprado) y tienen que poder leerse a la vez.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Se mira la CLASE, no "si se ve bonito": lo que el test puede comprobar es que el halo se monta
 * donde debe y solo donde debe. Lo demás son las capturas de la maqueta.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { FilaPuesto } from "@/components/ui/fila-puesto";
import { claseHaloVip } from "@/components/ui/halo-vip";
import { AvatarDestacado } from "@/components/ui/marca-boost";
import { TarjetaDestacado } from "@/components/ui/tarjeta-destacado";

const HALO_TARJETA = ".df-vip-halo";
const HALO_FILA = ".df-vip-halo-fila";

/** La tarjeta de inicio/destacados. */
function tarjeta(esVip: boolean): HTMLElement {
  const { container } = render(
    <TarjetaDestacado
      username="alex"
      displayName="Alex Ríos"
      imagen={null}
      puntos={3980}
      esVip={esVip}
    />,
  );
  return container.querySelector("a")!;
}

/** Una fila de ranking (fuera del podio). */
function fila(esVip: boolean): HTMLElement {
  const { container } = render(
    <FilaPuesto
      puesto={4}
      username="alex"
      imagen={null}
      cifra={3}
      unidad="victorias"
      puntos={3980}
      esVip={esVip}
    />,
  );
  return container.firstElementChild as HTMLElement;
}

describe("un NO-VIP no lleva halo en ninguna superficie", () => {
  it("la tarjeta de destacados", () => {
    expect(tarjeta(false).className).not.toContain("df-vip-halo");
  });

  it("la fila de ranking", () => {
    expect(fila(false).className).not.toContain("df-vip-halo");
  });

  it("y sin pasar `esVip` tampoco (el defecto NO puede ser llevarlo)", () => {
    const { container } = render(
      <FilaPuesto puesto={9} username="nadie" imagen={null} cifra={1} unidad="victorias" />,
    );
    expect((container.firstElementChild as HTMLElement).className).not.toContain("df-vip-halo");
  });
});

describe("un VIP activo sí", () => {
  it("la tarjeta lleva el halo de TARJETA", () => {
    const t = tarjeta(true);
    expect(t.className).toContain("df-vip-halo");
    // Y no el de fila: son dos formas distintas (la fila no tiene marco que teñir).
    expect(t.className).not.toContain("df-vip-halo-fila");
  });

  it("la fila lleva el halo de FILA", () => {
    expect(fila(true).className).toContain("df-vip-halo-fila");
  });

  it("y el halo NO cambia nada que no sea pintura: ni el puesto ni la cifra", () => {
    // Cosmético quiere decir exactamente esto. Si algún día el halo moviera una fila de sitio o
    // tocara su número, dejaría de ser una marca de identidad para ser una ventaja comprada.
    //
    // Se comparan el PUESTO y la CIFRA, no el texto entero: el texto de un VIP lleva además la
    // píldora "VIP", que es la marca de identidad de siempre y no tiene nada que ver con el halo.
    const datos = (el: HTMLElement): string[] => [
      el.firstElementChild!.textContent!,
      el.lastElementChild!.textContent!,
    ];
    expect(datos(fila(true))).toEqual(datos(fila(false)));
    expect(datos(fila(true))).toEqual(["4", "3 victorias"]);
  });
});

describe("VIP y Boost conviven sin pisarse", () => {
  it("oro en la tarjeta, verde en el avatar", () => {
    // La tarjeta de destacados ES de alguien con Boost (solo se llega ahí pagando), así que esta
    // combinación no es rara: es la de cualquier VIP que además compre una aparición.
    const t = tarjeta(true);
    expect(t.className, "falta el oro del VIP").toContain("df-vip-halo");
    // La chapa verde de Boost sigue en su sitio, en la misma tarjeta.
    expect(t.querySelector("[data-marca-boost]"), "se perdió la marca de Boost").toBeTruthy();
  });

  it("el aro verde del avatar sigue siendo del Boost, no del VIP", () => {
    // El avatar NO se toca: el halo va en la tarjeta/fila justamente para no disputarle el sitio
    // a los dos aros que ya lleva (nivel dentro, Boost fuera).
    const { container } = render(
      <AvatarDestacado nombre="sara" imagen={null} puntos={3300} destacado />,
    );
    const aro = container.querySelector("[data-avatar-destacado]")!;
    expect(aro.getAttribute("style")).toContain("--df-action");
    expect(aro.getAttribute("style"), "el aro del avatar se pintó de oro VIP").not.toContain(
      "--vip-gold",
    );
    expect(aro.className, "el halo se coló en el avatar").not.toContain("df-vip-halo");
  });
});

describe("la puerta (`claseHaloVip`)", () => {
  it("devuelve cadena VACÍA para quien no es VIP, nunca `undefined`", () => {
    // Un `undefined` interpolado en un `className` escribe literalmente "undefined" en el atributo.
    expect(claseHaloVip(false)).toBe("");
    expect(claseHaloVip(undefined)).toBe("");
  });

  it("y solo `true` abre: ningún valor parecido cuela", () => {
    for (const valor of [false, undefined, null, 0, "", "no", "false"] as unknown[]) {
      expect(claseHaloVip(valor as boolean | undefined), String(valor)).toBe("");
    }
    // `1` y `"si"` son valores con los que alguien podría llamarla desde JS sin tipos.
    for (const valor of [1, "si", {}] as unknown[]) {
      expect(claseHaloVip(valor as boolean | undefined), String(valor)).toBe("");
    }
  });

  it("las dos variantes son clases distintas", () => {
    expect(claseHaloVip(true, "tarjeta")).toBe("df-vip-halo");
    expect(claseHaloVip(true, "fila")).toBe("df-vip-halo-fila");
  });
});

describe("los selectores que se afirman existen de verdad", () => {
  it("una tarjeta VIP y una fila VIP se encuentran por su selector", () => {
    // Si alguien renombrara la clase, los `not.toContain` de arriba seguirían en verde (la clase
    // vieja no estaría en ningún sitio) y el test entero dejaría de proteger nada.
    const { container } = render(
      <div>
        <TarjetaDestacado username="a" displayName="A" imagen={null} puntos={100} esVip />
        <FilaPuesto puesto={5} username="b" imagen={null} cifra={1} unidad="v" esVip />
      </div>,
    );
    expect(container.querySelector(HALO_TARJETA), "no hay ninguna tarjeta con halo").toBeTruthy();
    expect(container.querySelector(HALO_FILA), "no hay ninguna fila con halo").toBeTruthy();
  });
});
