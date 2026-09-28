/**
 * TODA RAZÓN DEL CATÁLOGO TIENE COPY EN LAS DOS VOCES.
 *
 * El historial de puntos se pinta en dos sitios —el inspector del panel (tercera persona, mira la
 * cuenta de otro) y /puntos (segunda, es la tuya)— y una razón sin copy NO falla: se enseña su código
 * crudo («REGISTERED_WITH_REFERRAL») en medio de una lista en castellano. Eso es justo lo que pasa
 * cuando se añade una acción y se olvida una de las dos pantallas, así que aquí se exige a la vez.
 *
 * Y SE EXIGE CONTRA `ACCIONES_PUNTOS`, no contra una lista escrita aquí: añadir una acción al
 * catálogo sin darle copy cae en rojo sin que nadie tenga que acordarse de tocar este test.
 *
 * Para romperlo: quitar una entrada de cualquiera de los dos mapas (rojo), o añadir una acción a
 * `ACCIONES_PUNTOS` sin copy (rojo).
 */
import { describe, expect, it } from "vitest";

import { ACCIONES_PUNTOS, RAZON_AJUSTE_ADMIN } from "../src/config/constants";
import { razonHumana, razonHumanaPropia, RAZONES_CONOCIDAS } from "../src/lib/razones-puntos";

describe("el catálogo de razones está completo", () => {
  it("son las nueve acciones más el ajuste manual, sin repetidos", () => {
    expect(RAZONES_CONOCIDAS).toHaveLength(ACCIONES_PUNTOS.length + 1);
    expect(new Set(RAZONES_CONOCIDAS).size).toBe(RAZONES_CONOCIDAS.length);
    expect(RAZONES_CONOCIDAS).toContain(RAZON_AJUSTE_ADMIN);
    for (const a of ACCIONES_PUNTOS) expect(RAZONES_CONOCIDAS).toContain(a.razon);
  });
});

describe("las dos voces", () => {
  it.each(["razonHumana", "razonHumanaPropia"] as const)(
    "%s traduce TODAS las razones conocidas (ninguna se cuela como código)",
    (cual) => {
      const traducir = cual === "razonHumana" ? razonHumana : razonHumanaPropia;
      for (const razon of RAZONES_CONOCIDAS) {
        const texto = traducir(razon);
        // La señal de "sin copy" es que devuelve la razón tal cual: MAYÚSCULAS y guiones bajos.
        expect(texto, `${razon} sin copy en ${cual}`).not.toBe(razon);
        expect(texto, `${razon} suena a constante`).not.toMatch(/^[A-Z0-9_]+$/);
        expect(texto.trim().length, razon).toBeGreaterThan(3);
      }
    },
  );

  it("son voces DISTINTAS: ninguna razón dice lo mismo en las dos", () => {
    // Si alguien "simplificara" copiando un mapa sobre el otro, el panel acabaría tuteando al admin
    // sobre la cuenta de un tercero ("Ganaste un reto" en la ficha de otra persona).
    for (const razon of RAZONES_CONOCIDAS) {
      expect(razonHumana(razon), razon).not.toBe(razonHumanaPropia(razon));
    }
  });

  it("una razón desconocida se devuelve TAL CUAL, no se le inventa un nombre", () => {
    expect(razonHumana("RAZON_QUE_NO_EXISTE")).toBe("RAZON_QUE_NO_EXISTE");
    expect(razonHumanaPropia("RAZON_QUE_NO_EXISTE")).toBe("RAZON_QUE_NO_EXISTE");
  });
});
