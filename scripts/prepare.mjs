/**
 * Script `prepare` de npm.
 *
 * Instala los git hooks (husky) SOLO donde tienen sentido: un clon de
 * desarrollo con repositorio git. En el servidor de despliegue (Hostinger) no
 * hay hooks que instalar, no aporta nada, y un fallo aqui tumbaria el build
 * entero. Por eso: se omite fuera de desarrollo y nunca lanza error.
 *
 * Se puede forzar la omision con HUSKY=0 (mecanismo propio de husky).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const razonParaOmitir =
  process.env.HUSKY === "0"
    ? "HUSKY=0"
    : process.env.NODE_ENV === "production"
      ? "NODE_ENV=production (despliegue)"
      : process.env.CI
        ? "entorno de CI"
        : !existsSync(".git")
          ? "no hay repositorio git"
          : null;

if (razonParaOmitir) {
  console.log(`[prepare] husky omitido: ${razonParaOmitir}.`);
  process.exit(0);
}

try {
  execSync("husky", { stdio: "inherit" });
} catch (error) {
  // Nunca romper la instalacion por los hooks: no son criticos.
  console.log(`[prepare] husky no se pudo instalar, se omite: ${error.message}`);
}
