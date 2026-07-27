/**
 * Estado persistente del respaldo entre ejecuciones. VIVE EN OUT_DIR, que en produccion
 * DEBE ser un volumen del anfitrion (0700): con `run --rm` el sistema de ficheros del
 * contenedor se destruye al terminar, y sin persistencia `ultimoBuenoBytes` seria siempre
 * 0 y la guarda de tamaño (menos del 50% del ultimo bueno) no cazaria una truncadura nunca.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Estado {
  ultimoBuenoBytes?: number;
  ultimoBueno?: string;
  fecha?: string;
}

export function rutaEstado(outDir: string): string {
  return join(outDir, "estado.json");
}

export function leerEstado(outDir: string): Estado {
  try {
    return JSON.parse(readFileSync(rutaEstado(outDir), "utf8")) as Estado;
  } catch {
    return {};
  }
}

export function guardarEstado(outDir: string, estado: Estado): void {
  writeFileSync(rutaEstado(outDir), JSON.stringify(estado, null, 2));
}
