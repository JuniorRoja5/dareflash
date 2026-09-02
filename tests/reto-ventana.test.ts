/**
 * VENTANA DEL RETO — la regla "¿admite votos ahora?", compartida por el servidor y la UI.
 *
 * Nació de una divergencia real: `destinoVotable` exigía `startsAt <= ahora` y la vista del detalle
 * solo miraba el cierre. Un reto PUBLISHED pero aún sin empezar se pintaba abierto y el servidor
 * rechazaba el voto con RETO_CERRADO — un botón que promete lo que la API no cumple.
 *
 * Con dientes: los dos BORDES (apertura inclusiva, cierre estricto), que son donde se cuela un `<` por
 * un `<=`; y que el servicio de voto usa ESTA función y no una copia parecida.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { retoEstaAbierto } from "../src/lib/reto-ventana";

const T = 1_000_000;
const abierto = { status: "PUBLISHED", startsAt: T - 1000, deadline: T + 1000 };

describe("retoEstaAbierto", () => {
  it("abierto: PUBLISHED, ya empezado y sin cerrar", () => {
    expect(retoEstaAbierto(abierto, T)).toBe(true);
  });

  it("un reto AÚN SIN EMPEZAR no admite votos (la divergencia que originó esto)", () => {
    expect(retoEstaAbierto({ ...abierto, startsAt: T + 1 }, T)).toBe(false);
  });

  it("la apertura es INCLUSIVA: en el instante de abrir ya se vota", () => {
    expect(retoEstaAbierto({ ...abierto, startsAt: T }, T)).toBe(true);
  });

  it("el cierre es ESTRICTO: en el instante del cierre ya NO se vota", () => {
    expect(retoEstaAbierto({ ...abierto, deadline: T }, T)).toBe(false);
    expect(retoEstaAbierto({ ...abierto, deadline: T + 1 }, T)).toBe(true);
  });

  it.each(["DRAFT", "CLOSED", "ARCHIVED"])("un reto en %s no admite votos", (status) => {
    expect(retoEstaAbierto({ ...abierto, status }, T)).toBe(false);
  });

  it("acepta `Date` y milisegundos indistintamente (servidor y DTO hablan distinto)", () => {
    const conFechas = {
      status: "PUBLISHED",
      startsAt: new Date(T - 1000),
      deadline: new Date(T + 1000),
    };
    expect(retoEstaAbierto(conFechas, new Date(T))).toBe(retoEstaAbierto(abierto, T));
  });
});

describe("una sola regla, no dos parecidas", () => {
  it("el servicio de voto usa la función compartida, sin reescribir la comparación", () => {
    const src = readFileSync(path.resolve(__dirname, "../src/server/services/votes.ts"), "utf8");
    expect(src).toContain("retoEstaAbierto");
    // Si alguien vuelve a escribir la comparación a mano, la UI y el servidor pueden separarse otra vez.
    expect(src).not.toMatch(/status === "PUBLISHED" &&[\s\S]{0,80}deadline/);
  });
});
