/**
 * TEST DE REGRESION: `next build` debe seguir compilando SIN ninguna variable
 * de entorno configurada.
 *
 * Por que existe: Hostinger compila SIN ninguna variable configurada. Si el
 * build empezara a exigirlas, el despliegue se caeria.
 *
 * Comprobado empiricamente en Next 16.2.11: lo que mantiene el build en verde
 * es que Next **no ejecuta `instrumentation.register()` durante `next build`**.
 * Eso es comportamiento suyo, no un contrato que hayamos fijado nosotros: si una
 * version futura lo cambiara, la validacion de entorno correria al compilar y
 * tumbaria el despliegue. La guarda `PHASE_PRODUCTION_BUILD` de
 * `src/config/startup.ts` cubre parte de ese caso, pero depende de una variable
 * interna de Next (`NEXT_PHASE`, localizada inspeccionando su codigo fuente),
 * no de una API publica.
 *
 * Este test vigila la propiedad de verdad — "el build compila sin variables" —
 * en vez del mecanismo concreto, para que un cambio de Next lo cace el CI y no
 * produccion.
 *
 * Uso: npm run test:build-sin-env
 */
import { spawnSync } from "node:child_process";

// Variables de la app que hay que quitar para simular el entorno de Hostinger,
// donde el build corre sin ninguna configurada.
const VARIABLES_DE_LA_APP = [
  "APP_URL",
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "CRON_SECRET",
  "BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STREAM_API_KEY",
  "BUNNY_CDN_HOSTNAME",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "EMAIL_FROM",
  "EMAIL_API_KEY",
  "SENTRY_DSN",
];

const entorno = { ...process.env };
for (const clave of VARIABLES_DE_LA_APP) delete entorno[clave];

console.log("[test] Ejecutando `next build` sin variables de entorno de la app...");

const resultado = spawnSync("npx", ["next", "build"], {
  env: entorno,
  stdio: "pipe",
  shell: true,
  encoding: "utf8",
});

const salida = `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`;

if (resultado.status !== 0) {
  console.error(salida);
  console.error(
    "\n[test] FALLO: el build NO compila sin variables de entorno.\n" +
      "Probablemente Next ha cambiado como marca la fase de build y la\n" +
      "validacion de entorno se esta ejecutando al compilar. Revisa la guarda\n" +
      "PHASE_PRODUCTION_BUILD en src/config/startup.ts.\n",
  );
  process.exit(1);
}

// El build puede acabar en verde y aun asi contener un archivo con error
// (paso de verdad con `process.exit` en el runtime Edge).
if (salida.includes("Ecmascript file had an error")) {
  console.error(salida);
  console.error("\n[test] FALLO: el build compila pero contiene un archivo con error.\n");
  process.exit(1);
}

console.log("[test] OK: el build compila en verde sin variables y sin archivos con error.");
