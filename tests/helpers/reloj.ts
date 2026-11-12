/**
 * EL RELOJ QUIETO para los tests que llenan un cubo de rate-limit REAL y luego miran si corta.
 *
 * POR QUÉ EXISTE (fallo real, CI de main en `f4a45ce`): `rateLimit` cuenta por VENTANA FIJA alineada
 * al reloj (`floor(ahora / windowMs)`). `buscar-endpoint` metía 60 llamadas seguidas en la ventana de
 * un minuto y después llamaba a la ruta esperando 429. En CI el fichero corrió de 15:56:58.8 a
 * 15:57:00.5: el cubo se llenó en la ventana de las 15:56 y la llamada de la ruta cayó en la de las
 * 15:57, vacía → 200. En local y en la rama había pasado (no cruzó ningún `:00`). Probabilidad ≈
 * duración / ventana: con un minuto y una BD de CI lenta, ~1 de cada 40 ejecuciones; con ventanas de
 * una hora o un día es más raro, y por eso más traicionero.
 *
 * Congelar SOLO `Date` (no los temporizadores: el driver de MariaDB y vitest los necesitan vivos) en
 * un instante LEJOS DE TODO BORDE —mitad de minuto, de hora y de día UTC— hace que todas las llamadas
 * caigan en la MISMA ventana, sea cual sea la ventana y lo lenta que vaya la máquina.
 *
 * Se llama DENTRO del `it` (o en su `beforeEach`) y se deshace con `soltarReloj()` en `afterEach`.
 * `tests/reloj-rate-limit.test.ts` exige que todo test que lleva una ruta real hasta el 429 lo use.
 */
import { vi } from "vitest";

/** 12:30:30.500 UTC: a medio minuto, a media hora y a medio día de cualquier borde de ventana. */
export const LEJOS_DE_LOS_BORDES = new Date("2026-06-15T12:30:30.500Z");

export function congelarReloj(en: Date = LEJOS_DE_LOS_BORDES): void {
  vi.useFakeTimers({ toFake: ["Date"], now: en });
}

export function soltarReloj(): void {
  vi.useRealTimers();
}
