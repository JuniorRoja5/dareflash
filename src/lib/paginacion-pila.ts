/**
 * IR HACIA ATRÁS EN UNA LISTA PAGINADA POR KEYSET — pieza PURA, sin saber qué se está paginando.
 *
 * EL PROBLEMA. Un keyset sabe decir "dame lo que viene DESPUÉS de aquí" y nada más: el cursor apunta
 * hacia delante. Para volver a la página anterior hay tres caminos, y dos son malos:
 *
 *   · OFFSET — numerar páginas exige un `COUNT` y un `OFFSET`, que es justo el diseño que la lista
 *     evitó a propósito (la página 50 obliga a producir y descartar las 49 anteriores, y si algo
 *     cambia entre medias se repiten o se saltan filas).
 *   · CONSULTA INVERSA — pedir "lo ANTERIOR a este cursor" ordenando al revés. Funciona, pero es otra
 *     consulta y otro camino que mantener, con su propio borde en la primera página.
 *   · RECORDAR POR DÓNDE SE PASÓ — que es esto. Navegar hacia delante ya conoce el cursor de cada
 *     página que se visita; guardarlos hace que volver cueste EXACTAMENTE lo mismo que ir: la misma
 *     consulta, con un cursor que ya se usó una vez. Sin consulta nueva y sin `COUNT`.
 *
 * DÓNDE VIVE LA PILA: en la URL, como todo lo demás de esa pantalla. Así recargar no pierde el sitio,
 * el botón "atrás" del navegador sigue funcionando y no hay estado de cliente que se desincronice.
 *
 * Y COMO VIVE EN LA URL, es dato de fuera: cualquiera puede escribir lo que quiera. Por eso
 * `leerPila` es TODO O NADA — una entrada con mala pinta invalida la pila entera en vez de colarse
 * como una posición más. Descartar solo la mala desplazaría las demás, y "Anterior" llevaría a una
 * página que no es la de la que se vino, en silencio. Con una pila vacía se vuelve a la primera, que
 * es un sitio real. Además, un cursor manipulado lo rechaza después quien lo decodifica.
 */

/**
 * Separador de la pila en la URL. `~` a propósito: no aparece en un cursor de cuentas
 * (`orden.id.valor-en-base64url`), así que no hay que escapar nada para partirla sin ambigüedad.
 */
export const PILA_SEPARADOR = "~";

/** Lo que puede haber dentro de UNA entrada. Deliberadamente sin el separador. */
const ENTRADA = /^[A-Za-z0-9_.-]{1,120}$/;

/**
 * Cuántas páginas hacia atrás se recuerdan. La pila viaja en la URL, así que crece con la navegación
 * y hay que ponerle un techo: 40 entradas son unos 2 KB, lejos de lo que aguanta cualquier
 * navegador, y cuarenta páginas hacia atrás en un back-office no las anda nadie.
 *
 * Al pasarse, se tiran las MÁS VIEJAS: lo que se conserva es lo cercano, que es lo que se usa. La
 * degradación es suave y honesta — desde muy al fondo, "Anterior" acaba llevando a la primera página
 * en vez de a la inmediatamente anterior, pero nunca a una página equivocada.
 */
export const PILA_MAX = 40;

/** Tope de lo que se acepta leer de la URL, para no procesar una cadena enorme. */
const CRUDO_MAX = PILA_MAX * 128;

/** Dónde está la navegación: la página que se ve y por dónde se llegó. */
export interface Paginacion {
  /** Cursor de la página actual. `null` = la primera. */
  cursor: string | null;
  /** Cursores de las páginas anteriores, de la más antigua a la más reciente. */
  pila: readonly string[];
}

/** La primera página: sin cursor y sin nada que recordar. */
export const PRIMERA: Paginacion = { cursor: null, pila: [] };

/**
 * Lee la pila de la URL. Todo o nada: si una sola entrada no tiene la forma esperada, se devuelve
 * vacía (ver la cabecera). Nunca lanza.
 */
export function leerPila(raw: unknown): string[] {
  if (typeof raw !== "string" || raw === "" || raw.length > CRUDO_MAX) return [];
  const partes = raw.split(PILA_SEPARADOR);
  if (partes.some((p) => !ENTRADA.test(p))) return [];
  // Si viene más larga que el techo, se conserva LO CERCANO (el final), no el principio.
  return partes.slice(-PILA_MAX);
}

/** Serializa la pila para la URL. Cadena vacía = no hay nada que poner. */
export function escribirPila(pila: readonly string[]): string {
  return pila.join(PILA_SEPARADOR);
}

/**
 * Avanzar: la página actual pasa a ser "de dónde vengo".
 *
 * Desde la PRIMERA página no se apila nada, porque la primera no tiene cursor: se representa con la
 * pila vacía, y por eso volver a ella desde la segunda sale solo.
 */
export function siguiente(p: Paginacion, proximoCursor: string): Paginacion {
  return {
    cursor: proximoCursor,
    pila: p.cursor === null ? [] : [...p.pila, p.cursor].slice(-PILA_MAX),
  };
}

/**
 * Retroceder: se desapila. `null` cuando ya se está en la primera página — y eso es lo que la vista
 * usa para NO pintar el control, en vez de ofrecer un botón que no lleva a ninguna parte.
 */
export function anterior(p: Paginacion): Paginacion | null {
  if (p.cursor === null) return null;
  return { cursor: p.pila[p.pila.length - 1] ?? null, pila: p.pila.slice(0, -1) };
}
