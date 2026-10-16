/**
 * LA MARCA MYTHIC, PINTADA DE VERDAD — y la propiedad que de verdad importa: SOLO sale si es VIP.
 *
 * El candado estructural (`tests/identidad-vip`) dice que nadie pinta un nombre fuera del
 * componente. Este dice qué pinta el componente, y sobre todo qué NO: un no-VIP tiene que salir
 * exactamente como salía antes de la Fase 8 —el mismo `<span>`, sin sello, sin gema y sin color—,
 * porque cualquier otra cosa mueve maquetas que ya existen para la inmensa mayoría de la gente.
 *
 * Y LA MARCA VIAJA HASTA LA SUPERFICIE. No basta con que la primitiva sepa pintarla: las listas la
 * pasan de la consulta al componente por una cadena de props, y basta que una se quede sin
 * enchufar para que ahí no salga. Por eso abajo se montan las superficies de verdad, no solo la
 * pieza suelta.
 *
 * Para romperlo a propósito: quitar el `esVip ?` que decide el estilo (rojo: el color sale para
 * todos), quitar el `esVip` de la llamada a `Avatar` en cualquier fila (rojo: ahí se pierde el
 * sello), o devolver el envoltorio con gema también para el no-VIP (rojo).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Avatar } from "@/components/ui/avatar";
import { FilaPuesto } from "@/components/ui/fila-puesto";
import { HandleUsuario, NombreUsuario } from "@/components/ui/identidad-usuario";
import { AutorFeed } from "@/components/ui/marca-boost";
import { TarjetaDestacado } from "@/components/ui/tarjeta-destacado";

afterEach(cleanup);

const sello = (): Element | null => document.querySelector("[data-sello-vip]");
const gema = (): Element | null => document.querySelector("[data-gema-vip]");
const nombreVip = (): Element | null => document.querySelector(".df-nombre-vip");

describe("NombreUsuario", () => {
  it("un NO VIP sale como siempre: el mismo span, sin marca y sin color", () => {
    const { container } = render(<NombreUsuario username="ana" prefijo clase="font-medium" />);
    expect(screen.getByText("@ana")).toBeTruthy();
    expect(sello()).toBeNull();
    expect(gema()).toBeNull();
    expect(nombreVip()).toBeNull();
    // Un solo nodo, con las clases que le pasaron y nada más: ni envoltorio, ni estilo.
    const span = container.firstElementChild!;
    expect(span.tagName).toBe("SPAN");
    expect(span.className).toBe("font-medium");
    expect(span.getAttribute("style")).toBeNull();
    expect(span.children).toHaveLength(0);
  });

  it("un VIP lleva gema y el color en una VARIABLE, no en un `color:` suelto", () => {
    render(<NombreUsuario username="ana" prefijo esVip colorNombre="lima" />);
    expect(gema()).not.toBeNull();
    const pintado = nombreVip()!;
    expect(pintado.textContent).toBe("@ana");
    // El valor es una referencia a un token: así cada tema pone el suyo. Un hex aquí solo se vería
    // bien en uno de los dos.
    expect(pintado.getAttribute("style")).toContain("--vip-name: var(--vip-nombre-lima)");
  });

  it("un VIP SIN color elegido: marca sí, color no (se queda con el de respaldo del CSS)", () => {
    render(<NombreUsuario username="ana" prefijo esVip colorNombre={null} />);
    expect(gema()).not.toBeNull();
    // Sin `--vip-name`, `.df-nombre-vip` cae en el acento del sistema. Lo que NO puede es traer una
    // variable vacía o con basura.
    expect(nombreVip()!.getAttribute("style")).toBeNull();
  });

  it("una clave RETIRADA del catálogo: marca sí, color no", () => {
    // "oro" estuvo en el set y salió (chocaba con el oro del podio). Quien lo tuviera guardado
    // sigue siendo VIP y conserva su sello y su gema; lo único que pierde es el color, que vuelve
    // al de respaldo. Ni un `var(--vip-nombre-oro)` apuntando a un token que ya no existe —eso
    // dejaría el nombre en `currentColor`, indistinguible, sin que fallara nada.
    render(<NombreUsuario username="ana" prefijo esVip colorNombre="oro" />);
    expect(gema()).not.toBeNull();
    expect(nombreVip()!.getAttribute("style")).toBeNull();
    expect(document.body.innerHTML).not.toContain("--vip-nombre-oro");
  });

  it("una clave inventada NO pinta nada: ni color, ni variable", () => {
    render(<NombreUsuario username="ana" prefijo esVip colorNombre="#e8f620;}</style>" />);
    expect(nombreVip()!.getAttribute("style")).toBeNull();
    // Y el payload no aparece en el HTML como estilo por ningún otro camino.
    expect(document.body.innerHTML).not.toContain("</style>");
  });

  it("el color NO se filtra a quien no es VIP, aunque traiga una clave guardada", () => {
    // Pasa de verdad: quien se suscribe, elige color y deja de pagar conserva su `colorNombre`.
    // La elección se guarda; lo que caduca es el derecho a verla pintada.
    render(<NombreUsuario username="ana" prefijo esVip={false} colorNombre="lima" />);
    expect(nombreVip()).toBeNull();
    expect(gema()).toBeNull();
    expect(document.body.innerHTML).not.toContain("--vip-name");
  });

  it("con displayName enseña el nombre; con `prefijo`, el handle", () => {
    const { unmount } = render(<NombreUsuario displayName="Ana P" username="ana" esVip />);
    expect(screen.getByText("Ana P")).toBeTruthy();
    unmount();
    render(<NombreUsuario displayName="Ana P" username="ana" prefijo esVip />);
    expect(screen.getByText("@ana")).toBeTruthy();
  });
});

describe("HandleUsuario: el renglón de abajo va SIEMPRE en plano", () => {
  it("ni color ni gema, aunque quien lo lleve sea VIP", () => {
    // El nombre de arriba ya lleva la marca. Repetirla dos renglones seguidos no añade nada y
    // rompe la jerarquía (uno es el nombre, el otro el identificador).
    render(<HandleUsuario username="ana" clase="text-sm" />);
    expect(screen.getByText("@ana").className).toBe("text-sm");
    expect(gema()).toBeNull();
    expect(nombreVip()).toBeNull();
  });
});

describe("el sello en el avatar", () => {
  it("solo con `esVip`", () => {
    const { unmount } = render(<Avatar nombre="ana" />);
    expect(sello()).toBeNull();
    unmount();
    render(<Avatar nombre="ana" esVip />);
    expect(sello()).not.toBeNull();
  });

  it("sin sello NI nivel no envuelve nada: nada se mueve para quien no es VIP", () => {
    const { container } = render(<Avatar nombre="ana" />);
    expect(container.querySelector("span.relative")).toBeNull();
  });

  it("va ARRIBA, donde no se pisa con el emblema de nivel (que va abajo)", () => {
    // Las dos cosas son información distinta —cuánto ha jugado y si paga— y las dos tienen que
    // verse a la vez. En la misma esquina, una tapa a la otra.
    render(<Avatar nombre="ana" puntos={50_000} esVip />);
    // Las clases de posición van en el propio `<svg>`: `Avatar` se las pasa como `clase`.
    const clasesSello = sello()!.getAttribute("class") ?? "";
    expect(clasesSello).toContain("-top-");
    expect(clasesSello).not.toContain("-bottom-");
    // Y el emblema de nivel sigue abajo: si se movieran los dos arriba, volverían a pisarse.
    const emblema = document.querySelector("[data-emblema-nivel], [aria-label*='ivel']");
    expect(emblema?.getAttribute("class") ?? "", "el emblema de nivel subió").toContain("-bottom-");
  });

  it("y el dorado sale del token propio del VIP, no del oro del podio", () => {
    render(<Avatar nombre="ana" esVip />);
    const svg = sello()!.outerHTML;
    expect(svg).toContain("var(--vip-gold)");
    expect(svg, "el sello usa el oro del PODIO").not.toContain("--df-rank");
  });
});

describe("la marca llega hasta las superficies (no se queda en la primitiva)", () => {
  it("la fila del ranking: sello en el avatar y color en el nombre", () => {
    render(
      <FilaPuesto
        puesto={7}
        username="ana"
        imagen={null}
        cifra={3}
        unidad="victorias"
        esVip
        colorNombre="diamante"
      />,
    );
    expect(sello(), "la fila no pasa `esVip` al avatar").not.toBeNull();
    expect(nombreVip()!.getAttribute("style")).toContain("var(--vip-nombre-diamante)");
  });

  it("la fila de un NO VIP se pinta exactamente como antes", () => {
    render(<FilaPuesto puesto={7} username="ana" imagen={null} cifra={3} unidad="victorias" />);
    expect(sello()).toBeNull();
    expect(gema()).toBeNull();
    expect(screen.getByText("@ana").className).toContain("flex-1");
  });

  it("el bloque de autor del feed, en sus dos maquetas", () => {
    render(
      <AutorFeed
        username="ana"
        displayName="Ana"
        destacado={false}
        esVip
        colorNombre="fuego"
        claseNombre="text-white"
        claseHandle="text-white/80"
      />,
    );
    expect(sello()).not.toBeNull();
    expect(nombreVip()!.getAttribute("style")).toContain("var(--vip-nombre-fuego)");
    // El handle secundario sigue en plano: la marca va una vez.
    expect(screen.getByText("@ana").className).toContain("text-white/80");
  });

  it("la tarjeta de la vitrina", () => {
    render(
      <TarjetaDestacado
        username="ana"
        displayName="Ana"
        imagen={null}
        puntos={0}
        esVip
        colorNombre="verde"
      />,
    );
    expect(sello()).not.toBeNull();
    expect(nombreVip()!.getAttribute("style")).toContain("var(--vip-nombre-verde)");
  });
});

describe("la marca no se anima: el feed es lo más caro que hay", () => {
  it("ni el sello, ni la gema, ni el nombre", () => {
    render(<NombreUsuario username="ana" prefijo esVip colorNombre="lima" />);
    render(<Avatar nombre="ana" esVip />);
    for (const el of [sello()!, gema()!, nombreVip()!]) {
      expect(el.className.baseVal ?? el.className).not.toMatch(
        /animate-|df-float|df-sheen|df-respira|pulse/,
      );
      expect(el.getAttribute("style") ?? "").not.toMatch(/animation|transition/);
    }
  });
});
