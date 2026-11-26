/**
 * LOS TEXTOS EN EL SERVIDOR (Fase 11 · P5b1) — server-only: con `textos/diccionarios` (que elige el
 * diccionario sin leer la petición, y lo comparte con la API), lo único que llega a ellos. Un componente de servidor pide su espacio y pinta el texto (`await textos("inicio")`):
 * al navegador solo llega el HTML. Un componente de CLIENTE recibe, por `TextosProvider`, SOLO los
 * espacios que usa y SOLO del idioma de la página (`textosParaCliente`): el diccionario entero no viaja
 * nunca (lo fijan `textos-fuera-del-cliente` y la revisión de la imagen en CI).
 */
import "server-only";

import type { IdiomaDeTextos } from "@/lib/idioma-ruta";
import { idiomaDeLaPeticion, idiomaDeTextosDeLaPeticion } from "@/server/formato-peticion";

import { diccionario, type NombreEspacio, type Textos } from "./diccionarios";
import type { MensajeApi } from "./mensaje-api";
import { crearT, type FuncionT } from "./plantilla";
import { crearTRico, type FuncionTRico } from "./rico";

export type { NombreEspacio, Textos };

/** La `t` de un espacio, en el idioma de la petición. */
export async function textos<N extends NombreEspacio>(espacio: N): Promise<FuncionT<Textos[N]>> {
  const [idiomaTextos, idiomaFormato] = await Promise.all([
    idiomaDeTextosDeLaPeticion(),
    idiomaDeLaPeticion(),
  ]);
  return crearT(diccionario(idiomaTextos)[espacio], idiomaFormato);
}

/** La `tRico` de un espacio (las frases con formato dentro), en el idioma de la petición. */
export async function textosRicos<N extends NombreEspacio>(
  espacio: N,
): Promise<FuncionTRico<Textos[N]>> {
  const [idiomaTextos, idiomaFormato] = await Promise.all([
    idiomaDeTextosDeLaPeticion(),
    idiomaDeLaPeticion(),
  ]);
  return crearTRico(diccionario(idiomaTextos)[espacio], idiomaFormato);
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

/**
 * La frase de un `MensajeApi` (P5b3) en el idioma de la PÁGINA. Para lo que una página y una ruta de la
 * API dicen con las mismas palabras —el aviso de nivel de un reto—: una frase, UNA clave (del espacio
 * `api`), que cada lado compone en su idioma.
 */
export async function fraseDeLaPeticion(m: MensajeApi): Promise<string> {
  const t = await textos("api");
  return (t as (clave: string, p?: Record<string, string>) => string)(m.clave, m.params);
}
