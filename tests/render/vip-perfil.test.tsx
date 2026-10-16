/**
 * EL PERFIL VIP COMPLETO (Fase 8 · P3) — y la propiedad que manda: un perfil NO-VIP sale EXACTO
 * como antes de la fase.
 *
 * ┌─ POR QUÉ "exacto" Y NO "parecido" ──────────────────────────────────────────────────────────┐
 * │ El tratamiento completo es caro de ver: un borde que gira, un bloom, un barrido. La inmensa  │
 * │ mayoría de la gente NO es VIP, así que cualquier resto que se le escape —un envoltorio con   │
 * │ las clases vacías, un `div` de más, un pseudoelemento sin color— es una maqueta que se mueve │
 * │ para todos ellos a cambio de nada. Por eso aquí no se comprueba "no se ve el borde": se      │
 * │ comprueba que el nodo de la tarjeta es EL MISMO, con LAS MISMAS clases.                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo a propósito: quitar el `if (!esVip)` de `TarjetaIdentidad` (rojo: el no-VIP
 * recibiría el marco), montar el emblema sin su gate (rojo), o montar `EmblemaVipGrande` dos veces
 * (rojo: dos veces el mismo id de degradado).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mismo motivo que en `perfil-racha`: el bloque del perfil propio monta un componente de SERVIDOR
// que en jsdom suspende y dejaría el contenedor VACÍO — y un contenedor vacío hace pasar cualquier
// aserción de "esto no está", que es justo la mitad de lo que se comprueba aquí.
vi.mock("@/components/ui/conmutador-tema-servidor", () => ({
  ConmutadorTemaServidor: () => <button type="button">Tema</button>,
}));

import { PerfilVista } from "@/app/(app)/(shell)/perfil/perfil-vista";

afterEach(cleanup);

const base = {
  displayName: "Alex Rios",
  handle: "alexrios",
  imagen: null,
  bio: "Creador de retos.",
  website: null,
  instagram: null,
  youtube: null,
  puntos: 4200,
  retosGanados: 2,
  totalVideos: 3,
  videos: [],
};

/** Tiene que RENDERIZAR de verdad; si no, las aserciones de ausencia mienten. */
function pintar(props: Parameters<typeof PerfilVista>[0]): HTMLElement {
  const c = render(<PerfilVista {...props} />).container;
  expect(c.textContent, "el perfil no renderizó: lo de abajo no mediría nada").toContain(
    props.handle,
  );
  return c;
}

const marco = (c: HTMLElement) => c.querySelector(".df-vip-marco");
const emblemas = (c: HTMLElement) => c.querySelectorAll('[data-marca-vip="grande"]');
const perks = (c: HTMLElement) => c.querySelector("[data-vip-perks]");
const aro = (c: HTMLElement) => c.querySelector(".df-vip-aro");
const palabra = (c: HTMLElement) => c.querySelector("[data-vip-palabra]");

describe("un perfil NO VIP queda como estaba", () => {
  for (const esPropio of [true, false]) {
    it(`${esPropio ? "el propio" : "el de otra persona"}: ni marco, ni emblema, ni chips`, () => {
      const c = pintar({ ...base, esPropio });
      expect(marco(c), "el no-VIP recibe el marco VIP").toBeNull();
      expect(emblemas(c)).toHaveLength(0);
      expect(palabra(c)).toBeNull();
      expect(perks(c)).toBeNull();
      expect(aro(c), "el avatar del no-VIP lleva el aro de luz").toBeNull();
    });
  }

  it("y la tarjeta es EL MISMO nodo de siempre, con las mismas clases", () => {
    // La forma exacta de antes de la Fase 8. Si alguien envuelve esto "sin que se note", cae aquí.
    const c = pintar({ ...base, esPropio: false });
    const tarjeta = c.querySelector("aside > div")!;
    expect(tarjeta.className.split(" ").sort()).toEqual(
      [
        "df-rise",
        "rounded-sm",
        "border",
        "border-line",
        "bg-surface/60",
        "p-6",
        "shadow-[var(--df-shadow-md)]",
        "backdrop-blur-md",
      ].sort(),
    );
    // Y no hay un segundo nivel de envoltorio: el contenido cuelga directo de la tarjeta.
    expect(tarjeta.querySelector(".df-vip-borde")).toBeNull();
    expect(tarjeta.querySelector(".df-vip-tarjeta")).toBeNull();
  });

  it("aunque traiga un color de nombre guardado (lo que caduca es verlo)", () => {
    const c = pintar({ ...base, esPropio: false, esVip: false, colorNombre: "lima" });
    expect(marco(c)).toBeNull();
    expect(c.innerHTML).not.toContain("--vip-name");
  });
});

