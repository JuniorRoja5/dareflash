import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { NUM_WORKER_DBS } from "./tests/helpers/workers";

/** Mismos alias que tsconfig, compartidos por los dos proyectos (uno solo los tendría a medias). */
const alias = {
  // `@/*` -> `src/*`.
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` no existe fuera de RSC: en tests se aliasa a un stub vacio.
  "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
};

/**
 * DOS PROYECTOS, porque son dos clases de test con necesidades opuestas:
 *
 *  - `node`: lo de siempre. Toca la base de datos, una BD por worker, `globalSetup` que las provisiona.
 *  - `render`: componentes en jsdom. NO necesita base de datos —montar una para renderizar un <ul> es
 *    puro coste— ni el globalSetup, y sí necesita un DOM, que en el proyecto `node` no existe.
 *
 * Antes esto era una sola configuración `environment: "node"`, así que un test de render sencillamente
 * no se podía escribir: varios fallos de maqueta se colaron por no tener dónde ponerlos.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          // AISLAMIENTO POR WORKER: el globalSetup crea/migra una BD por worker
          // (`dareflash_test_<POOL_ID>`) y cada test la usa (ver tests/helpers/db.ts). Antes se
          // compartía UNA BD con `fileParallelism:false` -> contaminación cruzada y flakiness. Ahora
          // cada worker tiene la suya y se REACTIVA el paralelismo.
          globalSetup: ["./tests/global-setup.ts"],
          // `forks` (proceso propio por worker): aísla `process.env` y `globalThis`, necesario para
          // los meta-tests db-client que MUTAN process.env.DATABASE_URL y cachean en globalThis.
          // maxWorkers = NUM_WORKER_DBS -> VITEST_POOL_ID va 1..N y cada uno tiene su BD.
          pool: "forks",
          maxWorkers: NUM_WORKER_DBS,
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // Vitest EXIGE un `groupOrder` distinto por proyecto cuando difieren en `maxWorkers`: sin
          // esto no arranca ninguno de los dos ("no tests", que se lee como suite vacía en verde).
          // Los grupos corren en serie entre sí, y `render` va después porque es el rápido: así el
          // fallo caro (base de datos) aparece antes.
          sequence: { groupOrder: 0 },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "render",
          environment: "jsdom",
          include: ["tests/render/**/*.test.tsx"],
          setupFiles: ["./tests/render/setup.ts"],
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
