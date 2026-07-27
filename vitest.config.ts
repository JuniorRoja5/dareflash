import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

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
    // Los tests comparten la BD de tests: los ficheros NO corren en paralelo entre
    // si (dentro de cada test si hay concurrencia real de operaciones).
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
