/**
 * LA RACHA, AISLADA. Es la pieza que decide cuántos días seguidos llevas, y se calcula cada vez
 * que alguien la mira: no hay barrido que la rompa, así que toda la corrección está aquí.
 *
 * Lo que se fija:
 *  - SIGUE VIVA SI EL ÚLTIMO DÍA FUE AYER (queda el día de hoy para continuarla), y muere a los
 *    DOS días. Ese es el borde que más fácil se mueve y el que más se nota.
 *  - MARCAR DOS VECES EL MISMO DÍA NO ESCRIBE: `siguienteDiaActivo` devuelve el MISMO objeto, que
 *    es lo que permite al servicio no tocar `User` en la acción número cincuenta de la tarde.
 *  - La longitud se DERIVA de (inicio, último): no hay un tercer dato que pueda contradecirlos.
 *  - El umbral del premio sale de la constante, y está clavado.
 *  - EL DÍA ES UTC, con su consecuencia escrita: dos instantes del mismo día UTC son el mismo día
 *    aunque para quien los vivió fueran dos.
 */
import { describe, expect, it } from "vitest";

import { RACHA_DIAS_PREMIO } from "../src/config/constants";
import {
  cambiaAlMarcar,
  claveDia,
  diasEntre,
  diaUTC,
  rachaActual,
  rachaPremiada,
  siguienteDiaActivo,
} from "../src/lib/racha";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const instante = (a: number, m: number, d: number, h: number) => new Date(Date.UTC(a, m - 1, d, h));

