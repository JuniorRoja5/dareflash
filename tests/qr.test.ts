/**
 * EL QR SE TIENE QUE PODER ESCANEAR, que es lo único que se le pide.
 *
 * UN QR MAL DIBUJADO NO FALLA: se dibuja igual y deja de leerse en algunos teléfonos. No hay
 * excepción, no hay pantalla en rojo, no hay nada en los logs — simplemente alguien apunta la
 * cámara y no pasa nada. Por eso la parte que es nuestra (cómo se pinta) se ata aquí, y las dos
 * cosas que la rompen en silencio son las dos que se comprueban:
 *
 *  - LA ZONA TRANQUILA. El estándar pide 4 módulos de margen. Con menos, hay lectores que ni
 *    encuentran el código; y es justo lo primero que alguien recorta para que "se vea más grande".
 *  - LAS COSTURAS. Un `rect` por módulo deja que el antialias pinte una línea clara en el borde
 *    compartido de dos celdas vecinas, y ahí es donde el lector mide el contraste. Se agrupan los
 *    módulos seguidos en un solo rectángulo.
 *
 * Y se comprueba contra la codificación de verdad (`qrcode-generator`), no contra una matriz
 * inventada: los tres patrones de localización tienen que acabar donde el estándar dice.
 */
import { describe, expect, it } from "vitest";

import { ladoQr, matrizQr, QR_ZONA_TRANQUILA, rutaQr, type MatrizQr } from "../src/lib/qr";

// Se usa LA MISMA función que el componente, no una copia. Tenerla duplicada aquí fue un error que
// duró un rato: se podían intercambiar fila y columna en el código de producción y este fichero
// seguía verde, porque estaba comprobando su propia copia.
const matrizDe = matrizQr;

const ENLACE = "https://dareflash.com/entrar?ref=a2e879d4fwca2";

describe("la zona tranquila", () => {
  it("son cuatro módulos, los que pide el estándar", () => {
    expect(QR_ZONA_TRANQUILA).toBe(4);
  });

  it("el lienzo deja margen a los dos lados", () => {
    const m = matrizDe(ENLACE);
    expect(ladoQr(m)).toBe(m.length + 8);
  });

  it("ningún módulo se pinta dentro del margen", () => {
    const m = matrizDe(ENLACE);
    // Todas las coordenadas del path, que van en unidades de módulo ya desplazadas.
    const xs = [...rutaQr(m).matchAll(/M(\d+) (\d+)/g)].map((g) => ({
      x: Number(g[1]),
      y: Number(g[2]),
    }));
    expect(xs.length).toBeGreaterThan(20);
    for (const { x, y } of xs) {
      expect(x, `x=${x} invade el margen`).toBeGreaterThanOrEqual(QR_ZONA_TRANQUILA);
      expect(y, `y=${y} invade el margen`).toBeGreaterThanOrEqual(QR_ZONA_TRANQUILA);
      expect(x).toBeLessThan(m.length + QR_ZONA_TRANQUILA);
      expect(y).toBeLessThan(m.length + QR_ZONA_TRANQUILA);
    }
  });
});

describe("los módulos seguidos van en UN rectángulo, no en varios", () => {
  it("una fila entera oscura produce un solo trozo, ancho entero", () => {
    const m: MatrizQr = [
      [true, true, true, true],
      [false, false, false, false],
    ];
    expect(rutaQr(m, 0)).toBe("M0 0h4v1h-4z");
  });

  it("los huecos parten la fila, y cada trozo mide lo suyo", () => {
    const m: MatrizQr = [[true, true, false, true]];
    expect(rutaQr(m, 0)).toBe("M0 0h2v1h-2zM3 0h1v1h-1z");
  });

  it("una matriz sin módulos oscuros no dibuja nada", () => {
    expect(rutaQr([[false, false]], 0)).toBe("");
  });

  it("y el margen desplaza el dibujo entero", () => {
    expect(rutaQr([[true]], 4)).toBe("M4 4h1v1h-1z");
  });
});

