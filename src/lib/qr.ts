/**
 * DIBUJAR UN QR — la parte pura: de la matriz de módulos a un `path` de SVG.
 *
 * LA CODIFICACIÓN NO ES NUESTRA (`qrcode-generator`: Reed-Solomon, enmascarado, versiones). Lo que
 * sí es nuestro es cómo se PINTA, y por eso está aquí y no dentro del componente: un QR mal dibujado
 * —sin zona tranquila, con los módulos separados por el antialias— no falla, simplemente deja de
 * escanearse en algunos teléfonos, que es la peor clase de fallo. Se ata con tests.
 *
 * UN SOLO `path` Y NO UN `rect` POR MÓDULO: un QR de 29×29 son 841 módulos y la mitad van pintados.
 * Cuatrocientos nodos en el DOM por un adorno de 120 px es caro de más, y con un único `path` el
 * navegador lo rasteriza de una vez y no aparecen costuras blancas entre celdas contiguas.
 */

import qrcode from "qrcode-generator";

/** Cuántos módulos de margen. El estándar pide 4: por debajo, hay lectores que no encuentran el código. */
export const QR_ZONA_TRANQUILA = 4;

/** Una matriz cuadrada de módulos: `true` = módulo oscuro. */
export type MatrizQr = readonly (readonly boolean[])[];

/**
 * El texto, codificado a matriz de módulos.
 *
 * VIVE AQUÍ Y NO EN EL COMPONENTE, y no es por orden: mientras estuvo allí, el test construía su
 * propia copia de estas cuatro líneas para poder comprobarlas — o sea, comprobaba su copia y no el
 * código. Se podían intercambiar fila y columna en el componente y todo seguía verde.
 *
 * `qrcode(0, "M")`: versión 0 = la más pequeña donde quepa el texto; corrección "M" (~15%), que es
 * el estándar y da la malla más pequeña que aún tolera un dedo o un reflejo encima. No se sube a
 * "H" porque eso es para cuando se pinta un logo dentro, y aquí no se pinta.
 *
 * OJO CON EL ORDEN: `isDark(fila, columna)`. Cambiarlo transpone el dibujo, y un QR transpuesto
 * SIGUE teniendo sus tres patrones en tres esquinas —solo que dos intercambiados—, así que mirar
 * las esquinas no lo detecta. Lo detecta la huella de `tests/qr.test.ts`.
 */
export function matrizQr(texto: string): MatrizQr {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, fila) =>
    Array.from({ length: n }, (_, col) => qr.isDark(fila, col)),
  );
}

/**
 * El `path` de los módulos oscuros, en coordenadas de MÓDULO (1 unidad = 1 módulo), ya desplazado
 * por la zona tranquila. Quien lo use pone el `viewBox` con `ladoQr` y escala con CSS: así el QR es
 * nítido a cualquier tamaño y no hay que decidir píxeles aquí.
 */
export function rutaQr(matriz: MatrizQr, margen: number = QR_ZONA_TRANQUILA): string {
  const trozos: string[] = [];
  for (let fila = 0; fila < matriz.length; fila += 1) {
    const f = matriz[fila]!;
    let col = 0;
    while (col < f.length) {
      if (!f[col]) {
        col += 1;
        continue;
      }
      // SE AGRUPAN LOS MÓDULOS SEGUIDOS de una fila en un solo rectángulo. Además de acortar el
      // path, evita que dos celdas vecinas se dibujen con un borde compartido: en ese borde el
      // antialias deja una línea más clara, y esas líneas son las que confunden a un lector.
      const desde = col;
      while (col < f.length && f[col]) col += 1;
      trozos.push(`M${desde + margen} ${fila + margen}h${col - desde}v1h-${col - desde}z`);
    }
  }
  return trozos.join("");
}

/** El lado del `viewBox`: los módulos más la zona tranquila a los dos lados. */
export function ladoQr(matriz: MatrizQr, margen: number = QR_ZONA_TRANQUILA): number {
  return matriz.length + margen * 2;
}
