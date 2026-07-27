import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { evaluarTamano } from "../scripts/backup/checks";
import { guardarEstado, leerEstado } from "../scripts/backup/estado";

/**
 * Demuestra que la guarda de tamaño SOLO caza truncaduras si el estado PERSISTE entre
 * ejecuciones (OUT_DIR = volumen del anfitrion). Con `run --rm` el FS se destruye,
 * `previoBytes` seria 0 y la guarda estaria muerta: por eso este test escribe y RELEE.
 */
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "df-backup-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("estado persistente + guarda de tamaño entre ejecuciones", () => {
  it("guardar y releer el estado en OUT_DIR", () => {
    expect(leerEstado(dir)).toEqual({});
    guardarEstado(dir, { ultimoBuenoBytes: 12_345 });
    expect(leerEstado(dir).ultimoBuenoBytes).toBe(12_345);
  });

  it("2 ejecuciones: la 2a con un dump diminuto se pone ROJA (solo posible con persistencia)", () => {
    // --- Ejecucion 1: dump bueno de 100 KB. Sin previo -> no sospechoso. Se guarda. ---
    const bytes1 = 100_000;
    expect(
      evaluarTamano({
        bytes: bytes1,
        previoBytes: leerEstado(dir).ultimoBuenoBytes ?? 0,
        sueloBytes: 1024,
      }).sospechoso,
    ).toBe(false);
    guardarEstado(dir, { ultimoBuenoBytes: bytes1 });

    // --- Ejecucion 2: dump diminuto de 5 KB. Lee el previo del ESTADO PERSISTIDO. ---
    const previo = leerEstado(dir).ultimoBuenoBytes ?? 0;
    // Si OUT_DIR NO persistiera (run --rm sin volumen), esto seria 0 y la guarda moriria:
    expect(previo).toBe(bytes1);
    const r = evaluarTamano({ bytes: 5_000, previoBytes: previo, sueloBytes: 1024 });
    expect(r.sospechoso).toBe(true);
    expect(r.motivo).toMatch(/del previo/);
  });
});
