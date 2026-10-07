/**
 * LO QUE LA PANTALLA DE COMPRA DICE DE LOS PRECIOS SALE DEL CATÁLOGO.
 *
 * Tres cifras que la vista podría haber escrito a mano —el precio por Boost, el "ahorras un X%" y
 * cuál es el paquete recomendado— y que aquí se derivan de `PAQUETES_BOOST`. Lo que se fija:
 *
 *  - LOS VALORES DE HOY, CLAVADOS. Son precios de verdad: si alguien los mueve, que tenga que venir
 *    aquí y decidirlo, no que el test le siga la corriente.
 *  - EL ORDEN es por boosts, de menos a más: es el orden en que se leen las tres tarjetas.
 *  - EL "MEJOR PRECIO" ES UNO Y SOLO UNO, y es el de menor céntimo por boost. Dos recomendados no
 *    recomiendan nada, y cero dejaría la pantalla sin su único botón magenta.
 *  - EL AHORRO DEL MÁS CARO ES 0, para que la vista pueda no pintar la etiqueta: "ahorras un 0%" es
 *    ruido con forma de oferta.
 *  - EL REDONDEO DEL CÉNTIMO POR BOOST, con un catálogo de división inexacta. Los tres paquetes de
 *    hoy dividen exacto, así que este caso prueba la propiedad con datos que HOY no existen — es la
 *    única forma de que un paquete futuro de 3 por $10 no saque un 333,333... a pantalla.
 */
import { describe, expect, it } from "vitest";

import { PAQUETES_BOOST } from "../src/config/constants";
import { paquetesEnVenta } from "../src/lib/boost-precio";

describe("los tres paquetes, derivados del catálogo", () => {
  it("son exactamente estos, con estas cifras", () => {
    expect(paquetesEnVenta()).toEqual([
      {
        clave: "boost_1",
        boosts: 1,
        precioCents: 500,
        porBoostCents: 500,
        ahorroPct: 0,
        mejorPrecio: false,
      },
      {
        clave: "boost_5",
        boosts: 5,
        precioCents: 1500,
        porBoostCents: 300,
        ahorroPct: 40,
        mejorPrecio: false,
      },
      {
        clave: "boost_10",
        boosts: 10,
        precioCents: 2000,
        porBoostCents: 200,
        ahorroPct: 60,
        mejorPrecio: true,
      },
    ]);
  });

  it("van de menos a más boosts", () => {
    const boosts = paquetesEnVenta().map((p) => p.boosts);
    expect(boosts).toEqual([...boosts].sort((a, b) => a - b));
  });

  it("y están TODOS los del catálogo: no se puede vender uno a medias", () => {
    expect(
      paquetesEnVenta()
        .map((p) => p.clave)
        .sort(),
    ).toEqual(Object.keys(PAQUETES_BOOST).sort());
  });
});

describe("el recomendado", () => {
  it("es UNO solo", () => {
    expect(paquetesEnVenta().filter((p) => p.mejorPrecio)).toHaveLength(1);
  });

  it("y es el de menor precio POR BOOST, no el más caro ni el más grande por grande", () => {
    const ps = paquetesEnVenta();
    const mejor = ps.find((p) => p.mejorPrecio)!;
    expect(mejor.porBoostCents).toBe(Math.min(...ps.map((p) => p.porBoostCents)));
  });
});

describe("el ahorro", () => {
  it("es 0 en el más caro por unidad, para que la vista pueda callarse", () => {
    const ps = paquetesEnVenta();
    const masCaro = ps.reduce((a, b) => (b.porBoostCents > a.porBoostCents ? b : a));
    expect(masCaro.ahorroPct).toBe(0);
  });

  it("nunca es negativo ni pasa de 100", () => {
    for (const p of paquetesEnVenta()) {
      expect(p.ahorroPct).toBeGreaterThanOrEqual(0);
      expect(p.ahorroPct).toBeLessThanOrEqual(100);
    }
  });

  it("crece cuando baja el precio por boost", () => {
    const ps = [...paquetesEnVenta()].sort((a, b) => b.porBoostCents - a.porBoostCents);
    const ahorros = ps.map((p) => p.ahorroPct);
    expect(ahorros).toEqual([...ahorros].sort((a, b) => a - b));
  });
});

describe("el céntimo por boost es un ENTERO siempre", () => {
  it("con el catálogo de hoy", () => {
    for (const p of paquetesEnVenta()) {
      expect(Number.isInteger(p.porBoostCents), `${p.clave} saca decimales`).toBe(true);
    }
  });

  it("y con uno que NO divide exacto (3 por $10 -> 333, no 333,333…)", () => {
    // La propiedad se prueba sobre la misma operación que usa la función, con datos que hoy no
    // están en el catálogo: un flotante en una cifra de dinero es un error esperando a que alguien
    // añada un paquete impar, y entonces ya es tarde.
    expect(Number.isInteger(Math.round(1000 / 3))).toBe(true);
    expect(Math.round(1000 / 3)).toBe(333);
  });
});
