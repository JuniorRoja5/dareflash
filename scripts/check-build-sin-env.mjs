/**
 * TEST DE REGRESION: `next build` debe seguir compilando SIN ninguna variable
 * de entorno configurada.
 *
 * Por que existe: Docker (y antes Hostinger) compilan SIN ninguna variable configurada.
 * Si el build empezara a exigirlas, el despliegue se caeria. Ese es EXACTAMENTE el fallo
 * que dejo `next build` local en verde mientras el build de Docker reventaba.
 *
 * OJO — por que no basta con borrar variables de `process.env`: `next build` **carga el
 * fichero `.env` del disco por su cuenta** (dotenv integrado). Si solo limpiaramos
 * `process.env`, Next volveria a poblar las variables desde `.env` y el test no
 * comprobaria nada (justo lo que pasaba). Por eso APARTAMOS los ficheros `.env*` durante
 * el build y los restauramos SIEMPRE al terminar.
 *
 * Comprobado empiricamente en Next 16.2.11: lo que mantiene el build en verde es que Next
 * **no ejecuta `instrumentation.register()` durante `next build`**. Es comportamiento
 * suyo, no un contrato nuestro; este test vigila la propiedad de verdad —"el build
 * compila sin variables"— para que un cambio de Next lo cace el CI y no produccion.
 *
 * Uso: npm run test:build-sin-env
 */
import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

// Ficheros que Next carga automaticamente. Se apartan para replicar el entorno de Docker.
const ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
];

// Variables de la app que ademas se quitan de process.env (por si en CI vienen del
// entorno, no de un fichero). Debe reflejar el esquema de src/config/env.ts.
const VARIABLES_DE_LA_APP = [
  "APP_URL",
  "DATABASE_URL",
  "AUTH_SECRET",
  "CRON_SECRET",
  "BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STREAM_API_KEY",
  "BUNNY_CDN_HOSTNAME",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SENTRY_DSN",
];

const root = process.cwd();
const SUFIJO = ".bak-sin-env";
const apartados = [];

function apartarEnvFiles() {
  for (const nombre of ENV_FILES) {
    const ruta = join(root, nombre);
    if (existsSync(ruta)) {
      const backup = ruta + SUFIJO;
      renameSync(ruta, backup);
      apartados.push([ruta, backup]);
    }
  }
}

function restaurarEnvFiles() {
  while (apartados.length > 0) {
    const [ruta, backup] = apartados.pop();
    try {
      if (existsSync(backup)) renameSync(backup, ruta);
    } catch (e) {
      console.error(`[test] AVISO: no pude restaurar ${ruta} desde ${backup}: ${e.message}`);
    }
  }
}

// Recuperacion de una ejecucion ANTERIOR muerta de forma dura (SIGKILL, corte de luz):
// los handlers de senal no cubren ese caso y el .env quedaria apartado como .bak-sin-env,
// rompiendo el entorno local sin explicacion. Al arrancar: si existe el backup y NO existe
// el original, restaurarlo antes de nada. (.gitignore ya ignora .env*, incluido el backup.)
function recuperarBackupsHuerfanos() {
  for (const nombre of ENV_FILES) {
    const ruta = join(root, nombre);
    const backup = ruta + SUFIJO;
    if (existsSync(backup) && !existsSync(ruta)) {
      console.log(`[test] Recuperando ${nombre} de una ejecucion anterior interrumpida.`);
      renameSync(backup, ruta);
    }
  }
}

// Restaurar tambien si nos interrumpen (Ctrl-C / kill): perder el .env del usuario seria grave.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    restaurarEnvFiles();
    process.exit(1);
  });
}

// Antes de nada: deshacer un apartado huerfano de una ejecucion anterior muerta en duro.
recuperarBackupsHuerfanos();

let status = 1;
let salida = "";
try {
  apartarEnvFiles();

  const entorno = { ...process.env };
  for (const clave of VARIABLES_DE_LA_APP) delete entorno[clave];

  console.log("[test] Ejecutando `next build` sin variables ni ficheros .env...");
  const resultado = spawnSync("npx", ["next", "build"], {
    env: entorno,
    stdio: "pipe",
    shell: true,
    encoding: "utf8",
  });
  status = resultado.status;
  salida = `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`;
} finally {
  restaurarEnvFiles(); // SIEMPRE, aunque el build lance
}

if (status !== 0) {
  console.error(salida);
  console.error(
    [
      "",
      "[test] FALLO: el build NO compila sin variables de entorno.",
      "Docker compila sin ninguna variable configurada, asi que esto tumbaria",
      "el despliegue. Dos causas posibles, por orden de probabilidad:",
      "",
      "  1) ALGUIEN LEE `env` (o construye algo que lo lee, p.ej. el cliente Prisma)",
      "     EN AMBITO DE MODULO de una cadena que Next evalua en el build.",
      "     Mira arriba el `Failed to collect page data for /<ruta>`: esa es la ruta.",
      "     Solucion: leer `env` / importar `prisma` solo dentro del ambito de la",
      "     peticion (route handlers, server actions, servicios), o con `await import()`.",
      "     Ver la regla en src/config/env.ts y el Proxy perezoso en src/server/db/client.ts.",
      "",
      "  2) Next ha cambiado su comportamiento y ahora ejecuta",
      "     `instrumentation.register()` durante el build sin marcar NEXT_PHASE.",
      "     Revisa la guarda PHASE_PRODUCTION_BUILD en src/config/startup.ts.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

// El build puede acabar en verde y aun asi contener un archivo con error.
if (salida.includes("Ecmascript file had an error")) {
  console.error(salida);
  console.error("\n[test] FALLO: el build compila pero contiene un archivo con error.\n");
  process.exit(1);
}

console.log("[test] OK: el build compila en verde sin variables y sin archivos con error.");
