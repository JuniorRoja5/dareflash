/**
 * Hash y verificacion de contrasenas con Argon2id (verificado en el hosting de Hostinger).
 *
 * Recibe/develve strings; no toca la BD. Testeable desde Node y usable desde el script CLI del
 * admin, por eso NO lleva `import "server-only"` (no guarda secretos; basta la convencion de que
 * nada bajo src/server/** se importa desde el cliente).
 *
 * PARAMETROS Y SEMAFORO medidos en el VPS de produccion (1 vCPU AMD EPYC, sin swap): ver
 * `ARGON2_PARAMS` y `Semaforo` abajo. No se ponen "a ojo".
 */
import { AsyncLocalStorage } from "node:async_hooks";

import argon2 from "argon2";

import { ARGON2_MAX_CONCURRENT, ARGON2_MAX_WAIT_MS } from "@/config/constants";

/**
 * Parametros de Argon2id — UNA sola fuente, compartida por `hashPassword` y `DUMMY_HASH`.
 *
 * `parallelism: 1` medido en el VPS (1 vCPU): mas rapido que p=4 (178 vs 195 ms) y sobre todo
 * mas PREDECIBLE (5 ms de dispersion frente a 37 ms). La paridad de tiempo anti-enumeracion se
 * apoya en esa predecibilidad: 37 ms es margen donde una señal puede esconderse.
 *
 * `memoryCost` NO se sube para compensar la bajada de parallelism: la maquina NO tiene swap, y
 * 64 MB x 4 en vuelo ya son ~270 MB junto a MariaDB/Next/worker/Caddy. 64 MB es la recomendacion
 * estandar y es solido.
 *
 * Fijar los tres EXPLICITOS (no los defaults de la libreria) evita que una actualizacion de la
 * dependencia mueva el coste —y con el la paridad de tiempo— en silencio. Un test verifica que
 * `DUMMY_HASH` lleva EXACTAMENTE estos parametros.
 */
export const ARGON2_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

/**
 * Hash ficticio generado con `ARGON2_PARAMS` (p=1) para la verificacion TIMING-SAFE del login:
 * cuando el usuario NO existe se verifica igualmente contra este hash para que la respuesta tarde
 * lo mismo. DEBE llevar los MISMOS parametros que los hashes reales; si divergen (p.ej. dummy p=1
 * vs hashes p=4 antiguos), reaparece la diferencia de tiempo -> enumeracion. Por eso los hashes
 * viejos se REGRABAN al iniciar sesion (`needsRehash`, en login.ts) y un test ata este dummy a
 * `ARGON2_PARAMS`.
 */
export const DUMMY_HASH =
  "$argon2id$v=19$m=65536,p=1,t=3$HqEWyJFgOXczR6B7x/IOYQ$xlzvGDpJoM76bIZCPtbqHU28JulGXtqxlhw3Mhvmqic";

/**
 * Se lanza cuando el semaforo de Argon2id no da un hueco dentro de `ARGON2_MAX_WAIT_MS`. La ruta
 * la traduce a 503 (servicio ocupado, reintenta), NUNCA a un 500 ni a "contrasena incorrecta".
 */
export class Argon2Sobrecargado extends Error {
  constructor() {
    super("Argon2 sobrecargado: sin hueco de concurrencia a tiempo.");
    this.name = "Argon2Sobrecargado";
  }
}

export function esArgon2Sobrecargado(e: unknown): boolean {
  return e instanceof Argon2Sobrecargado;
}

/**
 * SEMAFORO de concurrencia para Argon2id. En el VPS (1 vCPU) el threadpool de libuv ya limita a
 * ~4 hashes en vuelo, asi que la MEMORIA ya esta acotada (~270 MB). Lo que este semaforo acota es
 * LA ESPERA: sin el, las peticiones se apilarian sin limite ni tope de tiempo (la cola infinita).
 * Con 4 plazas y ~178 ms/hash, superar `ARGON2_MAX_WAIT_MS` (~2 s) implica ~10 en cola: mejor un
 * 503 claro que un login que tarda mas de 2 s. DEGRADA (espera unos ms), no rompe. Es un tope de
 * CONCURRENCIA, no un tope GLOBAL: no deja a todos fuera, solo hace esperar.
 *
 * REENTRANTE: si ya estamos dentro de un hueco de ESTE semaforo (p.ej. `ejecutarConHueco` envuelve
 * el login y dentro se llama a `verifyPassword`/`hashPassword`), NO se re-adquiere — se ejecuta
 * directo. Sin esto, un hash dentro de un hueco pediria un SEGUNDO hueco y podria auto-bloquearse
 * (deadlock). El contexto se lleva con AsyncLocalStorage POR INSTANCIA (`this.enHueco`): "ya estoy
 * dentro de ESTE semaforo", no de ALGUNO. Si el testigo fuera GLOBAL, un SEGUNDO semaforo (p.ej.
 * transcodificar video) usado dentro de un hueco del primero se saltaria su adquisicion EN
 * SILENCIO: proteccion que parece puesta y no protege. Un test lo caza.
 */
