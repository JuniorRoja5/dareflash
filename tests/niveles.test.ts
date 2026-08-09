/**
 * NIVELES — `nivelPorPuntos` PURA con dientes. Umbrales del brief 0/100/500/2000/10000 ->
 * Rookie/Challenger/Pro/Elite/Legend, fronteras INCLUSIVAS por abajo. Mover un umbral (o el orden de
 * la tabla) cambia la asignacion en una frontera y cae en rojo.
 */
import { describe, expect, it } from "vitest";

import { nivelPorPuntos, NIVELES, TOTAL_TIERS } from "../src/lib/niveles";

describe("nivelPorPuntos (fronteras)", () => {
  it("asigna el nivel correcto en cada frontera", () => {
    expect(nivelPorPuntos(0).clave).toBe("rookie");
    expect(nivelPorPuntos(99).clave).toBe("rookie");
    expect(nivelPorPuntos(100).clave).toBe("challenger");
    expect(nivelPorPuntos(499).clave).toBe("challenger");
    expect(nivelPorPuntos(500).clave).toBe("pro");
    expect(nivelPorPuntos(1999).clave).toBe("pro");
    expect(nivelPorPuntos(2000).clave).toBe("elite");
    expect(nivelPorPuntos(9999).clave).toBe("elite");
    expect(nivelPorPuntos(10000).clave).toBe("legend");
    expect(nivelPorPuntos(999999).clave).toBe("legend");
  });

  it("puntos negativos caen a Rookie (nivel minimo)", () => {
    expect(nivelPorPuntos(-1).clave).toBe("rookie");
  });

  it("el tier va de 1 (Rookie) a 5 (Legend) y hay 5 niveles", () => {
    expect(nivelPorPuntos(0).tier).toBe(1);
    expect(nivelPorPuntos(10000).tier).toBe(5);
    expect(TOTAL_TIERS).toBe(5);
    expect(NIVELES).toHaveLength(5);
  });
});
