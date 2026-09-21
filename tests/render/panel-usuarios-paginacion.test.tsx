/**
 * LOS CONTROLES DE PÁGINA DE /panel/usuarios, renderizando la PÁGINA REAL y siguiendo sus enlaces.
 *
 * La pila de cursores tiene sus tests puros y el keyset los suyos contra la BD. Lo que falta —y es lo
 * que se rompía— es el CABLEADO: que la vista construya los dos enlaces con la posición correcta, que
 * no ofrezca uno que no lleva a ninguna parte, y que la paginación no se cuele donde no debe.
 *
 * El servicio se sustituye por un paginador de mentira pero HONESTO (mismo contrato: `limite+1` para
 * saber si hay más, cursor opaco). Así el test navega de verdad: lee el `href` del control, lo vuelve
 * a pintar con esos parámetros, y compara.
 *
 * Para romperlo a propósito: heredar el cursor en el formulario de filtros (rojo), pintar "Anterior"
 * en la primera página (rojo), o volver a la primera al abrir una ficha (rojo).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const TOTAL = 7;
const LIMITE = 2;

const CUENTAS = Array.from({ length: TOTAL }, (_, i) => ({
  id: `id${i}`,
  username: `u${i}`,
  displayName: null,
  image: null,
  rol: "USER",
  suspendida: false,
  alta: new Date(Date.UTC(2026, 0, 9)),
  puntos: 0,
  victorias: 0,
}));

vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () => ({
    userId: "admin-1",
    role: "ADMIN",
    emailVerified: new Date(),
    sessionId: "s1",
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error(`REDIRECT:${u}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});
// Paginador de mentira, mismo contrato que el de verdad: el cursor es opaco y solo hay `proximoCursor`
// cuando de verdad queda algo detrás.
vi.mock("@/server/services/cuentas-panel", () => ({
  listarCuentas: async (_db: unknown, c: { cursor?: string | null; q?: string }) => {
    const desde = c.cursor ? Number(c.cursor.slice(1)) : 0;
    const items = CUENTAS.slice(desde, desde + LIMITE);
    const hayMas = desde + LIMITE < CUENTAS.length;
    return {
      items,
      proximoCursor: hayMas ? `p${desde + LIMITE}` : null,
      modo: c.q ? "busqueda" : "listado",
    };
  },
  fichaCuenta: async () => null,
}));

import Pagina from "@/app/panel/usuarios/page";

type Params = Record<string, string>;

afterEach(cleanup);

/** Pinta la pantalla con esos parámetros de URL y devuelve su raíz. */
async function pintar(params: Params = {}): Promise<HTMLElement> {
  cleanup();
  const { container } = render(await Pagina({ searchParams: Promise.resolve(params) }));
  return container;
}

const navegacion = (c: HTMLElement): HTMLElement | null =>
  c.querySelector('nav[aria-label="Paginación"]');

function paso(c: HTMLElement, nombre: "Anterior" | "Siguiente"): HTMLAnchorElement | null {
  const nav = navegacion(c);
  if (!nav) return null;
  return within(nav).queryByRole("link", { name: nombre }) as HTMLAnchorElement | null;
}

/** Los parámetros a los que lleva un enlace, para volver a pintar con ellos. */
function destino(a: HTMLAnchorElement): Params {
  const url = new URL(a.getAttribute("href")!, "http://panel.local");
  return Object.fromEntries(url.searchParams.entries());
}

/**
 * Los handles que se están viendo, en orden. Se leen del `data-cuenta` de cada fila y no del texto:
 * el `textContent` de la fila trae pegados el rol, el estado y las cifras, y un `@(\w+)` se los come
 * todos («u4UsuarioActiva9»). Lo destapó este mismo test fallando.
 */
const filas = (c: HTMLElement): string[] =>
  [...c.querySelectorAll("li[data-cuenta]")].map(
    (li) => CUENTAS.find((x) => x.id === li.getAttribute("data-cuenta"))?.username ?? "?",
  );

