/**
 * TODA RAZÓN DE BOOST TIENE COPY, Y SE EXIGE CONTRA EL ESQUEMA.
 *
 * Una razón sin copy no FALLA: enseña su código crudo («VIP_WEEKLY») en medio de una lista en
 * castellano. Y se exige contra `BoostReasonSchema`, no contra una lista escrita aquí: añadir una
 * razón al esquema sin darle texto cae en rojo sin que nadie tenga que acordarse de este fichero.
 *
 * El ajuste del equipo se dice POR SU SIGNO, como en los puntos, y por el mismo motivo: un ajuste
 * puede sumar o restar y el dueño no tiene por qué deducirlo del número de al lado. Lo que NO dice
 * es el porqué — eso es traza interna del equipo (ver `nota` del ajuste de puntos).
 */
import { describe, expect, it } from "vitest";

import { BoostReasonSchema, RAZON_BOOST_COMPRA } from "../src/config/constants";
import { razonBoostPropia, RAZON_BOOST_AJUSTE } from "../src/lib/razones-boost";

const RAZONES = BoostReasonSchema.options;

describe("el catálogo de razones está cubierto", () => {
  it("las cinco del esquema, y la compra y el ajuste están entre ellas", () => {
    expect(RAZONES).toContain(RAZON_BOOST_COMPRA);
    expect(RAZONES).toContain(RAZON_BOOST_AJUSTE);
  });

  it.each(RAZONES)("«%s» se traduce: no se cuela como código", (razon) => {
    const texto = razonBoostPropia(razon);
    // La señal de "sin copy" es que devuelve la razón tal cual: MAYÚSCULAS y guiones bajos.
    expect(texto, `${razon} sin copy`).not.toBe(razon);
    expect(texto, `${razon} suena a constante`).not.toMatch(/^[A-Z0-9_]+$/);
    expect(texto.trim().length, razon).toBeGreaterThan(3);
  });

  it("y los textos son DISTINTOS entre sí: dos razones no pueden leerse igual", () => {
    const textos = RAZONES.map((r) => razonBoostPropia(r));
    expect(new Set(textos).size).toBe(textos.length);
  });

  it("una razón desconocida se devuelve TAL CUAL, no se le inventa un nombre", () => {
    expect(razonBoostPropia("RAZON_QUE_NO_EXISTE")).toBe("RAZON_QUE_NO_EXISTE");
  });
});

describe("habla en SEGUNDA persona: es tu propio historial", () => {
  it("ninguna razón suena a ficha de otra persona", () => {
    // El tiempo verbal es lo único que distingue "Compraste Boosts" de "Compró Boosts". Si alguien
    // copiara aquí el copy de un inspector de panel, el usuario leería su vida en tercera persona.
    for (const razon of RAZONES) {
      if (razon === RAZON_BOOST_AJUSTE) continue; // el ajuste lo dice el equipo, no el usuario
      expect(razonBoostPropia(razon), razon).not.toMatch(/\b(compró|gastó|recibió|activó)\b/i);
    }
  });
});

describe("el ajuste del equipo se dice por su SIGNO", () => {
  it("si suma, lo dice; si resta, también", () => {
    expect(razonBoostPropia(RAZON_BOOST_AJUSTE, 3)).toMatch(/añadió/);
    expect(razonBoostPropia(RAZON_BOOST_AJUSTE, -1)).toMatch(/retiró/);
  });

  it("y los dos textos son distintos", () => {
    expect(razonBoostPropia(RAZON_BOOST_AJUSTE, 1)).not.toBe(
      razonBoostPropia(RAZON_BOOST_AJUSTE, -1),
    );
  });

  it("sin importe cae al texto neutro, que sigue siendo cierto", () => {
    const neutro = razonBoostPropia(RAZON_BOOST_AJUSTE);
    expect(neutro).toBe(razonBoostPropia(RAZON_BOOST_AJUSTE, 0));
    expect(neutro).not.toMatch(/añadió|retiró/);
  });

  it("NO repite la cifra ni insinúa el porqué", () => {
    for (const delta of [3, -2]) {
      const texto = razonBoostPropia(RAZON_BOOST_AJUSTE, delta);
      expect(texto, "repite el número").not.toMatch(/\d/);
      expect(texto, "insinúa un motivo que no se cuenta").not.toMatch(/porque|motivo|sanci/i);
    }
  });

  it("y el signo NO cambia el resto de motivos: solo el ajuste va en dos direcciones", () => {
    for (const razon of RAZONES) {
      if (razon === RAZON_BOOST_AJUSTE) continue;
      expect(razonBoostPropia(razon, 10), razon).toBe(razonBoostPropia(razon, -10));
    }
  });
});
