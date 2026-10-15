/**
 * EL CSV — escapado y codificación, que es por donde se rompe de verdad.
 *
 * ┌─ LOS CUATRO FALLOS, Y NINGUNO FALLA AL GENERAR ──────────────────────────────────────────────┐
 * │ Una COMA en un nombre ("Ruiz, Marta") parte la fila en dos columnas. Una COMILLA en un motivo │
 * │ escrito a mano cierra el campo antes de tiempo. Un SALTO DE LÍNEA parte la fila en dos filas. │
 * │ Y sin BOM, "Dirección" sale "DirecciÃ³n" en Excel. Los cuatro se ven al ABRIR el fichero, y   │
 * │ quien lo abre está cuadrando dinero.                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo a propósito: quitar el BOM (rojo), escapar con `\"` en vez de duplicando la
 * comilla (rojo), o devolver "null" en un campo vacío (rojo: una celda con la palabra null en una
 * columna de importes es una celda que alguien suma).
 */
import { describe, expect, it } from "vitest";

import { CSV_BOM, csvCampo, csvDocumento, csvFila, csvNombre } from "../src/lib/csv";

describe("un campo se escapa cuando toca, y solo cuando toca", () => {
  it("lo normal va tal cual: entrecomillar todo haría el fichero ilegible a ojo", () => {
    expect(csvCampo("ES9121000418450200051332")).toBe("ES9121000418450200051332");
    expect(csvCampo("marta")).toBe("marta");
    expect(csvCampo(1234)).toBe("1234");
  });

  it("una COMA entrecomilla: si no, la fila gana una columna", () => {
    expect(csvCampo("Ruiz, Marta")).toBe('"Ruiz, Marta"');
  });

  it("una COMILLA se DUPLICA, que es como lo escribe RFC 4180", () => {
    // Con `\"` —el escape de JSON— Excel lee la barra como un carácter más y el campo se parte.
    expect(csvCampo('dijo "no"')).toBe('"dijo ""no"""');
    expect(csvCampo('dijo "no"')).not.toContain('\\"');
  });

  it("un SALTO DE LÍNEA entrecomilla: si no, la fila se parte en dos filas", () => {
    expect(csvCampo("primera\nsegunda")).toBe('"primera\nsegunda"');
    expect(csvCampo("con\r\nretorno")).toBe('"con\r\nretorno"');
  });

  it("y los espacios de los bordes también", () => {
    // Algunas hojas de cálculo los recortan al abrir: un IBAN con un espacio perdido dejaría de
    // cuadrar con el de la base de datos, y nadie sabría por qué.
    expect(csvCampo(" ES91 ")).toBe('" ES91 "');
  });

  it("vacío es VACÍO, nunca la palabra null", () => {
    expect(csvCampo(null)).toBe("");
    expect(csvCampo(undefined)).toBe("");
    expect(csvCampo("")).toBe("");
  });

  it("el cero SÍ se escribe: es un dato, no un hueco", () => {
    expect(csvCampo(0)).toBe("0");
  });
});

describe("una fila y un documento", () => {
  it("la fila junta con comas, con cada campo escapado", () => {
    expect(csvFila(["a", "b, c", null, 3])).toBe('a,"b, c",,3');
  });

  it("el documento lleva BOM, cabecera y CRLF", () => {
    const doc = csvDocumento(["id", "nombre"], [["1", "Ruiz, Marta"]]);
    expect(doc.startsWith(CSV_BOM), "sin BOM, Excel destroza los acentos").toBe(true);
    expect(doc).toBe(`${CSV_BOM}id,nombre\r\n1,"Ruiz, Marta"\r\n`);
  });

  it("y un documento sin filas sigue teniendo su cabecera", () => {
    // Un CSV vacío de verdad (0 bytes) se abre como un fichero roto; con cabecera se abre y dice
    // que no hay nada, que es un resultado.
    expect(csvDocumento(["id"], [])).toBe(`${CSV_BOM}id\r\n`);
  });

  it("el BOM va UNA vez, no por fila", () => {
    const doc = csvDocumento(["a"], [["1"], ["2"]]);
    expect(doc.split(CSV_BOM)).toHaveLength(2);
  });
});

describe("el nombre del fichero", () => {
  it("lleva la fecha, para que dos exportaciones no se pisen", () => {
    const n = csvNombre("retiradas", new Date("2026-10-15T09:30:00Z"));
    expect(n).toBe("retiradas-2026-10-15T09-30-00.csv");
  });

  it("y no deja pasar caracteres raros al nombre", () => {
    // El prefijo viene de la ruta; aunque hoy sea una unión cerrada, un nombre de fichero es lo
    // último donde conviene confiar en que la entrada ya venía limpia.
    expect(csvNombre("../../etc/passwd", new Date("2026-01-01T00:00:00Z"))).toBe(
      "etcpasswd-2026-01-01T00-00-00.csv",
    );
  });

  it("los dos puntos de la hora NO sobreviven: Windows no los admite en un nombre", () => {
    expect(csvNombre("x", new Date("2026-01-01T12:34:56Z"))).not.toContain(":");
  });
});
