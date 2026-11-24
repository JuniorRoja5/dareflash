"use client";

import { createContext, useContext, useMemo } from "react";

import type { Espacio } from "@/textos/plantilla";
import { crearT, type FuncionT } from "@/textos/plantilla";
import type { NombreEspacio, Textos } from "@/textos/servidor";

import { useFormato } from "./formato-provider";

/**
 * LOS TEXTOS DE LOS COMPONENTES DE CLIENTE (Fase 11 · P5b1). El servidor elige el idioma y pasa SOLO los
 * espacios que esa parte de la página usa (`textosParaCliente`); este proveedor los junta con los que ya
 * hubiera más arriba (el layout pone los del armazón, la página los suyos). Del diccionario solo se
 * importa el TIPO: el contenido llega como props desde el servidor, nunca en el JS.
 */
const Contexto = createContext<Partial<Record<NombreEspacio, Espacio>>>({});

export function TextosProvider({
  textos,
  children,
}: {
  textos: Partial<Textos>;
  children: React.ReactNode;
}) {
  const padre = useContext(Contexto);
  const valor = useMemo(
    () => ({ ...padre, ...(textos as Record<string, Espacio>) }),
    [padre, textos],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Los ESPACIOS tal cual (datos, no una `t`), para pasárselos a un componente que se pinta en el servidor
 * Y en el cliente (la tarjeta de un reto): ese no puede pedir sus textos, los recibe por prop y monta su
 * `t` con `crearT`. Sin alguno, LANZA, como `useTextos`.
 */
export function useEspacios<N extends NombreEspacio>(nombres: readonly N[]): Pick<Textos, N> {
  const espacios = useContext(Contexto);
  const salida = {} as Pick<Textos, N>;
  for (const n of nombres) {
    const e = espacios[n];
    if (!e) throw new Error(`useEspacios("${String(n)}"): ese espacio no llega a este componente`);
    (salida as Record<string, unknown>)[n] = e;
  }
  return salida;
}

/** La `t` de un espacio que el servidor ha pasado. Sin él LANZA: un texto que no llega es un fallo. */
export function useTextos<N extends NombreEspacio>(espacio: N): FuncionT<Textos[N]> {
  const espacios = useContext(Contexto);
  const { idioma } = useFormato();
  const e = espacios[espacio];
  const t = useMemo(() => (e ? crearT(e as Textos[N], idioma) : null), [e, idioma]);
  if (!t)
    throw new Error(`useTextos("${String(espacio)}"): ese espacio no llega a este componente`);
  return t;
}
