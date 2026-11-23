/**
 * LA CANÓNICA Y EL `hreflang` DE LA PETICIÓN (Fase 11 · P5a) — server-only. Un solo sitio: el layout
 * raíz. Sale de `x-df-ruta`, que pone el proxy en TODA página de la app; sin ella (el panel, que no se
 * traduce y no pasa por el proxy; o el build, que corre sin petición) no se publica ninguna, y
 * tampoco se lee `APP_URL`: así el build sin variables sigue compilando.
 */
import "server-only";

import type { Metadata } from "next";

import { IDIOMAS_PUBLICADOS } from "@/config/constants";
import { env } from "@/config/env";
import { alternativasDeIdioma } from "@/lib/idioma-ruta";

import { idiomaDeLaPeticion, rutaDeLaPeticion } from "./formato-peticion";

export async function alternativasDeLaPeticion(): Promise<Metadata["alternates"] | undefined> {
  const resto = await rutaDeLaPeticion();
  if (resto === null) return undefined;
  return alternativasDeIdioma(env.APP_URL, await idiomaDeLaPeticion(), resto, IDIOMAS_PUBLICADOS);
}