describe("contra la codificación real", () => {
  it("los tres patrones de localización están en sus esquinas", () => {
    // El estándar los pone en 7×7 arriba-izquierda, arriba-derecha y abajo-izquierda, y su esquina
    // exterior SIEMPRE es un módulo oscuro. Si el dibujo se volteara o se desplazara, esto cae.
    const m = matrizDe(ENLACE);
    const n = m.length;
    expect(m[0]![0], "esquina superior izquierda").toBe(true);
    expect(m[0]![n - 1], "esquina superior derecha").toBe(true);
    expect(m[n - 1]![0], "esquina inferior izquierda").toBe(true);
    // La cuarta esquina NO lleva patrón: si fuera oscura, estaríamos pintando otra cosa.
    expect(m[n - 1]![n - 1], "esquina inferior derecha").toBe(false);
  });

  it("el enlace cabe en una versión razonable (si creciera, el QR se volvería ilegible de lejos)", () => {
    const n = matrizDe(ENLACE).length;
    // Versión 1 son 21 módulos y cada versión suma 4. Por encima de ~45 el módulo se hace tan
    // pequeño a 128 px que deja de leerse cómodamente desde otro teléfono.
    expect(n).toBeGreaterThanOrEqual(21);
    expect(n).toBeLessThanOrEqual(45);
  });

  it("dos enlaces distintos dan dibujos distintos (no se está pintando una plantilla)", () => {
    expect(rutaQr(matrizDe(`${ENLACE}A`))).not.toBe(rutaQr(matrizDe(`${ENLACE}B`)));
  });
});

/**
 * LA HUELLA — lo único que caza una transposición, un espejo o un desplazamiento.
 *
 * Mirar las esquinas NO basta, y esto costó un verde falso: un QR transpuesto sigue teniendo sus
 * tres patrones de localización en tres esquinas, solo que con dos intercambiados, así que la
 * comprobación de esquinas pasaba tan feliz con el dibujo volteado. Un QR volteado no se escanea.
 *
 * La codificación es DETERMINISTA por norma (misma versión, misma máscara, mismo resultado), así
 * que el dibujo de un texto fijo es una constante y se puede clavar. Si esto se pone rojo, hay
 * exactamente dos causas: alguien tocó cómo se dibuja —y entonces es el rojo que se buscaba—, o la
 * librería cambió su codificación en una actualización. En el segundo caso NO se reescribe el
 * número a ojo: se genera el QR, se escanea con un teléfono de verdad, y solo entonces se re-anota.
 */
describe("la huella del dibujo", () => {
  /** Suma de comprobación estable y sin dependencias (FNV-1a de 32 bits). */
  function huella(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  it("el dibujo de un enlace fijo es EXACTAMENTE el de siempre", () => {
    const ruta = rutaQr(matrizDe(ENLACE));
    // Anotados de la implementación actual. ESTO DETECTA UN CAMBIO, NO DEMUESTRA QUE SE ESCANEE:
    // que un QR se lea solo lo demuestra una cámara, y aquí no hay ninguna. Lo que este número
    // garantiza es que el dibujo que alguien validó una vez con un teléfono sigue siendo el mismo.
    expect({ huella: huella(ruta), largo: ruta.length }).toEqual({
      huella: 2_767_562_564,
      largo: 3_854,
    });
  });

  it("y esa huella distingue un dibujo TRANSPUESTO, que las esquinas no distinguen", () => {
    const m = matrizDe(ENLACE);
    const transpuesta: MatrizQr = m.map((_, f) => m.map((fila) => fila[f]!));
    // Las tres esquinas siguen oscuras en la transpuesta: por eso aquel test no servía.
    const n = m.length;
    expect(transpuesta[0]![0] && transpuesta[0]![n - 1] && transpuesta[n - 1]![0]).toBe(true);
    // La huella, en cambio, cambia.
    expect(huella(rutaQr(transpuesta))).not.toBe(huella(rutaQr(m)));
  });
});
