/**
 * IR HACIA ATRÁS EN UN KEYSET — pieza PURA, sin base de datos y sin React.
 *
 * Lo que se fija:
 *  - IDA Y VUELTA EXACTA: avanzar N páginas y retroceder N devuelve, una a una, las MISMAS posiciones.
 *    Es el invariante entero de la pieza: "Anterior" tiene que llevar a la página de la que se vino,
 *    no a una parecida.
 *  - la PRIMERA página no tiene anterior (y por eso la vista no pinta el control, en vez de ofrecer
 *    un botón que no hace nada);
 *  - la pila viene de la URL, o sea de fuera: una entrada con mala pinta la invalida ENTERA, porque
 *    descartar solo la mala desplazaría las demás y "Anterior" mentiría en silencio;
 *  - hay techo, y al pasarse se tira lo VIEJO (lo lejano), nunca lo cercano.
 *
 * Para romperlo: que `anterior` no desapile (`pila` sin recortar) -> rojo en la ida y vuelta; que
 * `siguiente` apile también desde la primera página -> rojo al volver a la primera; que `leerPila`
 * descarte solo las entradas malas -> rojo en "todo o nada".
 */
import { describe, expect, it } from "vitest";

import {
  anterior,
  enlacePaginado,
  escribirPila,
  leerPila,
  PILA_MAX,
  PILA_SEPARADOR,
  PRIMERA,
  siguiente,
  type Paginacion,
} from "../src/lib/paginacion-pila";

/** Cursores con la forma real de los de cuentas (llevan puntos: por eso el separador es `~`). */
const cursor = (n: number) => `alta.cuid${n}.MTc2${n}`;

/** Avanza `n` páginas desde la primera y devuelve TODAS las posiciones por las que se pasó. */
function ida(n: number): Paginacion[] {
  const camino: Paginacion[] = [PRIMERA];
  let p: Paginacion = PRIMERA;
  for (let i = 1; i <= n; i += 1) {
    p = siguiente(p, cursor(i));
    camino.push(p);
  }
  return camino;
}

describe("ida y vuelta", () => {
  it("retroceder N páginas devuelve EXACTAMENTE las mismas posiciones de la ida", () => {
    const camino = ida(5);

    const vuelta: Paginacion[] = [camino[camino.length - 1]!];
    // ACOTADO a propósito, no un `while (p !== null)`: si alguien quita la guarda de la primera
    // página, aquel bucle no termina nunca y el test muere por memoria a los 50 s en vez de fallar.
    // Un diente que revienta el worker sirve, pero cuesta de leer; este falla y dice por qué.
    let p = anterior(vuelta[0]!);
    for (let i = 0; i < 20 && p !== null; i += 1) {
      vuelta.push(p);
      p = anterior(p);
    }
    expect(p, "se llegó al tope sin tocar la primera página").toBeNull();

    expect(vuelta.reverse()).toEqual(camino);
  });

  it("la PRIMERA página no tiene anterior", () => {
    expect(anterior(PRIMERA)).toBeNull();
    // Y tampoco lo tiene si alguien le cuela una pila por la URL: lo que manda es no tener cursor.
    expect(anterior({ cursor: null, pila: [cursor(1), cursor(2)] })).toBeNull();
  });

  it("desde la SEGUNDA se vuelve a la primera, que no tiene cursor ni pila", () => {
    const [, segunda] = ida(1);
    expect(segunda).toEqual({ cursor: cursor(1), pila: [] });
    expect(anterior(segunda!)).toEqual(PRIMERA);
  });

  it("avanzar desde la primera NO apila nada (la primera se representa con la pila vacía)", () => {
    expect(siguiente(PRIMERA, cursor(1)).pila).toEqual([]);
    // Si apilara algo, volver desde la segunda llevaría a un cursor en vez de a la primera página.
    expect(anterior(siguiente(PRIMERA, cursor(1)))?.cursor).toBeNull();
  });

  it("cada página recuerda por dónde se llegó, en orden", () => {
    const camino = ida(4);
    expect(camino[3]).toEqual({ cursor: cursor(3), pila: [cursor(1), cursor(2)] });
  });
});

