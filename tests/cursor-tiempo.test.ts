/**
 * EL CURSOR COMPARTIDO DE LAS LISTAS POR `(createdAt, id)`.
 *
 * Lo usan el historial propio de retiradas, la cola del panel y el historial de ajustes. Estaba
 * copiado en cada uno —misma tupla, mismo regex— y la cuarta copia iba a ser la que se dejara el
 * `id` fuera, que es el fallo que hace que dos filas del mismo milisegundo se repitan entre
 * páginas. Al vivir en un sitio, se prueba una vez y protege a las cuatro.
 *
 * Y AQUÍ SE PRUEBA LO QUE NO SE PUEDE OBSERVAR DESDE ARRIBA: con el índice `(columna, id)` puesto,
 * quitar el desempate del `orderBy` no cambia ningún resultado —InnoDB lo regala al recorrer el
 * índice—, así que el caso de comportamiento de cada lista no lo ve. Lo que sí se puede probar
 * ejecutando es el CODEC y la forma del `where`, que es lo de aquí.
 *
 * Para romperlo a propósito: quitar el `id` del `codificar` (rojo), aceptar un cursor con caracteres
 * raros (rojo), o devolver solo la rama del `lt` en `dondeDesde` (rojo).
 */
import { describe, expect, it } from "vitest";

import {
  codificarCursorTiempo,
  decodificarCursorTiempo,
  dondeDesde,
} from "../src/lib/cursor-tiempo";

const POSICION = { creadoMs: 1788222192198, id: "88149881-ce26-4d05-9b6f-c9d2fbbcaf8c" };

describe("codificar y decodificar", () => {
  it("va y vuelve igual", () => {
    expect(decodificarCursorTiempo(codificarCursorTiempo(POSICION))).toEqual(POSICION);
  });

  it("el cursor lleva la TUPLA, no solo el id", () => {
    // Con solo el id, la consulta no sabe por dónde seguir si esa fila se borra entre páginas.
    const c = codificarCursorTiempo(POSICION);
    expect(c).toContain(String(POSICION.creadoMs));
    expect(c).toContain(POSICION.id);
  });

  it("un cursor manipulado es `null` (= primera página), nunca una excepción", () => {
    for (const basura of [
      "",
      null,
      undefined,
      "nada",
      "123",
      "abc.def",
      "'; DROP TABLE Withdrawal; --",
      "1788222192198.id con espacios",
      // Más dígitos de los que cabe un instante razonable: no se intenta convertir.
      `${"9".repeat(20)}.abc`,
      // El separador de la pila NO puede colarse dentro de una entrada.
      "1788222192198.abc~def",
    ]) {
      expect(decodificarCursorTiempo(basura), JSON.stringify(basura)).toBeNull();
    }
  });

  it("y lo que sale encaja en la pila que guarda la navegación hacia atrás", () => {
    // `paginacion-pila` acepta `[A-Za-z0-9_.-]`: si el codec usara otro carácter, la pila se
    // invalidaría entera al volver y "Anterior" llevaría siempre a la primera página.
    expect(codificarCursorTiempo(POSICION)).toMatch(/^[A-Za-z0-9_.-]+$/);
  });
});

describe("el `where` del keyset", () => {
  it("sin cursor no filtra nada: es la primera página", () => {
    expect(dondeDesde(null)).toEqual({});
  });

  it("con cursor compara la tupla COMPLETA: la fecha, y el id para los empates", () => {
    // La rama del empate es la que más se olvida al copiar, y sin ella dos filas del mismo
    // milisegundo se repiten entre páginas o se pierden.
    expect(dondeDesde(POSICION)).toEqual({
      OR: [
        { createdAt: { lt: new Date(POSICION.creadoMs) } },
        { createdAt: new Date(POSICION.creadoMs), id: { lt: POSICION.id } },
      ],
    });
  });

  it("y es `lt`, no `lte`: con `lte` la página siguiente repite la última de la anterior", () => {
    const w = dondeDesde(POSICION) as { OR: { createdAt: unknown }[] };
    expect(JSON.stringify(w)).toContain('"lt"');
    expect(JSON.stringify(w)).not.toContain('"lte"');
  });
});
