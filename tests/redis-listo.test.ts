/**
 * EL WORKER NO EMPIEZA A USAR REDIS ANTES DE QUE LA CONEXIÓN ESTÉ LISTA (Fase 11 · worker vigilado).
 *
 * El 19 nov, al arrancar, el aforo y las cifras de publicidad fallaron con «(Error)». Reproducido: con
 * las opciones de `getRedis()` (`lazyConnect`, sin cola offline), la PRIMERA orden abre la conexión y
 * se rechaza al instante mientras está `connecting`; medio segundo después funciona. Pasa en CADA
 * arranque, esté Redis listo o no. El arreglo, en un sitio: `esperarRedisListo()`, que el worker espera
 * una vez antes de su primera pasada.
 *
 * Sin un Redis de verdad (CI no lo tiene): un servidor RESP mínimo en el propio test, que responde a
 * lo que ioredis pregunta al conectar (INFO) y a HGETALL, que es lo que usan esas tareas.
 *
 * Para romperlo a propósito: que `esperarRedisListo` no abra la conexión (rojo: la primera orden
 * vuelve a fallar); quitar el `await esperarRedisListo()` del worker (rojo, estructural); quitar el
 * `latido:` del `bucleWorker` de `scripts/worker.ts` (rojo, estructural: es opcional y compila igual).
 */
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:net";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { sinComentarios } from "./helpers/grafo-imports";

const H = vi.hoisted(() => ({ url: "" }));
vi.mock("@/config/env", () => ({
  env: {
    get REDIS_URL() {
      return H.url;
    },
  },
}));

/** Un Redis de juguete: entiende arrays RESP y contesta INFO, HGETALL y lo demás con +OK. */
function redisDeJuguete(): Server {
  return createServer((socket) => {
    let buf = "";
    socket.on("data", (d) => {
      buf += d.toString("utf8");
      for (;;) {
        // `*N\r\n` y N veces `$len\r\n<dato>\r\n`. Si no está entera, se espera a más datos.
        const m = /^\*(\d+)\r\n/.exec(buf);
        if (!m) return;
        let i = m[0].length;
        const partes: string[] = [];
        for (let k = 0; k < Number(m[1]); k++) {
          const l = /^\$(\d+)\r\n/.exec(buf.slice(i));
          if (!l) return;
          const ini = i + l[0].length;
          if (buf.length < ini + Number(l[1]) + 2) return;
          partes.push(buf.slice(ini, ini + Number(l[1])));
          i = ini + Number(l[1]) + 2;
        }
        buf = buf.slice(i);
        const orden = (partes[0] ?? "").toUpperCase();
        if (orden === "INFO") {
          const info = "# Server\r\nredis_version:7.0.0\r\nloading:0\r\n";
          socket.write(`$${Buffer.byteLength(info)}\r\n${info}\r\n`);
        } else if (orden === "HGETALL") socket.write("*0\r\n");
        else socket.write("+OK\r\n");
      }
    });
  });
}

let servidor: Server;

beforeAll(async () => {
  servidor = redisDeJuguete();
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => r()));
  const dir = servidor.address();
  if (!dir || typeof dir === "string") throw new Error("sin puerto");
  H.url = `redis://127.0.0.1:${dir.port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => servidor.close(() => r()));
});
beforeEach(() => {
  // `getRedis` memoiza la conexión en el módulo: cada caso, con un módulo (y una conexión) nuevo.
  vi.resetModules();
});

const modulo = () => import("../src/server/cache/redis");

describe("la primera orden tras arrancar", () => {
  it("control: SIN esperar, la primera orden falla (lo que pasaba en cada arranque)", async () => {
    // Si esto dejara de fallar, el caso de abajo pasaría sin probar nada.
    const { getRedis } = await modulo();
    const r = getRedis()!;
    await expect(r.hgetall("aforo")).rejects.toThrow(/enableOfflineQueue/);
    r.disconnect();
  });

  it("CON `esperarRedisListo`, la primera orden ya funciona", async () => {
    const { getRedis, esperarRedisListo } = await modulo();
    expect(await esperarRedisListo(3_000)).toBe(true);
    await expect(getRedis()!.hgetall("aforo")).resolves.toEqual({});
    getRedis()!.disconnect();
  });

  it("sin Redis configurado, dice `false` y no lanza (cada tarea degrada como siempre)", async () => {
    const antes = H.url;
    H.url = "";
    try {
      const { esperarRedisListo } = await modulo();
      expect(await esperarRedisListo(500)).toBe(false);
    } finally {
      H.url = antes;
    }
  });

  it("y con Redis caído, dice `false` dentro del tope en vez de colgarse", async () => {
    const antes = H.url;
    H.url = "redis://127.0.0.1:1"; // nadie escucha
    try {
      const { esperarRedisListo, getRedis } = await modulo();
      const t0 = Date.now();
      expect(await esperarRedisListo(800)).toBe(false);
      expect(Date.now() - t0).toBeLessThan(3_000);
      getRedis()?.disconnect();
    } finally {
      H.url = antes;
    }
  });
});

describe("el worker lo espera antes de su primera pasada (estructural)", () => {
  it("`scripts/worker.ts` hace `await esperarRedisListo()` ANTES de `bucleWorker`", () => {
    const codigo = sinComentarios(
      readFileSync(path.resolve(__dirname, "../scripts/worker.ts"), "utf8"),
    );
    const espera = codigo.search(/await esperarRedisListo\(/);
    const bucle = codigo.search(/await bucleWorker\(/);
    expect(espera, "el worker ya no espera a Redis").toBeGreaterThan(-1);
    expect(bucle).toBeGreaterThan(-1);
    expect(espera, "espera a Redis DESPUÉS de empezar el bucle").toBeLessThan(bucle);
  });

  it("y el `bucleWorker` que arranca recibe `latido`, que anota el latido de verdad", () => {
    // `latido` es OPCIONAL en `OpcionesBucle` (como el resto del mantenimiento: los tests pasan solo
    // lo que usan). Si alguien lo quita de aquí, compila, la suite sigue verde, y solo lo descubre
    // `deploy.sh` EN PRODUCCIÓN, sin latido que esperar. Esto lo caza antes.
    const codigo = sinComentarios(
      readFileSync(path.resolve(__dirname, "../scripts/worker.ts"), "utf8"),
    );
    const inicio = codigo.search(/await bucleWorker\(prisma, registro, \{/);
    expect(inicio, "no se encontró la llamada a bucleWorker").toBeGreaterThan(-1);
    // El objeto de opciones, casando llaves (no hasta el primer `}`: dentro hay funciones).
    const abre = codigo.indexOf("{", inicio);
    let nivel = 0;
    let fin = abre;
    for (; fin < codigo.length; fin++) {
      if (codigo[fin] === "{") nivel++;
      else if (codigo[fin] === "}" && --nivel === 0) break;
    }
    const opciones = codigo.slice(abre, fin + 1);
    expect(opciones, "el worker ya no late: falta `latido:` en bucleWorker").toMatch(
      /\blatido:\s*\(now\)\s*=>\s*anotarLatido\(/,
    );
  });
});