describe("el día es UTC", () => {
  it("un instante se reduce a la medianoche de su día", () => {
    expect(diaUTC(instante(2026, 10, 6, 23)).toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(diaUTC(instante(2026, 10, 6, 0)).toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });

  it("dos instantes del MISMO día UTC son el mismo día, aunque se vivieran en dos", () => {
    // Las 23:00 y las 01:00 UTC del día siguiente son, en UTC+10, la misma madrugada y la mañana
    // siguiente. Para nosotros son días DISTINTOS. Es la salvedad aceptada de la v1 y está escrita
    // en `lib/racha`: se fija aquí para que nadie la "arregle" sin darse cuenta de que era una
    // decisión.
    expect(diasEntre(instante(2026, 10, 6, 23), instante(2026, 10, 7, 1))).toBe(1);
    expect(diasEntre(instante(2026, 10, 6, 0), instante(2026, 10, 6, 23))).toBe(0);
  });

  it("los días cuentan hacia atrás también", () => {
    expect(diasEntre(dia(2026, 10, 6), dia(2026, 10, 1))).toBe(-5);
  });

  it("y cruzan meses y años sin saltarse nada", () => {
    expect(diasEntre(dia(2026, 12, 31), dia(2027, 1, 1))).toBe(1);
    expect(diasEntre(dia(2026, 2, 28), dia(2026, 3, 1))).toBe(1); // 2026 no es bisiesto
    expect(diasEntre(dia(2028, 2, 28), dia(2028, 3, 1))).toBe(2); // 2028 sí
  });
});

describe("cuánto vale la racha hoy", () => {
  const hoy = dia(2026, 10, 6);

  it("sin nada, cero", () => {
    expect(rachaActual({ inicio: null, ultimo: null }, hoy)).toBe(0);
  });

  it("activo HOY: la racha es la distancia entre los extremos, más uno", () => {
    expect(rachaActual({ inicio: hoy, ultimo: hoy }, hoy)).toBe(1);
    expect(rachaActual({ inicio: dia(2026, 10, 2), ultimo: hoy }, hoy)).toBe(5);
  });

  it("activo AYER: sigue viva, queda el día de hoy para continuarla", () => {
    const ayer = dia(2026, 10, 5);
    expect(rachaActual({ inicio: dia(2026, 10, 1), ultimo: ayer }, hoy)).toBe(5);
  });

  it("activo ANTEAYER: rota, cero — y nadie ha tenido que romperla", () => {
    const anteayer = dia(2026, 10, 4);
    expect(rachaActual({ inicio: dia(2026, 10, 1), ultimo: anteayer }, hoy)).toBe(0);
  });

  it("y cuanto más vieja, más cero", () => {
    expect(rachaActual({ inicio: dia(2026, 1, 1), ultimo: dia(2026, 6, 1) }, hoy)).toBe(0);
  });

  it("un último día en el FUTURO no inventa racha", () => {
    expect(rachaActual({ inicio: hoy, ultimo: dia(2026, 10, 9) }, hoy)).toBe(0);
  });

  it("un estado a medias (solo un extremo) vale cero, no revienta", () => {
    expect(rachaActual({ inicio: hoy, ultimo: null }, hoy)).toBe(0);
    expect(rachaActual({ inicio: null, ultimo: hoy }, hoy)).toBe(0);
  });
});

describe("marcar el día", () => {
  const hoy = dia(2026, 10, 6);

  it("la primera vez, la racha empieza hoy", () => {
    expect(siguienteDiaActivo({ inicio: null, ultimo: null }, hoy)).toEqual({
      inicio: hoy,
      ultimo: hoy,
    });
  });

  it("viniendo de AYER, la racha CONTINÚA: el inicio no se mueve", () => {
    const inicio = dia(2026, 10, 1);
    expect(siguienteDiaActivo({ inicio, ultimo: dia(2026, 10, 5) }, hoy)).toEqual({
      inicio,
      ultimo: hoy,
    });
  });

  it("viniendo de ANTEAYER, la racha se REINICIA hoy", () => {
    expect(siguienteDiaActivo({ inicio: dia(2026, 10, 1), ultimo: dia(2026, 10, 4) }, hoy)).toEqual(
      { inicio: hoy, ultimo: hoy },
    );
  });

  it("MARCAR DOS VECES EL MISMO DÍA devuelve el MISMO objeto (no hay nada que escribir)", () => {
    // La identidad importa: es lo que el servicio compara para no tocar `User` otra vez. Si
    // devolviera un objeto nuevo equivalente, la acción número cincuenta de la tarde escribiría.
    const estado = { inicio: dia(2026, 10, 1), ultimo: hoy };
    expect(siguienteDiaActivo(estado, hoy)).toBe(estado);
    expect(cambiaAlMarcar(estado, hoy)).toBe(false);
    // Y a cualquier hora del mismo día, igual.
    expect(siguienteDiaActivo(estado, instante(2026, 10, 6, 23))).toBe(estado);
  });

  it("pero el día siguiente SÍ cambia", () => {
    const estado = { inicio: dia(2026, 10, 1), ultimo: hoy };
    expect(cambiaAlMarcar(estado, dia(2026, 10, 7))).toBe(true);
  });

  it("siete días seguidos dan una racha de siete", () => {
    let estado = { inicio: null as Date | null, ultimo: null as Date | null };
    for (let d = 1; d <= RACHA_DIAS_PREMIO; d += 1)
      estado = siguienteDiaActivo(estado, dia(2026, 10, d));
    expect(rachaActual(estado, dia(2026, 10, RACHA_DIAS_PREMIO))).toBe(RACHA_DIAS_PREMIO);
  });
});

describe("el premio", () => {
  it(`son ${RACHA_DIAS_PREMIO} días, y moverlo exige venir aquí`, () => {
    // Clavado, como el umbral de denuncias, el plazo de inmunidad y los 50 likes. Sin esto, los
    // demás casos se derivan de la constante y le seguirían la corriente.
    expect(RACHA_DIAS_PREMIO).toBe(7);
  });

  it("no se premia por debajo del umbral, y sí justo al alcanzarlo", () => {
    const hoy = dia(2026, 10, 10);
    const desde = (dias: number) => ({
      inicio: new Date(hoy.getTime() - (dias - 1) * 24 * 60 * 60 * 1000),
      ultimo: hoy,
    });
    for (let d = 1; d < RACHA_DIAS_PREMIO; d += 1) {
      expect(rachaPremiada(desde(d), hoy), `${d} días`).toBe(false);
    }
    expect(rachaPremiada(desde(RACHA_DIAS_PREMIO), hoy)).toBe(true);
    expect(rachaPremiada(desde(RACHA_DIAS_PREMIO + 20), hoy)).toBe(true);
  });

  it("una racha ROTA no se premia por larga que fuera", () => {
    expect(
      rachaPremiada({ inicio: dia(2026, 1, 1), ultimo: dia(2026, 3, 1) }, dia(2026, 10, 6)),
    ).toBe(false);
  });
});

describe("la clave del día", () => {
  it("es el día en UTC, sin hora", () => {
    expect(claveDia(instante(2026, 10, 6, 23))).toBe("2026-10-06");
  });

  it("y dos instantes del mismo día dan la MISMA clave (de ahí la idempotencia del premio)", () => {
    expect(claveDia(instante(2026, 10, 6, 1))).toBe(claveDia(instante(2026, 10, 6, 22)));
  });
});
