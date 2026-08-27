/**
 * POOL de conexiones a MariaDB. Fija los invariantes del arreglo del cuello de botella: con el pool en
 * 5, un pico de navegacion (cada ruta del shell consulta la BD en su layout, y Next dispara muchas
 * peticiones `_rsc` a la vez) lo agotaba y la siguiente peticion que necesitaba BD se quedaba esperando
 * hasta el `acquireTimeout` POR DEFECTO del driver: 10 s, que se leen como un cuelgue.
 *
 * Estos tests no miden rendimiento (eso no se hace en un unitario): fijan las tres PROPIEDADES que se
 * pueden perder en silencio si alguien "limpia" la configuracion del pool.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DB_ACQUIRE_TIMEOUT_DRIVER_DEFECTO_MS,
  DB_ACQUIRE_TIMEOUT_MS,
  DB_CONNECTION_LIMIT_DEFECTO,
  DB_MINIMUM_IDLE,
  MARIADB_MAX_CONNECTIONS_DEFECTO,
} from "../src/config/constants";

/** Procesos con pool propio contra la MISMA MariaDB: el servicio `web` y el `worker`. */
const PROCESOS_CON_POOL = 2;
/**
 * Conexiones que hay que dejar libres para lo que NO es un pool de la app: el one-off de migraciones,
 * una consola de administracion y el margen que MariaDB se reserva para el usuario root.
 */
const RESERVA_FUERA_DE_LOS_POOLS = 10;

describe("tamano del pool", () => {
  it("deja MUCHO margen frente a max_connections de MariaDB", () => {
    const maximoQueAbririaLaApp = DB_CONNECTION_LIMIT_DEFECTO * PROCESOS_CON_POOL;

    expect(maximoQueAbririaLaApp + RESERVA_FUERA_DE_LOS_POOLS).toBeLessThan(
      MARIADB_MAX_CONNECTIONS_DEFECTO,
    );
    // Y con holgura de sobra, no rozando el techo: menos de la mitad del limite.
    expect(maximoQueAbririaLaApp).toBeLessThan(MARIADB_MAX_CONNECTIONS_DEFECTO / 2);
  });

  it("es lo bastante grande para absorber una tormenta de prefetch RSC", () => {
    // Cada render de una ruta del shell hace 2 consultas (sesion + cuenta de la barra) y Next lanza
    // varias `_rsc` a la vez al navegar. Con 5 no daba abasto; por debajo de 10 volveria el problema.
    expect(DB_CONNECTION_LIMIT_DEFECTO).toBeGreaterThanOrEqual(10);
  });

  it("no mantiene abierto todo el pool en reposo (y asi contar conexiones vuelve a informar)", () => {
    // El driver, sin decirle nada, usa minimumIdle = connectionLimit: un `SHOW PROCESSLIST` devolveria
    // el maximo del pool tanto dormido como saturado, y el conteo no distinguiria un caso del otro.
    expect(DB_MINIMUM_IDLE).toBeLessThan(DB_CONNECTION_LIMIT_DEFECTO);
    expect(DB_MINIMUM_IDLE).toBeGreaterThanOrEqual(1); // algo caliente, para no pagar el handshake siempre
  });
});

describe("espera por una conexion", () => {
  it("se rinde ANTES que el default del driver (un fallo visible, no un cuelgue)", () => {
    // Esta es la propiedad que se pierde sola si alguien borra la opcion: volveria a 10 s en silencio.
    expect(DB_ACQUIRE_TIMEOUT_MS).toBeLessThan(DB_ACQUIRE_TIMEOUT_DRIVER_DEFECTO_MS);
  });

  it("pero da margen a un pico normal (no aborta una consulta legitima)", () => {
    expect(DB_ACQUIRE_TIMEOUT_MS).toBeGreaterThanOrEqual(3_000);
  });
});

/**
 * ESTRUCTURAL: las tres opciones tienen que llegar de VERDAD al adaptador. Un test sobre las
 * constantes solo prueba que los numeros son sanos; si nadie se los pasa a `PrismaMariaDb`, el pool
 * seguiria con los defaults del driver y los tests de arriba pasarian igual sin arreglar nada.
 */
describe("las opciones llegan al adaptador", () => {
  const CLIENTE = readFileSync(
    join(process.cwd(), "src", "server", "db", "client.ts"),
    "utf8",
  ).replace(/^\s*\/\/.*$/gm, "");

  it("el pool se dimensiona con la variable de entorno (afinable sin recompilar)", () => {
    expect(CLIENTE).toMatch(/connectionLimit:\s*env\.DB_CONNECTION_LIMIT/);
  });

  it("acquireTimeout y minimumIdle se pasan EXPLICITOS", () => {
    expect(CLIENTE).toMatch(/acquireTimeout:\s*DB_ACQUIRE_TIMEOUT_MS/);
    expect(CLIENTE).toMatch(/minimumIdle:\s*DB_MINIMUM_IDLE/);
  });
});
