import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { NUM_WORKER_DBS } from "./tests/helpers/workers";

export default defineConfig({
  resolve: {
    alias: {
      // Mismo alias que tsconfig: `@/*` -> `src/*`.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` no existe fuera de RSC: en tests se aliasa a un stub vacio.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // AISLAMIENTO POR WORKER: el globalSetup crea/migra una BD por worker (`dareflash_test_<POOL_ID>`)
    // y cada test la usa (ver tests/helpers/db.ts). Antes se compartía UNA BD con `fileParallelism:false`
    // -> contaminación cruzada y flakiness. Ahora cada worker tiene la suya y se REACTIVA el paralelismo.
    globalSetup: ["./tests/global-setup.ts"],
    // `forks` (proceso propio por worker): aísla `process.env` y `globalThis`, necesario para los
    // meta-tests db-client que MUTAN process.env.DATABASE_URL y cachean el singleton en globalThis.
    // maxWorkers = NUM_WORKER_DBS -> VITEST_POOL_ID va 1..N y cada uno tiene su BD provisionada.
    pool: "forks",
    maxWorkers: NUM_WORKER_DBS,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
