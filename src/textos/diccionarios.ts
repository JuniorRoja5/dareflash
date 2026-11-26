/**
 * EL DICCIONARIO DE CADA IDIOMA (Fase 11) — server-only, y SIN leer la petición.
 *
 * Vive aparte de `textos/servidor` (que pregunta el idioma a las cabeceras que pone el proxy) para que
 * la API lo use sin tocar esas cabeceras: `/api` no pasa por el proxy, así que ahí `x-df-idioma` llega
 * tal cual la mande el cliente (P5b3). La API elige el idioma por la cookie `df-idioma`
 * (`server/http/textos-api`).
 */
import "server-only";

import type { Idioma } from "@/lib/formato";
import { IDIOMA_PSEUDO, type IdiomaDeTextos } from "@/lib/idioma-ruta";

import { es } from "./es";
import { pseudoDiccionario } from "./pseudo";

export type Textos = typeof es;
export type NombreEspacio = Exclude<keyof Textos, "__idioma">;

/**
 * Hasta la P5c solo existe el castellano: `en` y `de` lo reutilizan, y no importa porque no se
 * publican (el proxy los da por 404). La P5c pone aquí `en` y `de` (con `satisfies Diccionario<typeof es>`).
 */
const DICCIONARIOS: Record<Idioma, Textos> = { es, en: es, de: es };

let pseudo: Textos | null = null;
export function diccionario(idioma: IdiomaDeTextos): Textos {
  if (idioma === IDIOMA_PSEUDO) return (pseudo ??= pseudoDiccionario(es));
  return DICCIONARIOS[idioma];
}