describe("los dos controles", () => {
  it("en la PRIMERA página no hay 'Anterior', y sí 'Siguiente'", async () => {
    const c = await pintar();

    expect(paso(c, "Anterior")).toBeNull();
    expect(paso(c, "Siguiente")).not.toBeNull();
    expect(filas(c)).toEqual(["u0", "u1"]);
  });

  it("en la ÚLTIMA no hay 'Siguiente', y sí 'Anterior'", async () => {
    // Se llega navegando, no inventando un cursor: así el test recorre el mismo camino que una persona.
    let c = await pintar();
    let saltos = 0;
    for (;;) {
      const siguiente = paso(c, "Siguiente");
      if (!siguiente) break;
      c = await pintar(destino(siguiente));
      saltos += 1;
      expect(saltos).toBeLessThan(10); // red de seguridad: si no termina, es que repite
    }

    expect(saltos).toBe(Math.ceil(TOTAL / LIMITE) - 1);
    expect(filas(c)).toEqual(["u6"]);
    expect(paso(c, "Siguiente")).toBeNull();
    expect(paso(c, "Anterior")).not.toBeNull();
  });

  it("'Anterior' devuelve a la página EXACTA de la que se salió", async () => {
    // Las filas se anotan EN EL MOMENTO: `pintar` desmonta lo anterior, así que guardar el contenedor
    // de una página para compararlo luego devuelve una lista vacía (y un verde falso al revés).
    const primera = await pintar();
    const vistoPrimera = filas(primera);

    const segunda = await pintar(destino(paso(primera, "Siguiente")!));
    const vistoSegunda = filas(segunda);

    const tercera = await pintar(destino(paso(segunda, "Siguiente")!));
    expect(filas(tercera)).toEqual(["u4", "u5"]);

    // Y desde la tercera, hacia atrás, paso a paso.
    const vueltaSegunda = await pintar(destino(paso(tercera, "Anterior")!));
    expect(filas(vueltaSegunda)).toEqual(vistoSegunda);
    expect(vistoSegunda).toEqual(["u2", "u3"]);

    const vueltaPrimera = await pintar(destino(paso(vueltaSegunda, "Anterior")!));
    expect(filas(vueltaPrimera)).toEqual(vistoPrimera);
    expect(vistoPrimera).toEqual(["u0", "u1"]);
    // Cerrado el círculo: ya no hay a dónde volver.
    expect(paso(vueltaPrimera, "Anterior")).toBeNull();
  });

  it("no se numeran páginas ni se pagina por OFFSET: los enlaces solo llevan cursor y pila", async () => {
    const c = await pintar();
    const siguiente = destino(paso(c, "Siguiente")!);

    // Lo único que mueve la posición es el cursor (y la pila, en cuanto hay una). `orden` viaja
    // siempre porque la pantalla escribe el suyo aunque sea el de por defecto: eso hace la URL
    // explícita y compartible, y no numera nada.
    expect(siguiente["cursor"]).toBeDefined();
    expect(Object.keys(siguiente).sort()).toEqual(["cursor", "orden"]);
    for (const a of [...c.querySelectorAll("a")]) {
      const href = a.getAttribute("href") ?? "";
      expect(href, href).not.toMatch(/[?&](page|offset|skip|pagina)=/);
    }
  });

  it("la etiqueta dice lo que hace: se pasa de página, no se acumula", async () => {
    const c = await pintar();
    expect(c.textContent).not.toContain("Ver más");
    expect(c.textContent).not.toContain("Cargar más");
    expect(paso(c, "Siguiente")?.textContent).toContain("Siguiente");
  });
});

describe("la paginación no se hereda donde no debe", () => {
  it("el formulario de filtros NO arrastra el cursor: cambiar de orden vuelve a la primera", async () => {
    const enTercera = await pintar({ cursor: "p4", pila: "p2" });
    expect(filas(enTercera)).toEqual(["u4", "u5"]);

    // El formulario es un GET normal: lo que no es un campo suyo, se cae. Que no haya un `hidden` con
    // el cursor es lo que hace que aplicar un filtro empiece por el principio.
    const form = enTercera.querySelector("form")!;
    const campos = [...form.querySelectorAll("input, select")].map((n) => n.getAttribute("name"));
    expect(campos.sort()).toEqual(["estado", "orden", "q", "rol"]);
    expect(form.querySelector('[name="cursor"]')).toBeNull();
    expect(form.querySelector('[name="pila"]')).toBeNull();
  });

  it("abrir una FICHA conserva la página: mirar a alguien no es cambiar de lista", async () => {
    const enTercera = await pintar({ cursor: "p4", pila: "p2" });
    const fila = enTercera.querySelector("li[data-cuenta] a") as HTMLAnchorElement;

    const d = destino(fila);
    expect(d["u"]).toBe("id4");
    expect(d["cursor"]).toBe("p4");
    expect(d["pila"]).toBe("p2");
  });

  it("una pila manipulada no revienta la pantalla: se vuelve a la primera al retroceder", async () => {
    const c = await pintar({ cursor: "p4", pila: "no válido~p2" });

    // La página pedida se sigue sirviendo (el cursor es cosa del servicio); lo que se pierde es el
    // camino de vuelta, que cae a la primera página en vez de a una inventada.
    expect(filas(c)).toEqual(["u4", "u5"]);
    const atras = destino(paso(c, "Anterior")!);
    expect(atras["cursor"]).toBeUndefined();
    expect(atras["pila"]).toBeUndefined();
  });
});

describe("una página posterior que se queda vacía", () => {
  it("no encierra al moderador: sigue ofreciendo 'Anterior'", async () => {
    // Pasa de verdad: alguien deja de encajar en el filtro mientras se hojea y la página se vacía.
    const c = await pintar({ cursor: `p${TOTAL + 10}`, pila: "p2" });

    expect(filas(c)).toEqual([]);
    expect(screen.getByText("No quedan más cuentas por aquí.")).toBeDefined();
    expect(paso(c, "Anterior")).not.toBeNull();
    expect(paso(c, "Siguiente")).toBeNull();
  });
});
