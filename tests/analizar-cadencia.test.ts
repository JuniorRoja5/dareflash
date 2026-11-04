/**
 * CUÁNDO SE RECALCULAN LAS ESTADÍSTICAS DEL FEED. Puro, sin base de datos.
 *
 * El `ANALYZE … PERSISTENT FOR ALL` recorre la tabla entera. Con el volumen sembrado son ~300 ms
 * entre las cuatro tablas y no se apreció bloqueo de escrituras, pero el coste crece con las filas
 * y la máquina tiene UN núcleo compartido: no es trabajo para la hora punta. De ahí las dos
 * decisiones que este fichero ata, porque las dos se pueden deshacer sin que nada falle:
 *
 *  - LA HORA es la del valle en España, y se calcula en `Europe/Madrid`, no en UTC. Con un
 *    desplazamiento fijo, medio año "las 4" serían las 3 o las 5 — justo fuera de la ventana.
 *  - SE COMPARA EL DÍA, no un intervalo de 24 h. Con un intervalo, cada reinicio del worker
 *    volvería a disparar el análisis, y un día con tres despliegues serían tres escaneos.
 */
import { describe, expect, it } from "vitest";

import { diaYHoraEnMadrid, tocaAnalizar } from "../src/server/jobs/analizar-tablas";

/** Un instante UTC cualquiera. */
const utc = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min));

describe("la hora se lee en España, no en UTC", () => {
  it("en INVIERNO (UTC+1): las 03:00 UTC son las 04:00 en Madrid", () => {
    expect(diaYHoraEnMadrid(utc(2026, 1, 15, 3))).toEqual({ dia: "2026-01-15", hora: 4 });
  });

  it("en VERANO (UTC+2): las 02:00 UTC son las 04:00 en Madrid", () => {
    // Con un desplazamiento fijo de +1 esto daría las 3 y el análisis no correría en todo el
    // verano. Es el fallo que justifica usar `Intl` y no aritmética.
    expect(diaYHoraEnMadrid(utc(2026, 7, 15, 2))).toEqual({ dia: "2026-07-15", hora: 4 });
  });

  it("y el DÍA también es el de Madrid: las 23:30 UTC ya son el día siguiente", () => {
    expect(diaYHoraEnMadrid(utc(2026, 7, 15, 23, 30)).dia).toBe("2026-07-16");
  });
});

describe("cuándo toca", () => {
  it("a las 4 de la madrugada y no hecho hoy: SÍ", () => {
    expect(tocaAnalizar(utc(2026, 1, 15, 3), null)).toBe(true);
    expect(tocaAnalizar(utc(2026, 1, 15, 3), "2026-01-14")).toBe(true);
  });

  it("a cualquier otra hora: NO, aunque no se haya hecho nunca", () => {
    for (const h of [0, 2, 5, 10, 14, 20, 23]) {
      expect(tocaAnalizar(utc(2026, 1, 15, h), null), `hora UTC ${h}`).toBe(false);
    }
  });

  it("ya hecho hoy: NO, aunque el worker se reinicie dentro de la ventana", () => {
    // Tres despliegues en una madrugada serían tres escaneos sin esto.
    expect(tocaAnalizar(utc(2026, 1, 15, 3), "2026-01-15")).toBe(false);
    expect(tocaAnalizar(utc(2026, 1, 15, 3, 59), "2026-01-15")).toBe(false);
  });

  it("al día siguiente vuelve a tocar", () => {
    expect(tocaAnalizar(utc(2026, 1, 16, 3), "2026-01-15")).toBe(true);
  });

  it("en verano toca a la hora de verano, no una hora antes", () => {
    // Si la ventana se calculara en UTC, en verano se dispararía a las 05:00 locales.
    expect(tocaAnalizar(utc(2026, 7, 15, 2), null)).toBe(true);
    expect(tocaAnalizar(utc(2026, 7, 15, 3), null)).toBe(false);
  });
});