export class Semaforo {
  private enVuelo = 0;
  private readonly cola: Array<{ resolver: () => void; timer: ReturnType<typeof setTimeout> }> = [];
  // Testigo de reentrada POR INSTANCIA (ver arriba). NUNCA global: seria una trampa silenciosa.
  private readonly enHueco = new AsyncLocalStorage<true>();

  constructor(
    private readonly max: number,
    private readonly esperaMaxMs: number,
  ) {}

  private adquirir(): Promise<void> {
    if (this.enVuelo < this.max) {
      this.enVuelo += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const entrada = {
        resolver: resolve,
        timer: setTimeout(() => {
          const i = this.cola.indexOf(entrada);
          if (i >= 0) this.cola.splice(i, 1);
          reject(new Argon2Sobrecargado());
        }, this.esperaMaxMs),
      };
      this.cola.push(entrada);
    });
  }

  private liberar(): void {
    const siguiente = this.cola.shift();
    if (siguiente) {
      clearTimeout(siguiente.timer);
      siguiente.resolver(); // el hueco pasa al que espera; enVuelo se mantiene
    } else {
      this.enVuelo -= 1;
    }
  }

  async ejecutar<T>(fn: () => Promise<T>): Promise<T> {
    if (this.enHueco.getStore()) return fn(); // REENTRANTE en ESTE semaforo: no re-adquirir
    await this.adquirir(); // si no hay hueco a tiempo, lanza Argon2Sobrecargado (no se adquiere)
    try {
      return await this.enHueco.run(true, fn);
    } finally {
      this.liberar();
    }
  }
}

const semaforo = new Semaforo(ARGON2_MAX_CONCURRENT, ARGON2_MAX_WAIT_MS);

/**
 * Ejecuta `fn` DENTRO de un hueco del semaforo de argon2. Lo usa el login para meter el consumo
 * del cubo de CUENTA + la verificacion en un MISMO hueco: si el semaforo esta saturado, el 503
 * salta ANTES de consumir el cubo, asi que un 503 NO gasta un intento de la cuenta (el intento se
 * cuenta donde se evalua; no hay refund que mantener). Los `hashPassword`/`verifyPassword` que se
 * llamen dentro son REENTRANTES (no re-adquieren).
 *
 * OJO (anotado a proposito): asi el hueco cubre tambien una CONSULTA A BD (el cubo de cuenta),
 * no solo el argon2. NO es riesgo nuevo: el login ya lee el usuario de la BD, asi que con MariaDB
 * lenta ya estaba degradado; la diferencia es que ahora falla RAPIDO (503 a los ~2 s) en vez de
 * colgarse. El camino de rechazo (cuenta bloqueada, sin hash) suelta el hueco 50-100x mas rapido
 * que el normal (consulta ~ms vs hash ~178 ms) y el semaforo sirve por orden de llegada
 * (`cola.shift`), asi que un legitimo esperando coge el siguiente hueco: no hay inanicion.
 *
 * FILO de la reentrada por contexto asincrono (regla, no deducible leyendo): TODO lo que se lance
 * dentro del hueco DEBE esperarse (`await`). Una tarea disparada SIN await HEREDA el contexto de
 * reentrada y, cuando el hueco ya se ha liberado, correria su argon2 SALTANDOSE el semaforo. Hoy
 * no pasa (todo se espera), pero esto es de uso general: no lances nada sin await aqui dentro.
 */
export function ejecutarConHueco<T>(fn: () => Promise<T>): Promise<T> {
  return semaforo.ejecutar(fn);
}

/** Hashea una contrasena en claro con Argon2id (a traves del semaforo de concurrencia). */
export function hashPassword(plain: string): Promise<string> {
  return semaforo.ejecutar(() => argon2.hash(plain, ARGON2_PARAMS));
}

/**
 * Verifica una contrasena contra su hash (a traves del semaforo). Un hash invalido devuelve
 * false; la SOBRECARGA del semaforo NO es "contrasena mala", se relanza para que la ruta la
 * convierta en 503.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await semaforo.ejecutar(() => argon2.verify(hash, plain));
  } catch (e) {
    if (esArgon2Sobrecargado(e)) throw e;
    return false;
  }
}

/**
 * Verificacion TIMING-SAFE para el login: acepta `hash | null`. Si es null (el usuario no existe
 * o no tiene contrasena), gasta el mismo tiempo verificando contra el hash ficticio y devuelve
 * false. SIEMPRE ejecuta un argon2.verify.
 */
export async function verifyPasswordConstantTime(
  hash: string | null,
  plain: string,
): Promise<boolean> {
  const target = hash ?? DUMMY_HASH;
  const ok = await verifyPassword(target, plain);
  // Si no habia hash real, el resultado nunca es valido (aunque el dummy "coincidiera").
  return hash !== null && ok;
}

/**
 * ¿El hash guardado usa parametros distintos a los ACTUALES (`ARGON2_PARAMS`)? P.ej. un hash p=4
 * antiguo. Si es asi, se REGRABA tras un login correcto (rehasheo oportunista, en login.ts): asi
 * los hashes reales convergen a los mismos parametros que `DUMMY_HASH` y no reaparece el oraculo
 * de tiempo. La libreria lee los parametros del propio hash, asi que verificar uno viejo sigue
 * funcionando; esto solo actualiza el formato.
 */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_PARAMS);
}
