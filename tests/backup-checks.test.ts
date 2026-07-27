import { describe, expect, it } from "vitest";

import {
  dumpPareceCompleto,
  evaluarTamano,
  faltanRespectoAProduccion,
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

  it("suelo critico: detecta las que faltan, e incluye _prisma_migrations", () => {
    expect(faltanTablasCriticas([...TABLAS_CRITICAS])).toEqual([]);
    expect(faltanTablasCriticas(["User", "Session"])).toContain("WalletLedger");
    expect(faltanTablasCriticas([])).toEqual([...TABLAS_CRITICAS]);
    // Sin _prisma_migrations un `migrate deploy` sobre la restaurada reaplicaria todo.
    expect(TABLAS_CRITICAS).toContain("_prisma_migrations");
    expect(
      faltanTablasCriticas([
        "User",
        "Session",
        "WalletLedger",
        "PointsLedger",
        "BoostLedger",
        "Job",
        "VerificationToken",
      ]),
    ).toEqual(["_prisma_migrations"]);
  });

  it("comparacion FUERTE contra produccion: falla si a la restaurada le falta una tabla viva", () => {
    const produccion = ["User", "Session", "Challenge", "Vote"];
    expect(faltanRespectoAProduccion(produccion, produccion)).toEqual([]);
    // A la restaurada le falta 'Vote' que SI existe en produccion -> se detecta.
    expect(faltanRespectoAProduccion(produccion, ["User", "Session", "Challenge"])).toEqual([
      "Vote",
    ]);
    // Que la restaurada tenga tablas de mas (la desechable) no es problema.
    expect(faltanRespectoAProduccion(produccion, [...produccion, "extra"])).toEqual([]);
  });
});
