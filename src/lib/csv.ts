/**
 * CSV — generación pura, sin saber qué se está exportando.
 *
 * ┌─ UN CSV SE ROMPE POR SITIOS MUY CONCRETOS, Y TODOS SALEN EN DATOS DE VERDAD ──────────────────┐
 * │ Una COMA en el nombre de alguien ("Ruiz, Marta") parte la fila en dos columnas. Una COMILLA   │
 * │ en un motivo escrito a mano cierra el campo antes de tiempo. Un SALTO DE LÍNEA dentro de un   │
 * │ texto parte la fila en dos filas. Y el acento de "Dirección" sale como "DirecciÃ³n" en Excel  │
 * │ si el fichero no lleva BOM. Ninguno de los cuatro falla al generar: fallan al abrirlo, y el   │
 * │ que lo abre es quien está cuadrando dinero.                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Se hace a mano y no con una dependencia porque son veinte líneas y RFC 4180 cabe entero aquí.
 */

/**
 * Un campo, escapado. Se entrecomilla SIEMPRE que contenga coma, comilla, salto de línea o espacios
 * en los bordes; las comillas de dentro se duplican, que es como las escribe RFC 4180.
 *
 * `null`/`undefined` salen como campo VACÍO, no como "null": un CSV de contabilidad con la palabra
 * "null" en una celda de importe es una celda que alguien va a sumar.
 */
export function csvCampo(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const s = String(valor);
  // El espacio en los bordes también fuerza comillas: algunas hojas de cálculo lo recortan al abrir
  // y un IBAN con un espacio perdido dejaría de cuadrar con el de la base de datos.
  if (/[",\r\n]/.test(s) || s !== s.trim()) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/** Una fila. CRLF lo pone el documento, no la fila. */
export function csvFila(campos: readonly (string | number | null | undefined)[]): string {
  return campos.map(csvCampo).join(",");
}

/**
 * EL BOM de UTF-8. Excel abre un CSV sin BOM asumiendo la codificación del sistema, así que todo lo
 * que lleve tilde o la ñ sale ilegible — y aquí hay nombres de personas y motivos escritos a mano.
 * Tres bytes que convierten un fichero inservible en uno que se abre de doble clic.
 *
 * SE CONSTRUYE, no se escribe. Puesto como literal (`"﻿"`), el formateador lo convierte en el
 * CARÁCTER, que es invisible: el fuente queda con un hueco donde debería verse algo, y lo invisible
 * se borra sin que nadie lo note. Así se ve, se busca y se explica.
 */
export const CSV_BOM = String.fromCharCode(0xfeff);

/**
 * El documento entero: BOM + cabecera + filas, separadas por CRLF (lo que espera RFC 4180, y lo que
 * menos sorpresas da en Windows, que es donde se abren estos ficheros).
 */
export function csvDocumento(
  cabecera: readonly string[],
  filas: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return CSV_BOM + [csvFila(cabecera), ...filas.map(csvFila)].join("\r\n") + "\r\n";
}

/**
 * Nombre de fichero con la fecha, para que dos exportaciones no se pisen en la carpeta de descargas
 * y se sepa de cuándo es cada una sin abrirla. Solo caracteres seguros.
 */
export function csvNombre(prefijo: string, ahora: Date = new Date()): string {
  const iso = ahora.toISOString().slice(0, 19).replaceAll(":", "-");
  return `${prefijo.replace(/[^a-z0-9-]/gi, "")}-${iso}.csv`;
}
