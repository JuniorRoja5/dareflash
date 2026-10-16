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
 * todos), quitar el `esVip` de la llamada a `NombreUsuario` en cualquier fila (rojo: ahí se pierde
 * la marca), volver a montar una marca en el avatar (rojo: dos por renglón), o devolver el
 * envoltorio con marca también para el no-VIP (rojo).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Avatar } from "@/components/ui/avatar";
import { FilaPuesto } from "@/components/ui/fila-puesto";
import { HandleUsuario, NombreUsuario } from "@/components/ui/identidad-usuario";
import { AutorFeed } from "@/components/ui/marca-boost";
import { TarjetaDestacado } from "@/components/ui/tarjeta-destacado";

afterEach(cleanup);

// La marca ES UNA desde que son letras: el mismo componente, y en una fila sale UNA vez. Hubo un
// tamaño `esquina` superpuesto al avatar, y se quitó justo porque la hacía salir dos veces por
// renglón (ver `MarcaVip`). Por eso aquí se CUENTAN las marcas en vez de preguntar si hay alguna:
// "que haya marca" es lo que dejaba pasar la duplicada.
const marcas = (): Element[] => [...document.querySelectorAll("[data-marca-vip]")];
const gema = (): Element | null => document.querySelector('[data-marca-vip="compacta"]');
const nombreVip = (): Element | null => document.querySelector(".df-nombre-vip");

