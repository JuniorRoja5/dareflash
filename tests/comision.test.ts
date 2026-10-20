/**
 * LA COMISIÓN DEL SPONSOR — aritmética, y las dos cosas que no pueden pasar con dinero.
 *
 *  - CÉNTIMOS ENTEROS SIEMPRE. Ni un `0.5` se escapa a una columna de "a cobrar".
 *  - NUNCA POR ENCIMA DE LO PACTADO: el cuarto de céntimo se queda fuera, no se redondea hacia
 *    arriba. Cobrar de más es un cargo que nadie aceptó; cobrar de menos es renunciar a una
 *    fracción de céntimo. El riesgo no es simétrico y la regla tampoco.
 *
 * Para romperlo: cambiar el `Math.floor` por `Math.round` (rojo: 999 al 25% daría 250), dividir
 * antes de multiplicar (rojo: el float aparece en los importes grandes), o leer el porcentaje de
 * una constante en vez del valor guardado del reto (eso lo caza `tests/retos-patrocinados`).
 */
import { describe, expect, it } from "vitest";

import { bpsAPorcentaje, BPS, comisionCents, totalSponsorCents } from "../src/lib/comision";
import { COMISION_SPONSOR_BPS_DEFECTO } from "../src/config/constants";

describe("la comisión, en céntimos enteros", () => {
  it("el caso redondo: 25% de 1000 son 250", () => {
    expect(comisionCents(1000, 2500)).toBe(250);
  });

  it("y el que NO es redondo se queda por debajo: 25% de 999 son 249, no 250", () => {
    // 249,75. El cuarto de céntimo no existe y no se cobra: ver el porqué en `lib/comision`.
    expect(comisionCents(999, 2500)).toBe(249);
  });

  it("el resultado es SIEMPRE entero, en todo el rango que puede salir de un formulario", () => {
    for (let premio = 0; premio <= 20_000; premio += 7) {
      for (const bps of [0, 1, 250, 2500, 3333, 10_000]) {
        const c = comisionCents(premio, bps);
        expect(Number.isInteger(c), `premio ${premio} bps ${bps} -> ${c}`).toBe(true);
      }
    }
  });

  it("y nunca pasa del porcentaje pactado (el error va a favor de quien paga)", () => {
    for (let premio = 1; premio <= 5_000; premio += 13) {
      for (const bps of [1, 777, 2500, 9_999]) {
        // La comparación se hace en ENTEROS multiplicados: comparar contra `premio * bps / 10000`
        // en coma flotante metería aquí justo el error que el código evita.
        expect(comisionCents(premio, bps) * BPS).toBeLessThanOrEqual(premio * bps);
      }
    }
  });

  it("premio 0, o comisión 0, no generan factura", () => {
    expect(comisionCents(0, 2500)).toBe(0);
    expect(comisionCents(5000, 0)).toBe(0);
  });

  it("y la basura no se convierte en una devolución", () => {
    // Los dos números salen de la base de datos y uno lo escribió una persona.
    expect(comisionCents(-1000, 2500)).toBe(0);
    expect(comisionCents(1000, -2500)).toBe(0);
    expect(comisionCents(Number.NaN, 2500)).toBe(0);
    expect(comisionCents(1000, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("el total que se le factura a la marca", () => {
  it("es el premio MÁS la comisión, no el premio", () => {
    // Quien cobra necesita UN número: la marca paga el premio (que adelantamos al ganador) y la
    // comisión encima.
    expect(totalSponsorCents(1000, 2500)).toBe(1250);
    expect(totalSponsorCents(999, 2500)).toBe(999 + 249);
  });

  it("y con comisión 0 es exactamente el premio", () => {
    expect(totalSponsorCents(4321, 0)).toBe(4321);
  });
});

describe("los bps se leen como un porcentaje", () => {
  it.each([
    [2500, "25"],
    [10_000, "100"],
    [0, "0"],
    [2550, "25.5"],
    [2505, "25.05"],
    [125, "1.25"],
  ])("%i bps -> %s%%", (bps, texto) => {
    expect(bpsAPorcentaje(bps)).toBe(texto);
  });

  it("y el default del producto es el 25%", () => {
    expect(bpsAPorcentaje(COMISION_SPONSOR_BPS_DEFECTO)).toBe("25");
  });
});
