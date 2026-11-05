/**
 * GEOGRAFÍA PURA (Fase 9 · P5): la haversine, la caja del radio, las zonas de quien mira y la mediana.
 *
 * Distancias CONOCIDAS, que es como se ve si alguien confunde grados con radianes: Valencia–Castellón
 * ≈63 km (dentro del radio de 100), Valencia–Alicante ≈134 km (fuera). Las coordenadas son las del
 * catálogo sembrado (GeoNames).
 *
 * Para romperlo a propósito: quitar la conversión a radianes en `distanciaKm` (rojo); olvidar el coseno
 * en la longitud de la caja (rojo el de la caja); que `zonasDe` no añada la global (rojo); que la
 * mediana devuelva 0 sin datos (rojo).
 */
import { describe, expect, it } from "vitest";

import { RADIO_PUBLICIDAD_KM } from "../src/config/constants";
import { UBICACION_DESCONOCIDA, cajaDeRadio, distanciaKm, mediana, zonasDe } from "../src/lib/geo";

const VALENCIA = { latitud: 39.47391, longitud: -0.37966 };
const CASTELLON = { latitud: 39.98567, longitud: -0.04935 };
const ALICANTE = { latitud: 38.34517, longitud: -0.48149 };
const MADRID = { latitud: 40.4165, longitud: -3.70256 };

describe("distanciaKm", () => {
  it("Valencia–Castellón ≈63 km: DENTRO del radio", () => {
    const d = distanciaKm(VALENCIA, CASTELLON);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(66);
    expect(d).toBeLessThanOrEqual(RADIO_PUBLICIDAD_KM);
  });

  it("Valencia–Alicante ≈126 km en línea recta: FUERA del radio", () => {
    const d = distanciaKm(VALENCIA, ALICANTE);
    expect(d).toBeGreaterThan(120);
    expect(d).toBeLessThan(130);
    expect(d).toBeGreaterThan(RADIO_PUBLICIDAD_KM);
  });

  it("Valencia–Madrid ≈303 km, y es simétrica y cero consigo misma", () => {
    expect(distanciaKm(VALENCIA, MADRID)).toBeGreaterThan(295);
    expect(distanciaKm(VALENCIA, MADRID)).toBeLessThan(310);
    expect(distanciaKm(MADRID, VALENCIA)).toBeCloseTo(distanciaKm(VALENCIA, MADRID), 9);
    expect(distanciaKm(VALENCIA, VALENCIA)).toBe(0);
  });
});

describe("cajaDeRadio", () => {
  it("contiene el círculo: lo que está a ≤100 km cae dentro de la caja", () => {
    const c = cajaDeRadio(VALENCIA, RADIO_PUBLICIDAD_KM);
    const dentro = (p: typeof VALENCIA) =>
      p.latitud >= c.latMin &&
      p.latitud <= c.latMax &&
      p.longitud >= c.lonMin &&
      p.longitud <= c.lonMax;
    expect(dentro(CASTELLON)).toBe(true);
    // Un punto a 99 km justo al este: la caja tiene que ensancharse con el coseno del paralelo.
    const este = {
      latitud: VALENCIA.latitud,
      longitud: VALENCIA.longitud + 99 / (111.32 * Math.cos((VALENCIA.latitud * Math.PI) / 180)),
    };
    expect(distanciaKm(VALENCIA, este)).toBeLessThan(100);
    expect(dentro(este)).toBe(true);
  });

  it("en latitud mide lo mismo en todas partes; en longitud se ensancha hacia los polos", () => {
    const ecuador = cajaDeRadio({ latitud: 0, longitud: 0 }, 100);
    const norte = cajaDeRadio({ latitud: 60, longitud: 0 }, 100);
    expect(norte.latMax - norte.latMin).toBeCloseTo(ecuador.latMax - ecuador.latMin, 6);
    expect(norte.lonMax - norte.lonMin).toBeGreaterThan(1.9 * (ecuador.lonMax - ecuador.lonMin));
  });

  it("no se sale de [-90, 90] × [-180, 180]", () => {
    const c = cajaDeRadio({ latitud: 89.9, longitud: 179.9 }, 100);
    expect(c.latMax).toBeLessThanOrEqual(90);
    expect(c.lonMax).toBeLessThanOrEqual(180);
    expect(c.lonMin).toBeGreaterThanOrEqual(-180);
  });
});

describe("zonasDe", () => {
  it("de lo más concreto a lo más amplio, y siempre la global", () => {
    expect(zonasDe({ paisIso: "ES", estadoCodigo: "ES.60", ciudadId: 2509954 })).toEqual([
      { nivel: "CIUDAD", zona: "2509954" },
      { nivel: "ESTADO", zona: "ES.60" },
      { nivel: "PAIS", zona: "ES" },
      { nivel: "GLOBAL", zona: "*" },
    ]);
  });

  it("sin ubicación, solo la global (también ve publicidad global)", () => {
    expect(zonasDe(UBICACION_DESCONOCIDA)).toEqual([{ nivel: "GLOBAL", zona: "*" }]);
  });

  it("con solo el país, país y global", () => {
    expect(zonasDe({ paisIso: "CO", estadoCodigo: null, ciudadId: null })).toEqual([
      { nivel: "PAIS", zona: "CO" },
      { nivel: "GLOBAL", zona: "*" },
    ]);
  });
});

describe("mediana", () => {
  it("sin datos es null, no 0: «no sabemos» no es «nadie»", () => {
    expect(mediana([])).toBeNull();
  });
  it("impar: la central; par: la media de las dos centrales, redondeada a la BAJA", () => {
    expect(mediana([5, 1, 9])).toBe(5);
    expect(mediana([10, 1, 4, 7])).toBe(5); // (4 + 7) / 2 = 5,5 -> 5
    expect(mediana([0, 0, 1000])).toBe(0); // un día raro no mueve la cifra
  });
  it("no reordena la entrada", () => {
    const v = [3, 1, 2];
    mediana(v);
    expect(v).toEqual([3, 1, 2]);
  });
});
