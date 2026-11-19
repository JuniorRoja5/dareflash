/**
 * MEDIR SI DOS CAMINOS TARDAN LO MISMO, CON RUIDO (Fase 11 · PTA). Lo usan los dos tests de tiempo
 * de argon2 (`registration`, `registro-cuenta-existente`), que son la SEGUNDA red del invariante «el
 * argon2 se paga siempre»; la primera, sin reloj, es `argon2-antes-de-mirar`.
 *
 * Por qué así, y no como antes (medido con la máquina cargada, 20 pasadas por test):
 *  - LA REFERENCIA `H` era UN solo hash. Con carga, un hash suelto salía entre 95 y 370 ms; si salía
 *    bajo, el umbral (`H/2`) encogía con él y saltaba un rojo falso. Ahora es la MEDIANA de varios.
 *  - LAS MUESTRAS eran 6 pares, siempre en el mismo orden (existente y luego nuevo). Pocas, y con el
 *    orden fijo, cualquier deriva de la máquina caía siempre en el mismo lado. Ahora son más, el orden
 *    se ALTERNA en cada par y el primero se descarta: el primer par paga calentamientos (conexiones,
 *    JIT, cachés) que no son del camino que se mide.
 *  - El UMBRAL no se toca: `H/2`. Lo que cambia es que `H` y las medianas se miden mejor.
 */
import { performance } from "node:perf_hooks";

import { hashPassword } from "../../src/server/auth/password";
import { contrasenaFalsa } from "./valores-falsos";

export function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Cuántos hashes forman la referencia, y cuántos pares de muestras se miden (más el de calentar). */
export const HASHES_REFERENCIA = 5;
export const PARES = 12;

/** El coste de UN argon2: la mediana de varios, tras calentar el módulo nativo. */
export async function costeArgon2(): Promise<number> {
  await hashPassword(contrasenaFalsa("calentar")); // el primero paga la inicialización
  const t: number[] = [];
  for (let i = 0; i < HASHES_REFERENCIA; i++) {
    const t0 = performance.now();
    await hashPassword(contrasenaFalsa(`medir-coste-${i}`));
    t.push(performance.now() - t0);
  }
  return mediana(t);
}

/**
 * Mide `pares` veces cada camino, INTERCALADOS y alternando cuál va primero, descarta el primer par
 * (calentamiento) y devuelve la diferencia absoluta entre las medianas. `nuevo(i)` recibe el número
 * de muestra para que cada alta use un correo distinto.
 */
export async function separacionDeMedianas(
  existente: () => Promise<unknown>,
  nuevo: (i: number) => Promise<unknown>,
  pares = PARES,
): Promise<{ separacion: number; medianaExistente: number; medianaNuevo: number }> {
  const tExiste: number[] = [];
  const tNuevo: number[] = [];
  const medir = async (f: () => Promise<unknown>) => {
    const t0 = performance.now();
    await f();
    return performance.now() - t0;
  };
  for (let i = 0; i <= pares; i++) {
    let e: number;
    let n: number;
    if (i % 2 === 0) {
      e = await medir(existente);
      n = await medir(() => nuevo(i));
    } else {
      n = await medir(() => nuevo(i));
      e = await medir(existente);
    }
    if (i === 0) continue; // calentamiento
    tExiste.push(e);
    tNuevo.push(n);
  }
  const medianaExistente = mediana(tExiste);
  const medianaNuevo = mediana(tNuevo);
  return {
    separacion: Math.abs(medianaNuevo - medianaExistente),
    medianaExistente,
    medianaNuevo,
  };
}
