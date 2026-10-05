/**
 * EL UMBRAL QUE OCULTA, AISLADO.
 *
 * Es la regla que hace desaparecer contenido de la vista sin que lo mire ningún humano, así que
 * vive fuera del servicio y se ata sola. Lo que se fija:
 *
 *  - DOS no ocultan, TRES sí, y el número sale de `DENUNCIAS_PARA_OCULTAR`: moverlo mueve estos
 *    casos con él. Si alguien bajara el umbral a 2, el caso de "dos no basta" se pondría rojo.
 *  - SOLO EN EL CRUCE: la denuncia que alcanza el umbral oculta; la cuarta y la quinta no repiten
 *    nada. Ahí está toda la idempotencia del mecanismo.
 *  - UNA SOLA DIRECCIÓN: no hay nada aquí que diga "des-ocultar". Levantar el velo es del
 *    moderador, y un automatismo que lo hiciera podría deshacer una retirada humana en silencio.
 *
 * Lo que este fichero NO prueba: que las denuncias DESCARTADAS no cuenten. Eso no es decisión de
 * esta función —le llega el número ya contado— sino del `where` que lo cuenta, y se prueba contra
 * la base en `tests/ocultado-umbral.test.ts`. Decirlo aquí sería fingir una cobertura que no hay.
 */
import { describe, expect, it } from "vitest";

import { DENUNCIAS_PARA_OCULTAR } from "../src/config/constants";
import { cruzaUmbralOculto } from "../src/lib/umbral-ocultado";

const U = DENUNCIAS_PARA_OCULTAR;

describe("la frontera", () => {
  it("por debajo del umbral no oculta, una a una", () => {
    for (let n = 0; n < U; n += 1) {
      expect(cruzaUmbralOculto({ abiertas: n, yaOculto: false }), `${n} denuncias`).toBe(false);
    }
  });

  it("la denuncia que ALCANZA el umbral oculta", () => {
    expect(cruzaUmbralOculto({ abiertas: U, yaOculto: false })).toBe(true);
  });

  it("y el umbral son tres personas distintas", () => {
    // Clavado a propósito: si alguien lo mueve, que tenga que venir aquí y decidirlo de nuevo en
    // vez de que el test le siga la corriente.
    expect(DENUNCIAS_PARA_OCULTAR).toBe(3);
  });
});

describe("solo en el cruce (idempotencia)", () => {
  it("si ya estaba oculto, ninguna denuncia posterior vuelve a ocultar", () => {
    for (const n of [U, U + 1, U + 2, 50]) {
      expect(cruzaUmbralOculto({ abiertas: n, yaOculto: true }), `${n} denuncias`).toBe(false);
    }
  });

  it("estar oculto manda sobre el recuento, incluso con el recuento por debajo", () => {
    // Pasa de verdad: el moderador descarta algunas denuncias y el contador baja. Eso NO des-oculta.
    expect(cruzaUmbralOculto({ abiertas: 0, yaOculto: true })).toBe(false);
  });
});

describe("una sola dirección", () => {
  it("la función NUNCA pide des-ocultar: su `true` solo significa ocultar", () => {
    // El contrato es un booleano con un solo significado. Si algún día devolviera "ocultar" o
    // "des-ocultar", este test deja de compilar — que es justo el aviso que se quiere.
    const resultados = [
      cruzaUmbralOculto({ abiertas: 0, yaOculto: true }),
      cruzaUmbralOculto({ abiertas: 99, yaOculto: true }),
    ];
    expect(resultados.every((r) => r === false)).toBe(true);
  });

  it("y el módulo no exporta nada que levante el ocultado", async () => {
    // Un guard barato contra la pieza que faltaría: el día que alguien añada `levantaUmbral` o
    // `desocultar` aquí, esto se pone rojo y hay que justificarlo a mano.
    const modulo = await import("../src/lib/umbral-ocultado");
    const nombres = Object.keys(modulo);
    expect(nombres.filter((n) => /desocult|levanta|mostrar|revelar/i.test(n))).toEqual([]);
    expect(nombres.sort()).toEqual(["cruzaUmbralOculto"]);
  });
});

describe("bordes", () => {
  it("un recuento absurdo no rompe la decisión", () => {
    expect(cruzaUmbralOculto({ abiertas: 0, yaOculto: false })).toBe(false);
    expect(cruzaUmbralOculto({ abiertas: 1_000_000, yaOculto: false })).toBe(true);
  });
});
