/**
 * `tRico` — TEXTO CON FORMATO DENTRO DE UNA SOLA FRASE (Fase 11 · P5b1).
 *
 * ┌─ EL FALLO QUE CIERRA ─────────────────────────────────────────────────────────────────────────────┐
 * │ «El mayor premio en juego ahora mismo» estaba en TRES claves («El », «mayor premio», « en juego │
 * │ ahora mismo») para poder meter el resaltado en medio. En castellano se lee bien; al traducir no: │
 * │ en alemán el orden de las palabras cambia y los trozos no encajan en ningún orden. Una frase es  │
 * │ UNA clave, y el formato va DENTRO: «El {resaltado:mayor premio} en juego ahora mismo».          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Reglas (las fijan `textos-tipos`, `textos-base` y `render/textos-ricos-marcado`):
 *  - CATÁLOGO CERRADO de marcas (`PropsDeMarca`, en plantilla.ts): una marca desconocida no compila, ni
 *    en el diccionario ni en la llamada. El diccionario solo NOMBRA la marca; la etiqueta, la clase y el
 *    destino los pone el código que pinta.
 *  - NUNCA HTML desde el diccionario: cada trozo entra como TEXTO de React (escapado). Un `<script>` en
 *    una plantilla se lee «<script>», no se ejecuta. Aquí no hay `dangerouslySetInnerHTML`, y no lo habrá.
 *  - Los parámetros, como en `t`: sacados del tipo de la plantilla (también los de DENTRO de una marca),
 *    obligatorios al compilar, `{n}` y plurales con la P1, `{marca}` desde `MARCA`.
 *  - Sirve igual en el servidor (`textosRicos`) y en el cliente (`useTextosRicos`): este fichero no tiene
 *    ni hooks ni diccionarios.
 */
import { Fragment, type ReactNode } from "react";

import { Enlace } from "@/components/enlace";
import type { Idioma } from "@/lib/formato";

import {
  plantillaDe,
  valoresDe,
  type Args,
  type ClavesRicas,
  type Espacio,
  type MarcasPara,
  type PropsDeMarca,
} from "./plantilla";

/** Un trozo de plantilla: texto, un `{param}` o una `{marca:…}` con lo que lleva dentro. */
export type Nodo = string | { param: string } | { marca: string; hijos: Nodo[] };

/** Lee desde `i` hasta el final (o hasta la `}` que cierra la marca en la que se está). */
function leer(s: string, i: number, dentroDeMarca: boolean): [Nodo[], number] {
  const nodos: Nodo[] = [];
  let texto = "";
  const soltarTexto = () => {
    if (texto) nodos.push(texto);
    texto = "";
  };
  while (i < s.length) {
    const c = s[i]!;
    if (c === "{") {
      const m = /^\{(\w+)([}:])/.exec(s.slice(i));
      if (m) {
        soltarTexto();
        if (m[2] === "}") {
          nodos.push({ param: m[1]! });
          i += m[0].length;
        } else {
          const [hijos, fin] = leer(s, i + m[0].length, true);
          nodos.push({ marca: m[1]!, hijos });
          i = fin;
        }
        continue;
      }
    } else if (c === "}" && dentroDeMarca) {
      soltarTexto();
      return [nodos, i + 1];
    }
    texto += c;
    i++;
  }
  soltarTexto();
  return [nodos, i];
}

/** Una plantilla, en trozos. Pura: se prueba sola. */
export function analizarPlantilla(plantilla: string): Nodo[] {
  return leer(plantilla, 0, false)[0];
}

type MarcasDadas = Partial<{ [M in keyof PropsDeMarca]: PropsDeMarca[M] }>;

function pintar(
  nodos: Nodo[],
  valores: Record<string, string>,
  marcas: MarcasDadas,
  prefijo: string,
): ReactNode[] {
  const salida: ReactNode[] = [];
  nodos.forEach((n, i) => {
    // Texto y parámetros se JUNTAN en un solo trozo de texto: el DOM queda como lo escribiría una persona.
    const texto =
      typeof n === "string" ? n : "param" in n ? (valores[n.param] ?? `{${n.param}}`) : null;
    if (texto !== null) {
      const ultimo = salida.length - 1;
      if (typeof salida[ultimo] === "string") salida[ultimo] += texto;
      else salida.push(texto);
      return;
    }
    const nodo = n as { marca: string; hijos: Nodo[] };
    const clave = `${prefijo}${i}`;
    const hijos = pintar(nodo.hijos, valores, marcas, `${clave}.`);
    switch (nodo.marca) {
      case "resaltado":
        salida.push(
          <span key={clave} className={marcas.resaltado?.className}>
            {hijos}
          </span>,
        );
        return;
      case "enlace":
        salida.push(
          <Enlace
            key={clave}
            href={marcas.enlace!.href}
            className={marcas.enlace?.className}
            onClick={marcas.enlace?.onClick}
          >
            {hijos}
          </Enlace>,
        );
        return;
      case "salto":
        salida.push(<br key={clave} />);
        return;
      case "oculto":
        salida.push(
          <span key={clave} className="sr-only">
            {hijos}
          </span>,
        );
        return;
      default:
        // No compila (catálogo cerrado). Si llegara —un diccionario sin comprobar—, sus PALABRAS, sin formato.
        salida.push(<Fragment key={clave}>{hijos}</Fragment>);
    }
  });
  return salida;
}

/**
 * La función de un espacio para las claves CON formato: `tRico("clave", { resaltado: {…} }, { … })`.
 * El segundo argumento lleva lo que necesita cada marca de la plantilla (y solo esas); el tercero, sus
 * parámetros, si tiene.
 */
export type FuncionTRico<E extends Espacio> = <K extends ClavesRicas<E> & string>(
  clave: K,
  marcas: MarcasPara<E[K]>,
  ...args: Args<E[K]>
) => ReactNode;

export function crearTRico<E extends Espacio>(espacio: E, idioma: Idioma): FuncionTRico<E> {
  return ((clave: string, marcas: MarcasDadas, parametros?: Record<string, string | number>) => {
    const texto = espacio[clave];
    if (texto === undefined) return clave; // no compila; si llega aquí, que se vea
    const plantilla = plantillaDe(texto, parametros, idioma);
    return <>{pintar(analizarPlantilla(plantilla), valoresDe(parametros, idioma), marcas, "")}</>;
  }) as FuncionTRico<E>;
}
