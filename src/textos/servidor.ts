/**
 * LOS TEXTOS EN EL SERVIDOR (Fase 11 · P5b1) — server-only: el único sitio que importa los
 * diccionarios. Un componente de servidor pide su espacio y pinta el texto (`await textos("inicio")`):
 * al navegador solo llega el HTML. Un componente de CLIENTE recibe, por `TextosProvider`, SOLO los
 * espacios que usa y SOLO del idioma de la página (`textosParaCliente`): el diccionario entero no viaja
 * nunca (lo fijan `textos-fuera-del-cliente` y la revisión de la imagen en CI).
 */
import "server-only";

import type { Idioma } from "@/lib/formato";
import { IDIOMA_PSEUDO, type IdiomaDeTextos } from "@/lib/idioma-ruta";
import { idiomaDeLaPeticion, idiomaDeTextosDeLaPeticion } from "@/server/formato-peticion";

import { es } from "./es";
import { crearT, type FuncionT } from "./plantilla";
import { pseudoDiccionario } from "./pseudo";

export type Textos = typeof es;
export type NombreEspacio = Exclude<keyof Textos, "__idioma">;

/**
 * El diccionario de cada idioma. Hasta la P5c solo existe el castellano: `en` y `de` lo reutilizan, y
 * no importa porque no se publican (el proxy los da por 404). La P5c pone aquí `en` y `de` (con
 * `satisfies Diccionario<typeof es>`).
 */
const DICCIONARIOS: Record<Idioma, Textos> = { es, en: es, de: es };

let pseudo: Textos | null = null;
function diccionario(idioma: IdiomaDeTextos): Textos {
  if (idioma === IDIOMA_PSEUDO) return (pseudo ??= pseudoDiccionario(es));
  return DICCIONARIOS[idioma];
}

/** La `t` de un espacio, en el idioma de la petición. */
export async function textos<N extends NombreEspacio>(espacio: N): Promise<FuncionT<Textos[N]>> {
  const [idiomaTextos, idiomaFormato] = await Promise.all([
    idiomaDeTextosDeLaPeticion(),
    idiomaDeLaPeticion(),
  ]);
  return crearT(diccionario(idiomaTextos)[espacio], idiomaFormato);
}

/** Lo que un componente de cliente recibe: SOLO esos espacios, SOLO de ese idioma. */
export type TextosCliente<N extends NombreEspacio> = Pick<Textos, N>;

export function textosParaCliente<N extends NombreEspacio>(
  idioma: IdiomaDeTextos,
  espacios: readonly N[],
): TextosCliente<N> {
  const d = diccionario(idioma);
  const salida = {} as TextosCliente<N>;
  for (const e of espacios) salida[e] = d[e];
  return salida;
}

/** `textosParaCliente` con el idioma de la petición: lo que pasa un layout o una página a su proveedor. */
export async function textosClienteDeLaPeticion<N extends NombreEspacio>(
  espacios: readonly N[],
): Promise<TextosCliente<N>> {
  return textosParaCliente(await idiomaDeTextosDeLaPeticion(), espacios);
}
