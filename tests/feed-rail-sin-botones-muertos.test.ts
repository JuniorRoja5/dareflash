/**
 * EN EL RAIL DEL FEED NO HAY BOTONES MUERTOS NI DUPLICADOS.
 *
 * ┌─ EL FALLO QUE LLEGÓ A PRODUCCIÓN ──────────────────────────────────────────────────────────────┐
 * │ El rail tenía un corazón DE ADORNO desde antes de que los likes existieran: un `<Accion        │
 * │ label="Me gusta" valor={0} />` sin `onClick`. Al construir los likes se añadió el botón de     │
 * │ verdad MÁS ABAJO y el adorno se quedó. Había DOS corazones; el que se pulsaba era el muerto.   │
 * │                                                                                                │
 * │ Ningún test lo vio porque todos miraban una pieza: el servicio, la ruta, el botón. El fallo    │
 * │ estaba en la COMPOSICIÓN — qué hay en el rail y en qué orden—, que no lo probaba nadie.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo: volver a poner un `<Accion label="Me gusta" …>` (rojo), montar dos `<BotonLike`
 * (rojo), o dejar el icono del corazón suelto en el feed (rojo: si vuelve, es que vuelve el adorno).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const FEED = join(RAIZ, "src", "components", "feed", "feed-vertical.tsx");
/** Sin comentarios: el docblock EXPLICA que había un adorno; explicarlo no es tenerlo. */
const codigo = readFileSync(FEED, "utf8")
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("el me gusta del rail", () => {
  it("se monta UNA sola vez", () => {
    expect(codigo.match(/<BotonLike\b/g) ?? []).toHaveLength(1);
  });

  it("y no queda ningún corazón de adorno al lado", () => {
    expect(codigo, "vuelve el `Accion` de me gusta").not.toMatch(/label="Me gusta"/);
    expect(codigo, "vuelve el icono suelto del corazón").not.toMatch(/IconoCorazon/);
  });

  it("el detector mira el CÓDIGO, no el comentario que lo explica", () => {
    // Control: el fichero SIGUE explicando en un comentario que aquí hubo un adorno. Si `codigo`
    // dejara de quitar comentarios, los dos casos de arriba se pondrían rojos por la explicación.
    const crudo = readFileSync(FEED, "utf8");
    expect(crudo).toMatch(/Me gusta/);
    expect(codigo.length).toBeLessThan(crudo.length);
  });
});

describe("ninguna acción del rail promete un clic que no existe", () => {
  /**
   * Cada `<Accion …/>` del fichero, ENTERA.
   *
   * Se escanea contando llaves en vez de usar un regex no codicioso: `icono={<IconoComentario />}`
   * lleva un `/>` DENTRO, así que `[\s\S]*?\/>` cortaba el elemento por la mitad y dejaba fuera el
   * `onClick` que venía después — y "Comentar", que sí lo tiene, salía como muda.
   */
  function acciones(): string[] {
    const out: string[] = [];
    let i = codigo.indexOf("<Accion");
    while (i !== -1) {
      let llaves = 0;
      for (let j = i; j < codigo.length; j += 1) {
        const c = codigo[j];
        if (c === "{") llaves += 1;
        else if (c === "}") llaves -= 1;
        else if (llaves === 0 && c === "/" && codigo[j + 1] === ">") {
          out.push(codigo.slice(i, j + 2));
          break;
        }
      }
      i = codigo.indexOf("<Accion", i + 1);
    }
    return out;
  }

  it("hay acciones que mirar", () => {
    expect(acciones().length).toBeGreaterThan(0);
  });

  it("toda `Accion` interactiva lleva su `onClick`", () => {
    // `Accion` renderiza un `<button>` SIEMPRE. Sin `onClick` es un botón que se puede pulsar y no
    // hace nada — exactamente lo que fue el corazón. Las que quedan sin cablear se declaran aquí,
    // una a una, para que añadir una nueva sin acción obligue a venir y justificarla.
    const SIN_ACCION_TODAVIA = ["Compartir"];
    const mudas = acciones()
      .filter((a) => !a.includes("onClick"))
      .map((a) => /label="([^"]+)"/.exec(a)?.[1] ?? a);
    expect(mudas).toEqual(SIN_ACCION_TODAVIA);
  });
});
