/**
 * RENDERIZAR UN COMPONENTE DE SERVIDOR ASÍNCRONO EN UN TEST (Fase 11 · P5b1).
 *
 * Desde la P5b1 muchos componentes de servidor son `async` (piden sus textos con `await textos(…)`), y
 * React en el navegador —el de testing-library— no sabe pintar un componente asíncrono. En la app lo
 * resuelve el servidor antes de mandar nada; aquí lo hace esto: recorre el árbol, LLAMA a cada
 * componente `async` con sus props, espera su resultado y sigue bajando. Los componentes normales (los
 * de cliente, con hooks) NO se llaman: se quedan como elementos, para que React los monte como siempre.
 */
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

const esAsincrona = (f: unknown): f is (p: unknown) => Promise<ReactNode> =>
  typeof f === "function" && f.constructor.name === "AsyncFunction";

async function resolverValor(v: unknown): Promise<unknown> {
  if (Array.isArray(v)) return Promise.all(v.map(resolverValor));
  if (isValidElement(v)) return resolverServidor(v);
  return v;
}

export async function resolverServidor(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) return Promise.all(nodo.map(resolverServidor)) as Promise<ReactNode>;
  if (!isValidElement(nodo)) return nodo;
  const el = nodo as ReactElement<Record<string, unknown>>;
  if (esAsincrona(el.type)) return resolverServidor(await el.type(el.props));
  const props: Record<string, unknown> = {};
  let cambia = false;
  for (const [k, v] of Object.entries(el.props)) {
    if (k === "children" || isValidElement(v) || Array.isArray(v)) {
      const r =
        k === "children"
          ? await resolverServidor(Children.toArray(v as ReactNode))
          : await resolverValor(v);
      props[k] = r;
      cambia = true;
    }
  }
  return cambia ? cloneElement(el, props) : el;
}
