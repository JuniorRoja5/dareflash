/**
 * LLAMAR AL FORMATEADOR SIN IDIOMA O SIN ZONA NO COMPILA (Fase 11 · P1).
 *
 * Este diente lo comprueba `tsc` (`npm run typecheck`, en el pre-commit), no vitest: cada línea marcada
 * con `@ts-expect-error` TIENE que ser un error de tipos. Si alguien vuelve a hacer opcional el idioma o
 * la zona —o acepta un string cualquiera como zona—, la llamada compila, el `@ts-expect-error` queda
 * sin error que tapar, y `tsc` falla con «Unused '@ts-expect-error' directive».
 *
 * Las llamadas van en una función que NUNCA se ejecuta: aquí solo importa si compilan.
 */
import { describe, expect, it } from "vitest";

import {
  formatearDiaClave,
  formatearFecha,
  formatearFechaParaQuienMira,
  formatearImporte,
  formatearMarcador,
  formatearNumero,
  horaDelReinicioDiario,
  ZONA_UTC,
} from "../src/lib/formato";

function nuncaSeEjecuta(): void {
  const ahora = new Date();
  // @ts-expect-error — sin idioma
  formatearNumero(1);
  // @ts-expect-error — sin idioma
  formatearMarcador(1);
  // @ts-expect-error — sin idioma
  formatearImporte(100);
  // @ts-expect-error — sin idioma ni zona
  formatearFecha(ahora);
  // @ts-expect-error — sin zona
  formatearFecha(ahora, "es");
  // @ts-expect-error — sin estilo
  formatearFecha(ahora, "es", ZONA_UTC);
  // @ts-expect-error — una zona tiene que estar VALIDADA (`zonaHoraria`): un string suelto no vale
  formatearFecha(ahora, "es", "Europe/Madrid", "diaMes");
  // @ts-expect-error — un idioma que la app no habla
  formatearFecha(ahora, "fr", ZONA_UTC, "diaMes");
  // @ts-expect-error — la variante para quien mira también pide la zona (aunque admita `null`)
  formatearFechaParaQuienMira(ahora, "es");
  // @ts-expect-error — la hora SOLA no tiene versión sin hora: sin zona no habría nada que enseñar
  formatearFechaParaQuienMira(ahora, "es", null, "hora");
  // @ts-expect-error — una clave de día no tiene hora
  formatearDiaClave("2026-11-07", "es", "hora");
  // @ts-expect-error — sin zona
  horaDelReinicioDiario(ahora, "es");
}

describe("el formateador exige idioma y zona", () => {
  it("lo vigila `tsc` (ver la cabecera); aquí solo consta que el fichero existe y no se ejecuta", () => {
    expect(typeof nuncaSeEjecuta).toBe("function");
  });
});
