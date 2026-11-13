"use client";

import { createContext, useContext } from "react";

import type { Idioma, ZonaHoraria } from "@/lib/formato";

/**
 * EL IDIOMA Y LA ZONA PARA LOS COMPONENTES DE CLIENTE (Fase 11 · P1).
 *
 * Los resuelve el servidor (cookie, ver `lib/zona-espectador`) y los baja el layout raíz: así el
 * cliente formatea con la MISMA zona que el servidor, y el HTML hidrata igual a los dos lados. La zona
 * puede ser `null` (aún no la sabemos): cada componente decide qué hacer, normalmente quitar la hora.
 */
const Contexto = createContext<{ idioma: Idioma; zona: ZonaHoraria | null } | null>(null);

export function FormatoProvider({
  idioma,
  zona,
  children,
}: {
  idioma: Idioma;
  zona: ZonaHoraria | null;
  children: React.ReactNode;
}) {
  return <Contexto.Provider value={{ idioma, zona }}>{children}</Contexto.Provider>;
}

/** El idioma y la zona de quien mira. Fuera del proveedor LANZA: un componente sin ellos es un fallo. */
export function useFormato(): { idioma: Idioma; zona: ZonaHoraria | null } {
  const v = useContext(Contexto);
  if (!v) throw new Error("useFormato fuera de FormatoProvider");
  return v;
}
