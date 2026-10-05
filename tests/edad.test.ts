/**
 * LA PUERTA DE LOS 18, EN LA FRONTERA.
 *
 * Lo que se fija:
 *  - el día que cumples la edad mínima YA entras (es `>=`, no `>`), y el día de antes no;
 *  - el umbral sale de `EDAD_MIN_USO` y de ningún número escrito aquí: todos los casos se derivan
 *    de la constante, así que moverla mueve la frontera en el test y en el producto a la vez;
 *  - los años bisiestos salen solos: quien nació un 29 de febrero cumple el 1 de marzo;
 *  - una fecha que no existe, futura o imposible se rechaza — no se "corrige" en silencio.
 *
 * Para romperlo: cambiar `>=` por `>` en `declaraEdadMinima` (rojo en el día del cumpleaños);
 * quitar el viaje de ida y vuelta de `leerFechaNacimiento` (rojo en el 30 de febrero); aceptar
 * fechas futuras (rojo).
 */
import { describe, expect, it } from "vitest";

import { EDAD_MIN_USO } from "../src/config/constants";
import {
  declaraEdadMinima,
  edadEn,
  EDAD_MAX_PLAUSIBLE,
  leerFechaNacimiento,
} from "../src/lib/edad";

/** Un día fijo desde el que se mira todo: los tests no pueden depender de cuándo se ejecutan. */
const HOY = new Date(Date.UTC(2026, 9, 5)); // 5 de octubre de 2026
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

describe("años cumplidos", () => {
  it("el día del cumpleaños ya cuenta el año nuevo", () => {
    expect(edadEn(utc(2000, 10, 5), HOY)).toBe(26);
    // Un día antes del cumpleaños todavía no.
    expect(edadEn(utc(2000, 10, 6), HOY)).toBe(25);
    // Y un día después, igual que el día del cumpleaños.
    expect(edadEn(utc(2000, 10, 4), HOY)).toBe(26);
  });

  it("recién nacido: cero", () => {
    expect(edadEn(HOY, HOY)).toBe(0);
  });

  it("el mes manda antes que el día", () => {
    expect(edadEn(utc(2000, 11, 1), HOY)).toBe(25); // noviembre aún no ha llegado
    expect(edadEn(utc(2000, 9, 30), HOY)).toBe(26); // septiembre ya pasó
  });
});

describe("la frontera de la edad mínima", () => {
  /** El día exacto en que alguien cumple `EDAD_MIN_USO` mirando desde HOY. */
  const justoEnElLimite = utc(
    HOY.getUTCFullYear() - EDAD_MIN_USO,
    HOY.getUTCMonth() + 1,
    HOY.getUTCDate(),
  );

  it("con la edad mínima EXACTA, hoy, entra", () => {
    expect(edadEn(justoEnElLimite, HOY)).toBe(EDAD_MIN_USO);
    expect(declaraEdadMinima(justoEnElLimite, HOY)).toBe(true);
  });

  it("un día por debajo, no entra", () => {
    const unDiaMenos = new Date(justoEnElLimite.getTime() + 24 * 60 * 60 * 1000);
    expect(edadEn(unDiaMenos, HOY)).toBe(EDAD_MIN_USO - 1);
    expect(declaraEdadMinima(unDiaMenos, HOY)).toBe(false);
  });

  it("un día por encima, entra", () => {
    const unDiaMas = new Date(justoEnElLimite.getTime() - 24 * 60 * 60 * 1000);
    expect(declaraEdadMinima(unDiaMas, HOY)).toBe(true);
  });

  it("la frontera SALE de la constante: con otro umbral, otro veredicto", () => {
    // Si alguien escribiera el 18 a mano en `declaraEdadMinima`, este caso seguiría pasando pero
    // el de abajo —el que deriva el año de la constante— se rompería al mover `EDAD_MIN_USO`.
    const conEdad = (anios: number) =>
      utc(HOY.getUTCFullYear() - anios, HOY.getUTCMonth() + 1, HOY.getUTCDate());
    for (let anios = 0; anios < EDAD_MIN_USO; anios += 1) {
      expect(declaraEdadMinima(conEdad(anios), HOY), `${anios} años`).toBe(false);
    }
    for (const anios of [EDAD_MIN_USO, EDAD_MIN_USO + 1, EDAD_MIN_USO + 40]) {
      expect(declaraEdadMinima(conEdad(anios), HOY), `${anios} años`).toBe(true);
    }
  });
});

describe("29 de febrero", () => {
  it("en un año sin 29, se cumple el 1 de marzo (no el 28 de febrero)", () => {
    const bisiesto = utc(2008, 2, 29);
    // 2026 no es bisiesto. El 28 de febrero todavía tiene 17.
    expect(edadEn(bisiesto, utc(2026, 2, 28))).toBe(17);
    expect(edadEn(bisiesto, utc(2026, 3, 1))).toBe(18);
    expect(declaraEdadMinima(bisiesto, utc(2026, 2, 28))).toBe(false);
    expect(declaraEdadMinima(bisiesto, utc(2026, 3, 1))).toBe(true);
  });

  it("y en un año bisiesto se cumple el 29", () => {
    expect(edadEn(utc(2008, 2, 29), utc(2028, 2, 29))).toBe(20);
  });
});

describe("leer la fecha que escribe la persona", () => {
  it("una fecha normal se lee como el día en UTC", () => {
    const f = leerFechaNacimiento("1995-03-14", HOY);
    expect(f?.toISOString()).toBe("1995-03-14T00:00:00.000Z");
  });

  it("un día que NO existe se rechaza, no se corre al mes siguiente", () => {
    // `new Date("2026-02-30")` no falla: devuelve el 2 de marzo. Eso es un dato distinto del que
    // escribió la persona, y aceptarlo sería guardarle una fecha que no es la suya.
    expect(leerFechaNacimiento("2001-02-30", HOY)).toBeNull();
    expect(leerFechaNacimiento("2001-13-01", HOY)).toBeNull();
    expect(leerFechaNacimiento("2001-04-31", HOY)).toBeNull();
  });

  it("el 29 de febrero de un año bisiesto SÍ existe", () => {
    expect(leerFechaNacimiento("2008-02-29", HOY)).not.toBeNull();
    expect(leerFechaNacimiento("2007-02-29", HOY)).toBeNull();
  });

  it("nada de fechas futuras", () => {
    expect(leerFechaNacimiento("2027-01-01", HOY)).toBeNull();
    // Hoy mismo sí es una fecha válida (otra cosa es que pase la puerta de edad).
    expect(leerFechaNacimiento("2026-10-05", HOY)).not.toBeNull();
  });

  it("ni fechas imposibles por viejas", () => {
    const limite = HOY.getUTCFullYear() - EDAD_MAX_PLAUSIBLE;
    expect(leerFechaNacimiento(`${limite - 1}-01-01`, HOY)).toBeNull();
    expect(leerFechaNacimiento(`${limite + 1}-01-01`, HOY)).not.toBeNull();
  });

  it("y nada que no sea una cadena con la forma exacta", () => {
    for (const malo of [
      null,
      undefined,
      42,
      {},
      "",
      "ayer",
      "1995-3-14",
      "14/03/1995",
      "1995-03-14T00:00:00Z",
    ]) {
      expect(leerFechaNacimiento(malo, HOY), String(malo)).toBeNull();
    }
  });
});
