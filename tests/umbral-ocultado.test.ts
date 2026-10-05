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

import {
  DENUNCIAS_PARA_OCULTAR,
  INMUNIDAD_TRAS_DESCARTE_DIAS,
  INMUNIDAD_TRAS_DESCARTE_MS,
} from "../src/config/constants";
import { cruzaUmbralOculto, estaInmune } from "../src/lib/umbral-ocultado";

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
    // Lista EXACTA, y se amplía a mano: `estaInmune` entró con el candado y es una pregunta, no
    // una acción —dice si el objeto está protegido, no des-oculta nada—. Cualquier export nuevo
    // tiene que pasar por aquí y justificarse, que es justo lo que hizo este.
    expect(nombres.sort()).toEqual(["cruzaUmbralOculto", "estaInmune"]);
  });
});

describe("el candado: lo que un humano absolvió no se re-esconde solo", () => {
  const AHORA = new Date(Date.UTC(2026, 9, 5, 12));
  const haceDias = (d: number) => new Date(AHORA.getTime() - d * 24 * 60 * 60 * 1000);

  it("con el umbral cruzado pero recién absuelto, NO oculta", () => {
    expect(
      cruzaUmbralOculto({ abiertas: U, yaOculto: false, descartadoEn: AHORA, ahora: AHORA }),
    ).toBe(false);
  });

  it("dentro del plazo sigue sin ocultar, aunque lleguen muchas más", () => {
    expect(
      cruzaUmbralOculto({
        abiertas: U + 20,
        yaOculto: false,
        descartadoEn: haceDias(INMUNIDAD_TRAS_DESCARTE_DIAS - 1),
        ahora: AHORA,
      }),
    ).toBe(false);
  });

  it("al vencer el plazo, la red vuelve", () => {
    expect(
      cruzaUmbralOculto({
        abiertas: U,
        yaOculto: false,
        descartadoEn: haceDias(INMUNIDAD_TRAS_DESCARTE_DIAS),
        ahora: AHORA,
      }),
    ).toBe(true);
  });

  it("sin descarte previo no hay inmunidad", () => {
    expect(
      cruzaUmbralOculto({ abiertas: U, yaOculto: false, descartadoEn: null, ahora: AHORA }),
    ).toBe(true);
    // Y omitir el dato es lo mismo que no tenerlo: nadie gana inmunidad por descuido.
    expect(cruzaUmbralOculto({ abiertas: U, yaOculto: false })).toBe(true);
  });

  it("el plazo se mide desde el ÚLTIMO descarte, no desde el primero", () => {
    // Lo garantiza `sellarDescarteEnTx` sobrescribiendo; aquí se fija el lado de la decisión.
    const viejo = haceDias(INMUNIDAD_TRAS_DESCARTE_DIAS + 10);
    const reciente = haceDias(1);
    expect(estaInmune(viejo, AHORA)).toBe(false);
    expect(estaInmune(reciente, AHORA)).toBe(true);
  });

  it("una fecha futura se trata como inmune: ante un dato raro, no se esconde solo", () => {
    expect(estaInmune(new Date(AHORA.getTime() + 86_400_000), AHORA)).toBe(true);
  });

  it("el plazo son TREINTA días, y moverlo exige venir aquí", () => {
    // Clavado como el umbral. Sin este caso, bajarlo a un día —que deja el candado casi inútil
    // contra una ráfaga de fin de semana— no habría puesto nada en rojo: todos los demás casos se
    // derivan de la constante y le seguirían la corriente. El número es una decisión, no un detalle.
    expect(INMUNIDAD_TRAS_DESCARTE_DIAS).toBe(30);
    expect(INMUNIDAD_TRAS_DESCARTE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("y los bordes se miden con ese plazo, no con un número escrito aquí", () => {
    const justo = haceDias(INMUNIDAD_TRAS_DESCARTE_DIAS);
    const unPeloAntes = new Date(justo.getTime() + 1);
    expect(estaInmune(justo, AHORA), "el día que vence, vence").toBe(false);
    expect(estaInmune(unPeloAntes, AHORA), "un milisegundo antes, todavía protege").toBe(true);
  });
});

describe("bordes", () => {
  it("un recuento absurdo no rompe la decisión", () => {
    expect(cruzaUmbralOculto({ abiertas: 0, yaOculto: false })).toBe(false);
    expect(cruzaUmbralOculto({ abiertas: 1_000_000, yaOculto: false })).toBe(true);
  });
});
