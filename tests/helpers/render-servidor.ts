/**
 * RENDERIZAR UN COMPONENTE DE SERVIDOR ASÍNCRONO EN UN TEST (Fase 11 · P5b1).
 *
 * Desde la P5b1 muchos componentes de servidor son `async` (piden sus textos con `await textos(…)`), y
 * React en el navegador —el de testing-library— no sabe pintar un componente asíncrono. En la app lo
 * resuelve el servidor antes de mandar nada; aquí lo hace esto: recorre el árbol, LLAMA a cada
 * componente `async` con sus props, espera su resultado y sigue bajando. Los componentes normales (los
 * de cliente, con hooks) NO se llaman: se quedan como elementos, para que React los monte como siempre.
 *
 * `tambien` (P5b2b): los componentes de SERVIDOR SÍNCRONOS que hay que llamar igual porque llevan uno
 * asíncrono dentro (sin hooks; desde fuera no se distinguen de uno de cliente, así que se nombran). Sin
 * esto, React se encuentra la promesa del de dentro y la página entera se pinta vacía.
 */
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

const esAsincrona = (f: unknown): f is (p: unknown) => Promise<ReactNode> =>
  typeof f === "function" && f.constructor.name === "AsyncFunction";

export interface OpcionesResolver {
  tambien?: readonly unknown[];
}

async function resolverValor(v: unknown, o: OpcionesResolver): Promise<unknown> {
  if (Array.isArray(v)) return Promise.all(v.map((x) => resolverValor(x, o)));
  if (isValidElement(v)) return resolverServidor(v, o);
  return v;
}

export async function resolverServidor(
  nodo: ReactNode,
  opciones: OpcionesResolver = {},
): Promise<ReactNode> {
  if (Array.isArray(nodo))
    return Promise.all(nodo.map((n) => resolverServidor(n, opciones))) as Promise<ReactNode>;
  if (!isValidElement(nodo)) return nodo;
  const el = nodo as ReactElement<Record<string, unknown>>;
  if (esAsincrona(el.type)) return resolverServidor(await el.type(el.props), opciones);
  if (typeof el.type === "function" && opciones.tambien?.includes(el.type)) {
    return resolverServidor((el.type as (p: unknown) => ReactNode)(el.props), opciones);
  }
  const props: Record<string, unknown> = {};
  let cambia = false;
  for (const [k, v] of Object.entries(el.props)) {
    if (k === "children" || isValidElement(v) || Array.isArray(v)) {
      const r =
        k === "children"
          ? await resolverServidor(Children.toArray(v as ReactNode), opciones)
          : await resolverValor(v, opciones);
      props[k] = r;
      cambia = true;
    }
  }
  return cambia ? cloneElement(el, props) : el;
}