describe("NombreUsuario", () => {
  it("un NO VIP sale como siempre: el mismo span, sin marca y sin color", () => {
    const { container } = render(<NombreUsuario username="ana" prefijo clase="font-medium" />);
    expect(screen.getByText("@ana")).toBeTruthy();
    expect(marcas()).toEqual([]);
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
    expect(marcas()).toEqual([]);
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

/**
 * EL AVATAR YA NO LLEVA MARCA, y este bloque es el que lo fija.
 *
 * Llevó una en la esquina de arriba (abajo no cabía: ahí va el emblema de NIVEL), y en una fila
 * salía "VIP" dos veces — una en el avatar y otra pegada al nombre, a dos centímetros—. Los casos
 * que medían esa marca (dónde iba, que no la aplastara una caja cuadrada) ya no tienen objeto; lo
 * que se conserva, reescrito, es lo que sigue siendo cierto: que el avatar no puede pintarla.
 */
describe("el avatar: nivel sí, marca VIP no", () => {
  it("ni con un avatar de alguien que es VIP: el avatar no lo sabe", () => {
    // No recibe `esVip` —no es que lo ignore: no existe—, así que no hay forma de que la marca
    // vuelva por aquí sin tocar el componente.
    render(<Avatar nombre="ana" puntos={50_000} />);
    expect(marcas()).toEqual([]);
  });

  it("sin nivel no envuelve nada: nada se mueve para quien no tiene anillo", () => {
    const { container } = render(<Avatar nombre="ana" />);
    expect(container.querySelector("span.relative")).toBeNull();
  });

  it("y el emblema de NIVEL sigue donde estaba: abajo, y sigue saliendo", () => {
    // Lo que de verdad hacía la marca en el avatar era disputarle el sitio a esto, que es lo único
    // del renglón que dice el nivel.
    render(<Avatar nombre="ana" puntos={50_000} />);
    const emblema = document.querySelector("[data-emblema-nivel], [aria-label*='ivel']");
    expect(emblema, "el avatar perdió el emblema de nivel").not.toBeNull();
    expect(emblema!.getAttribute("class") ?? "", "el emblema de nivel subió").toContain("-bottom-");
  });
});

describe("la marca de junto al nombre: dorada, con tinta y hablada", () => {
  it("el dorado sale del token propio del VIP, no del oro del podio", () => {
    render(<NombreUsuario username="ana" prefijo esVip />);
    const marca = gema()!.outerHTML;
    expect(marca).toContain("var(--vip-gold)");
    expect(marca, "la marca usa el oro del PODIO").not.toContain("--df-rank");
    // Y la tinta por token: en claro tiene que ser otra o las letras no se leen.
    expect(marca).toContain("var(--vip-tinta)");
  });

  it("DICE 'VIP', y lo dice también para un lector de pantalla", () => {
    // Una figura decorativa puede ir `aria-hidden`; esto no, porque es el único sitio del renglón
    // donde está dicho que esta persona es VIP. Quien no ve la pantalla se quedaría sin el dato.
    render(<NombreUsuario username="ana" prefijo esVip />);
    expect(gema()!.textContent).toBe("VIP");
    expect(gema()!.getAttribute("aria-label")).toBe("VIP Mythic");
    expect(gema()!.getAttribute("aria-hidden")).toBeNull();
  });
});

/**
 * UNA MARCA POR FILA, Y JUNTO AL NOMBRE — el diente de la duplicada.
 *
 * ┌─ POR QUÉ SE CUENTA Y NO SE PREGUNTA ────────────────────────────────────────────────────────┐
 * │ Este bloque decía "sello en el avatar y color en el nombre" y estaba VERDE mientras la marca │
 * │ salía dos veces por renglón: comprobaba que hubiera marca, que es justo lo que una duplicada │
 * │ cumple mejor que nadie. Contando, la fila con dos cae en rojo — y la fila con cero también,  │
 * │ que es el otro fallo (una cadena de props sin enchufar deja a un VIP sin marca en SU lista). │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Se montan las superficies DE VERDAD, no la pieza suelta: lo que se vigila es la cadena entera.
 */
describe("una sola marca por fila, y es la de junto al nombre", () => {
  const FILAS = [
    {
      que: "la fila del ranking",
      color: "diamante",
      nodo: (
        <FilaPuesto
          puesto={7}
          username="ana"
          imagen={null}
          cifra={3}
          unidad="victorias"
          esVip
          colorNombre="diamante"
        />
      ),
    },
    {
      que: "el bloque de autor del feed (sus dos maquetas salen de aquí)",
      color: "fuego",
      nodo: (
        <AutorFeed
          username="ana"
          displayName="Ana"
          destacado={false}
          esVip
          colorNombre="fuego"
          claseNombre="text-white"
          claseHandle="text-white/80"
        />
      ),
    },
    {
      que: "la tarjeta de la vitrina",
      color: "verde",
      nodo: (
        <TarjetaDestacado
          username="ana"
          displayName="Ana"
          imagen={null}
          puntos={0}
          esVip
          colorNombre="verde"
        />
      ),
    },
  ] as const;

  it.each(FILAS)("$que: EXACTAMENTE una marca, la compacta", ({ nodo }) => {
    render(nodo);
    expect(marcas(), "la marca sale dos veces (o ninguna) en la fila").toHaveLength(1);
    expect(marcas()[0]!.getAttribute("data-marca-vip")).toBe("compacta");
  });

  it.each(FILAS)("$que: y el color del nombre llega hasta ahí", ({ nodo, color }) => {
    render(nodo);
    expect(nombreVip()!.getAttribute("style")).toContain(`var(--vip-nombre-${color})`);
  });

  it("la marca va DENTRO del nombre, no suelta al lado del avatar", () => {
    // Si alguien la vuelve a montar aparte, este caso cae aunque siga habiendo exactamente una.
    render(
      <FilaPuesto puesto={7} username="ana" imagen={null} cifra={3} unidad="victorias" esVip />,
    );
    const nombre = nombreVip()!;
    expect(nombre.parentElement!.contains(marcas()[0]!)).toBe(true);
  });

  it("la fila de un NO VIP se pinta exactamente como antes", () => {
    render(<FilaPuesto puesto={7} username="ana" imagen={null} cifra={3} unidad="victorias" />);
    expect(marcas()).toEqual([]);
    expect(screen.getByText("@ana").className).toContain("flex-1");
  });
});

describe("la marca no se anima: el feed es lo más caro que hay", () => {
  it("ni la marca ni el nombre", () => {
    render(<NombreUsuario username="ana" prefijo esVip colorNombre="lima" />);
    for (const el of [gema()!, nombreVip()!]) {
      expect(el.className.baseVal ?? el.className).not.toMatch(
        /animate-|df-float|df-sheen|df-respira|pulse/,
      );
      expect(el.getAttribute("style") ?? "").not.toMatch(/animation|transition/);
    }
  });
});
