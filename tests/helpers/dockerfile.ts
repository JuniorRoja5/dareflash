/**
 * Lectura ESTRUCTURAL del Dockerfile, para los tests que fijan decisiones de la imagen (el SHA en
 * `runner`, la cache de `next build` fuera de `builder`). Sin comentarios: una linea comentada no
 * construye nada, y un comentario que mencione la instruccion no debe poder dejar el test en verde.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export function dockerfileSinComentarios(): string {
  return readFileSync(path.resolve(__dirname, "..", "..", "Dockerfile"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
}

/** El texto de UNA etapa (desde su `FROM ... AS <nombre>` hasta el siguiente FROM). Lanza si no existe. */
export function etapaDockerfile(nombre: string): string {
  const docker = dockerfileSinComentarios();
  const m = new RegExp(`^FROM \\S+ AS ${nombre}\\s*$`, "m").exec(docker);
  if (!m) throw new Error(`El Dockerfile no tiene la etapa \`${nombre}\``);
  const fin = docker.indexOf("\nFROM ", m.index + 1);
  return docker.slice(m.index, fin === -1 ? undefined : fin);
}
