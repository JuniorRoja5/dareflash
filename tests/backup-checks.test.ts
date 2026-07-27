import { describe, expect, it } from "vitest";

import {
  dumpPareceCompleto,
  evaluarTamano,
  faltanTablasCriticas,
  TABLAS_CRITICAS,
} from "../scripts/backup/checks";

describe("guardas del respaldo (puras)", () => {
  it("sentinela: un dump completo lo tiene; uno truncado o vacio, no", () => {
    expect(dumpPareceCompleto("...datos...\n-- Dump completed on 2026-07-27 12:00:00\n")).toBe(
      true,
    );
    expect(
      dumpPareceCompleto("CREATE TABLE `User` (...\nINSERT INTO `User` (cortado a mitad"),
    ).toBe(false);
    expect(dumpPareceCompleto("")).toBe(false);
  });

  it("tamaño: por debajo del suelo o del % del previo es sospechoso; uno sano no", () => {
    expect(evaluarTamano({ bytes: 500, previoBytes: 10_000, sueloBytes: 1024 }).sospechoso).toBe(
      true,
    );
    expect(evaluarTamano({ bytes: 3_000, previoBytes: 10_000, sueloBytes: 1024 }).sospechoso).toBe(
      true,
    );
    expect(evaluarTamano({ bytes: 9_000, previoBytes: 10_000, sueloBytes: 1024 }).sospechoso).toBe(
      false,
    );
    // Sin historico (previo 0) y por encima del suelo: no hay con que comparar -> no sospechoso.
    expect(evaluarTamano({ bytes: 2_000, previoBytes: 0, sueloBytes: 1024 }).sospechoso).toBe(
      false,
    );
  });

  it("tablas criticas: detecta las que faltan", () => {
    expect(faltanTablasCriticas([...TABLAS_CRITICAS])).toEqual([]);
    expect(faltanTablasCriticas(["User", "Session"])).toContain("WalletLedger");
    expect(faltanTablasCriticas([])).toEqual([...TABLAS_CRITICAS]);
  });
});
