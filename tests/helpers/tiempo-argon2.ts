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
 *
 * ┌─ Y SE MIDE LO QUE AÑADE EL HASH, NO LA DIFERENCIA ENTERA (`excesoDelHash`) ───────────────────┐
 * │ Medido: con el hash SUSTITUIDO por uno instantáneo, los dos caminos ya se separan (el alta    │
 * │ nueva escribe más en la base de datos que el aviso de cuenta existente). En el alta de        │
 * │ empresa, con carga, esa separación de base llegaba a 0,65·H: rojos falsos que no tenían nada  │
 * │ que ver con el argon2. Así que se mide en la MISMA ejecución con el hash real y con el         │
 * │ instantáneo, alternando, y se compara la DIFERENCIA de las dos separaciones con `H/2`: con el │
 * │ hash en los dos caminos es ~0; con la versión rota (un camino sin hash) es ~H.                │
 * │ La separación de base es un RIESGO RESIDUAL ACEPTADO (decisión del analista, 19 nov): ver el   │
 * │ docblock de los dos tests.                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CORREN SOLOS (PTA2): estos tests van en el proyecto `tiempo` de vitest, un worker y detrás de todo lo
 * demás (ver `tests-de-tiempo.ts`). Un fichero nuevo que importe este helper va en esa lista.
 *
 * SI FALLA EN LOCAL: repetirlo SOLO (`npx vitest run --project tiempo`).
 *  - Si solo pasa, fue un parón de la máquina (otro proceso, el antivirus, un build): medido en la PTA2,
 *    los fallos sueltos en local eran del tamaño de un argon2 entero, no ruido de la suite. No se
 *    persigue desde los tests.
 *  - Si también falla solo, es una REGRESIÓN: algún camino ha dejado de pagar el hash (o lo paga dos
 *    veces). Se mira, empezando por `argon2-antes-de-mirar`. Nunca se sube el umbral ni se reintenta.
 *
 * EL MARGEN, MEDIBLE: con `TIEMPO_ARGON2_REGISTRO=<fichero>` en el entorno, cada medición añade una línea
 * JSON (test, `H`, exceso y las dos separaciones). Apagado por defecto; no cambia lo que se mide. Con
 * él se sacó la tabla de la PTA2: |exceso|/(H/2) del caso sano (cuanto más lejos de 1, mejor) y de la
 * versión rota (tiene que pasar de 1).
 */
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { expect } from "vitest";

import { hashPassword } from "../../src/server/auth/password";
import { contrasenaFalsa } from "./valores-falsos";

/** Apunta una medición si `TIEMPO_ARGON2_REGISTRO` lo pide (ver la cabecera). */
function apuntar(datos: Record<string, number>): void {
  const fichero = process.env["TIEMPO_ARGON2_REGISTRO"];
  if (!fichero) return;
  const linea = { t: Date.now(), test: expect.getState().currentTestName, ...datos };
  appendFileSync(fichero, `${JSON.stringify(linea)}\n`);
}

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
  const H = mediana(t);
  apuntar({ H });
  return H;
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

/**
 * LO QUE AÑADE EL HASH a la separación entre caminos (ver la cabecera). En la MISMA ejecución mide
 * pares con el hash REAL y pares con el hash INSTANTÁNEO, alternando el modo en cada vuelta para que
 * la deriva de la máquina caiga en los dos por igual, y devuelve la diferencia entre las dos
 * separaciones (con signo: nuevo − existente). Con el argon2 pagado en los dos caminos, ~0; con un
 * camino que no lo paga, ~H.
 *
 * `hashReal(activo)` lo da el test: es el interruptor de su `vi.mock` de `@/server/auth/password`
 * (el real o uno instantáneo). Al acabar SIEMPRE se deja en real, aunque algo lance.
 */
export async function excesoDelHash(opciones: {
  existente: () => Promise<unknown>;
  nuevo: (i: number) => Promise<unknown>;
  hashReal: (activo: boolean) => void;
  pares?: number;
}): Promise<{ exceso: number; separacionReal: number; separacionBase: number }> {
  const { existente, nuevo, hashReal, pares = PARES } = opciones;
  const t = {
    real: { e: [] as number[], n: [] as number[] },
    base: { e: [] as number[], n: [] as number[] },
  };
  const medir = async (f: () => Promise<unknown>) => {
    const t0 = performance.now();
    await f();
    return performance.now() - t0;
  };
  try {
    for (let i = 0; i <= pares; i++) {
      const modos = i % 2 === 0 ? (["real", "base"] as const) : (["base", "real"] as const);
      for (const modo of modos) {
        hashReal(modo === "real");
        const k = i * 2 + (modo === "real" ? 0 : 1); // un correo distinto por alta
        let e: number;
        let n: number;
        if ((i + (modo === "real" ? 0 : 1)) % 2 === 0) {
          e = await medir(existente);
          n = await medir(() => nuevo(k));
        } else {
          n = await medir(() => nuevo(k));
          e = await medir(existente);
        }
        if (i === 0) continue; // calentamiento
        t[modo].e.push(e);
        t[modo].n.push(n);
      }
    }
  } finally {
    hashReal(true);
  }
  const separacionReal = mediana(t.real.n) - mediana(t.real.e);
  const separacionBase = mediana(t.base.n) - mediana(t.base.e);
  const exceso = separacionReal - separacionBase;
  apuntar({ exceso, separacionReal, separacionBase });
  return { exceso, separacionReal, separacionBase };
}
