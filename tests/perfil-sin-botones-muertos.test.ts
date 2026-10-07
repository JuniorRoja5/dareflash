/**
 * EN EL PERFIL PROPIO NO HAY BOTONES MUDOS.
 *
 * ┌─ EL TERCERO DE LA MISMA FAMILIA ───────────────────────────────────────────────────────────────┐
 * │ Primero fue el corazón de adorno del feed (un `<Accion>` sin `onClick`, y era el que se        │
 * │ pulsaba). Después "Compartir", declarado muerto en su propio comentario. Y el tercero estaba   │
 * │ aquí: "Destacar mi perfil (Boost)", el botón MAGENTA —el más llamativo de la pantalla— sin     │
 * │ `href` ni `onClick` desde que se maquetó el perfil.                                            │
 * │                                                                                                │
 * │ Los tres se escaparon igual: cada pieza pasaba sus tests y nadie probaba la COMPOSICIÓN —qué   │
 * │ botones hay en esta superficie y si alguno promete un clic que no existe—. Así que el feed ya  │
 * │ tiene el suyo (`feed-rail-sin-botones-muertos`) y esta es la misma red para el perfil.         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `Boton` renderiza un `<button>` cuando no lleva `href`, y un `<Link>` cuando sí. Sin ninguno de
 * los dos es un botón que se pulsa y no hace nada.
 *
 * Para romperlo: quitarle el `href="/boosts"` al CTA de Boost (rojo), o añadir un `<Boton>` nuevo
 * sin cablear (rojo, y con su etiqueta en el mensaje).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const VISTA = join(RAIZ, "src", "app", "(app)", "(shell)", "perfil", "perfil-vista.tsx");

const crudo = readFileSync(VISTA, "utf8");
/** Sin comentarios: el fichero EXPLICA que aquí hubo un botón mudo; explicarlo no es cablearlo. */
const codigo = crudo.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Cada `<Boton …>` del fichero, ENTERO (hasta el `>` de apertura).
 *
 * Se cuenta llaves en vez de usar un regex no codicioso, por la misma razón que en el rail del
 * feed: una prop con JSX dentro (`icono={<X />}`) o un `className` con template lleva caracteres
 * que cortan el elemento por la mitad y dejan fuera el `href` que venía después.
 */
function botones(): string[] {
  const out: string[] = [];
  let i = codigo.indexOf("<Boton");
  while (i !== -1) {
    let llaves = 0;
    for (let j = i; j < codigo.length; j += 1) {
      const c = codigo[j];
      if (c === "{") llaves += 1;
      else if (c === "}") llaves -= 1;
      else if (llaves === 0 && c === ">") {
        out.push(codigo.slice(i, j + 1));
        break;
      }
    }
    i = codigo.indexOf("<Boton", i + 1);
  }
  return out;
}

/** Lo que el botón dice: su texto va DESPUÉS del `>`, así que se busca en el fichero completo. */
function etiquetaDe(apertura: string): string {
  const desde = codigo.indexOf(apertura) + apertura.length;
  return (codigo.slice(desde, desde + 120).split("<")[0] ?? "").trim();
}

describe("todos los botones del perfil llevan a algún sitio", () => {
  it("hay botones que mirar", () => {
    // Sin esto, un extractor roto dejaría la lista vacía y todo lo demás pasaría en vacío.
    expect(botones().length).toBeGreaterThan(3);
  });

  it("ninguno se queda sin `href` ni `onClick`", () => {
    // La lista de excepciones está VACÍA y ese es el estado deseable: un botón mudo nuevo se pone
    // rojo sin discusión, y con su etiqueta delante para saber cuál es.
    const SIN_ACCION_TODAVIA: string[] = [];
    const mudos = botones()
      .filter((b) => !b.includes("href") && !b.includes("onClick"))
      .map((b) => etiquetaDe(b) || b);
    expect(mudos).toEqual(SIN_ACCION_TODAVIA);
  });

  it("y el CTA de Boost lleva a /boosts, que es la pantalla donde se compran", () => {
    const cta = botones().find((b) => etiquetaDe(b).includes("Destacar mi perfil"));
    expect(cta, "ya no existe el CTA de Boost en el perfil").toBeDefined();
    expect(cta).toContain('href="/boosts"');
    // Y sigue siendo el principal: es la acción de pago, el único magenta del perfil propio.
    expect(cta).toContain('variante="principal"');
  });
});

describe("el detector mira el CÓDIGO, no el comentario que lo explica", () => {
  it("quitar comentarios cambia el fichero", () => {
    expect(crudo).toMatch(/mudo|Boost/);
    expect(codigo.length).toBeLessThan(crudo.length);
  });
});
