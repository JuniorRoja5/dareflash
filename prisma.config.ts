// Configuracion del CLI de Prisma 7 (migraciones, generate, studio).
//
// Ojo: esto es config del CLI, que corre FUERA de la app. No pasa por
// `src/config/env.ts` (que es `server-only` y valida el entorno de la app).
// Aqui cargamos `.env` con dotenv, que es la via sancionada por Prisma, y es la
// unica excepcion a "nadie lee process.env fuera de env.ts": este archivo no
// forma parte del runtime de la aplicacion.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Solo para el CLI (migrate, studio). El runtime usa el driver adapter.
    url: process.env["DATABASE_URL"],
  },
});