describe("el enlace de una posición", () => {
  it("la PRIMERA página es la ruta pelada: dos URLs para el mismo sitio ensucian el historial", () => {
    expect(enlacePaginado("/panel/monedero", PRIMERA)).toBe("/panel/monedero");
  });

  it("y lleva cursor y pila cuando los hay", () => {
    expect(enlacePaginado("/x", { cursor: "c2", pila: ["c1"] })).toBe("/x?cursor=c2&pila=c1");
  });

  it("EL FILTRO VIAJA CON LA POSICIÓN, que es lo que esto existe para arreglar", () => {
    // Sin esto, "Siguiente" en la cola filtrada por "Pendientes" llevaba a la página dos de TODAS
    // —otra lista— y nada lo decía: la página dos existe, tiene filas, y son las equivocadas.
    expect(
      enlacePaginado("/panel/monedero", { cursor: "c2", pila: [] }, { estado: "PENDING" }),
    ).toBe("/panel/monedero?estado=PENDING&cursor=c2");
  });

  it("un filtro vacío NO ensucia la URL", () => {
    // `?estado=` suelto convierte la primera página en otra dirección para el mismo sitio.
    expect(enlacePaginado("/x", PRIMERA, { estado: undefined, q: "", u: null })).toBe("/x");
  });

  it("y el filtro va DELANTE de la posición: la misma forma en todas las páginas", () => {
    const uno = enlacePaginado("/x", PRIMERA, { estado: "PAID" });
    const dos = enlacePaginado("/x", { cursor: "c", pila: [] }, { estado: "PAID" });
    expect(uno).toBe("/x?estado=PAID");
    expect(dos.startsWith("/x?estado=PAID")).toBe(true);
  });
});

describe("la pila viene de la URL, o sea de fuera", () => {
  it("ida y vuelta por la cadena", () => {
    const pila = [cursor(1), cursor(2), cursor(3)];
    expect(leerPila(escribirPila(pila))).toEqual(pila);
    expect(escribirPila([])).toBe("");
    expect(leerPila("")).toEqual([]);
  });

  it("TODO O NADA: una entrada con mala pinta invalida la pila entera", () => {
    const buena = escribirPila([cursor(1), cursor(2)]);
    expect(leerPila(buena)).toHaveLength(2);

    // Si se descartara SOLO la mala, quedaría una pila de 1 y "Anterior" llevaría a otra página sin
    // que nada fallara. Vacía es una respuesta honesta: se vuelve a la primera.
    for (const mala of ["no válido", "'; DROP TABLE", "a".repeat(200), "<script>", "a/b", ""]) {
      expect(leerPila(`${cursor(1)}${PILA_SEPARADOR}${mala}`), mala).toEqual([]);
    }
  });

  it("esta pieza no juzga si un cursor SIGNIFICA algo, solo su forma", () => {
    // `alta.a.b` tiene la forma de un cursor y aquí pasa: que apunte a algo real lo decide después
    // quien lo decodifica (`decodificarCursorCuentas`), que además rechaza los de otro orden. Meter
    // aquí la gramática del cursor sería una segunda copia de esa regla, esperando a divergir.
    expect(leerPila(`${cursor(1)}${PILA_SEPARADOR}alta.a.b`)).toEqual([cursor(1), "alta.a.b"]);
  });

  it("lo que no es una cadena, o es enorme, se ignora sin lanzar", () => {
    for (const raw of [undefined, null, 7, ["a", "b"], {}, "x".repeat(PILA_MAX * 128 + 1)]) {
      expect(leerPila(raw), String(raw)).toEqual([]);
    }
  });

  it("hay TECHO, y al pasarse se tira lo VIEJO (lo cercano es lo que se usa)", () => {
    const larga = Array.from({ length: PILA_MAX + 5 }, (_, i) => cursor(i));
    const leida = leerPila(larga.join(PILA_SEPARADOR));

    expect(leida).toHaveLength(PILA_MAX);
    // Lo último de la lista sobrevive: es la página inmediatamente anterior.
    expect(leida[leida.length - 1]).toBe(larga[larga.length - 1]);
    expect(leida[0]).toBe(larga[5]);
  });

  it("avanzar tampoco deja crecer la pila por encima del techo", () => {
    let p: Paginacion = PRIMERA;
    for (let i = 1; i <= PILA_MAX + 10; i += 1) p = siguiente(p, cursor(i));

    expect(p.pila.length).toBeLessThanOrEqual(PILA_MAX);
    // Y la de justo antes sigue siendo la correcta: el recorte nunca toca lo cercano.
    expect(anterior(p)?.cursor).toBe(cursor(PILA_MAX + 9));
  });
});