describe("un perfil VIP monta el tratamiento completo", () => {
  const vip = { ...base, esPropio: false, esVip: true, colorNombre: "diamante" };

  it("marco, borde y tarjeta: las tres capas", () => {
    const c = pintar(vip);
    const m = marco(c)!;
    expect(m, "no hay marco").not.toBeNull();
    // Las tres anidadas y en este orden: el bloom desborda fuera, el borde recorta dentro.
    expect(m.querySelector(".df-vip-borde > .df-vip-tarjeta")).not.toBeNull();
  });

  it("emblema grande, la palabra MYTHIC y el aro del avatar", () => {
    const c = pintar(vip);
    expect(emblemas(c)).toHaveLength(1);
    expect(palabra(c)!.textContent).toBe("Mythic");
    expect(aro(c)).not.toBeNull();
  });

  it("los chips dicen qué trae el plan, y NO son controles", () => {
    const c = pintar(vip);
    const lista = perks(c)!;
    expect(lista.tagName).toBe("UL");
    const textos = [...lista.querySelectorAll("li")].map((li) => li.textContent);
    expect(textos).toEqual(["Boost semanal×1", "Acceso anticipado", "Perfil animado"]);
    // Ni un botón ni un enlace: describen el plan, no hacen nada.
    expect(lista.querySelector("button, a, input")).toBeNull();
  });

  it("y el nombre sigue saliendo del componente compartido, con su color", () => {
    const c = pintar(vip);
    const nombre = c.querySelector(".df-nombre-vip")!;
    expect(nombre.getAttribute("style")).toContain("var(--vip-nombre-diamante)");
    // La marca de junto al nombre es la de P2 y sigue ahí: el hero no la sustituye.
    expect(c.querySelector('[data-marca-vip="compacta"]')).not.toBeNull();
    // Y el avatar ya NO lleva la suya: eran dos "VIP" a dos centímetros.
    expect(c.querySelector('[data-marca-vip="esquina"]')).toBeNull();
  });
});

/**
 * ESTE BLOQUE CAMBIÓ DE FORMA CON EL LETTERMARK.
 *
 * Decía "el `linearGradient` aparece una sola vez": con letras no hay SVG ni `id`, así que ese
 * fallo concreto desapareció en vez de seguir vigilado. Lo que sí sigue siendo cierto —y es lo
 * que importaba debajo— es que **el hero es UNO y es la MISMA pieza que la compacta**: tres
 * dibujos distintos para la misma marca es como el sello y la gema acabaron divergiendo.
 */
describe("el hero: uno, y la misma pieza que la compacta", () => {
  it("hay exactamente UN emblema grande en la página", () => {
    const c = pintar({ ...base, esPropio: true, esVip: true });
    expect(c.querySelectorAll('[data-marca-vip="grande"]')).toHaveLength(1);
  });

  it("y es la misma marca: dice 'VIP' en los dos tamaños", () => {
    const c = pintar({ ...base, esPropio: true, esVip: true });
    const marcas = [...c.querySelectorAll("[data-marca-vip]")];
    expect(marcas.length, "faltan marcas en el perfil VIP").toBe(2);
    for (const m of marcas) expect(m.textContent).toBe("VIP");
    // DOS, no tres: el hero y la de junto al nombre. La del avatar se quitó —en una fila salía
    // "VIP" dos veces en el mismo renglón— y el perfil heredó la misma decisión.
    expect(new Set(marcas.map((m) => m.getAttribute("data-marca-vip")))).toEqual(
      new Set(["grande", "compacta"]),
    );
  });

  it("y NO hay ni un SVG con id en el perfil VIP: el choque de ids ya no existe", () => {
    const c = pintar({ ...base, esPropio: true, esVip: true });
    expect(c.querySelectorAll("linearGradient")).toHaveLength(0);
  });
});

describe("cero UI muerta: el toque es una pieza posterior", () => {
  it("no hay ningún 'Dar un toque' en el perfil, ni VIP ni normal", () => {
    for (const props of [
      { ...base, esPropio: true, esVip: true },
      { ...base, esPropio: false, esVip: true },
      { ...base, esPropio: true },
    ]) {
      const { container, unmount } = render(<PerfilVista {...props} />);
      expect(container.textContent, "un botón que no hace nada").not.toMatch(/toque/i);
      unmount();
    }
  });
});
