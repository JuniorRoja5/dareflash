/**
 * EL CURSOR Y EL VOCABULARIO DEL LISTADO DE CUENTAS — pieza PURA, sin base de datos.
 *
 * Lo que se fija:
 *  - ida y vuelta exacta, incluido el caso que rompe una concatenación ingenua: los handles llevan
 *    PUNTOS, que es el separador del cursor;
 *  - un cursor DE OTRO ORDEN se rechaza. Es la garantía que permite que la pantalla no tenga que
 *    acordarse de limpiarlo: sin ella, un cursor de "puntos" aplicado a "alta" compararía un saldo
 *    contra una fecha y la paginación devolvería cualquier cosa sin quejarse;
 *  - todo lo que llega por la URL se sanea: un parámetro manipulado da el valor por defecto o `null`,
 *    nunca una excepción ni un valor que la consulta no sepa usar.
 *
 * Para romperlo: quitar la comprobación del orden en `decodificarCursorCuentas` (rojo), concatenar el
 * valor sin codificar (rojo en el handle con punto), o aceptar un orden desconocido (rojo).
 */
import { describe, expect, it } from "vitest";

import {
  codificarCursorCuentas,
  decodificarCursorCuentas,
  estadoCuentaDe,
  ordenCuentasDe,
  ORDENES_CUENTAS,
  ORDEN_CUENTAS_DEFECTO,
  rolFiltroDe,
  type OrdenCuentas,
} from "../src/lib/cuentas-listado";

describe("ida y vuelta", () => {
  it("cada orden conserva su valor y su id", () => {
    const casos: { orden: OrdenCuentas; valor: string }[] = [
      { orden: "alta", valor: String(Date.UTC(2026, 0, 15, 10, 30, 0, 123)) },
      { orden: "alfabetico", valor: "yuyu" },
      { orden: "puntos", valor: "4200" },
      { orden: "victorias", valor: "0" },
    ];
    for (const c of casos) {
      const crudo = codificarCursorCuentas({ orden: c.orden, valor: c.valor, id: "cuid123" });
      expect(decodificarCursorCuentas(crudo, c.orden), c.orden).toEqual({
        orden: c.orden,
        valor: c.valor,
        id: "cuid123",
      });
    }
  });

  it("un handle CON PUNTOS sobrevive (por eso el valor va codificado, no concatenado)", () => {
    // `^[a-z0-9._]{3,30}$`: el punto es legal en un handle y es el separador del cursor.
    const valor = "jo.hn_doe.v2";
    const crudo = codificarCursorCuentas({ orden: "alfabetico", valor, id: "abc" });
    expect(decodificarCursorCuentas(crudo, "alfabetico")?.valor).toBe(valor);
  });
});

describe("un cursor que no es de esta consulta no se usa", () => {
  it("el de OTRO orden se rechaza: no se comparan magnitudes distintas", () => {
    const dePuntos = codificarCursorCuentas({ orden: "puntos", valor: "500", id: "abc" });

    expect(decodificarCursorCuentas(dePuntos, "puntos")).not.toBeNull();
    for (const otro of ORDENES_CUENTAS.filter((o) => o !== "puntos")) {
      expect(decodificarCursorCuentas(dePuntos, otro), otro).toBeNull();
    }
  });

  it("manipulado, vacío o con un orden inventado -> primera página, nunca una excepción", () => {
    for (const crudo of [
      null,
      undefined,
      "",
      "alta",
      "alta.abc",
      "inventado.abc.NDI=",
      "alta.abc.no-base64-***",
      `alta.${"x".repeat(80)}.NDI`,
      "../../etc/passwd",
      "alta.abc.' OR 1=1 --",
    ]) {
      expect(decodificarCursorCuentas(crudo, "alta"), String(crudo)).toBeNull();
    }
  });

  it("un orden NUMÉRICO exige un entero: un cursor con texto no pagina", () => {
    const falso = codificarCursorCuentas({ orden: "puntos", valor: "mucho", id: "abc" });
    expect(decodificarCursorCuentas(falso, "puntos")).toBeNull();

    // Y el alfabético sí acepta texto: es su magnitud.
    const bueno = codificarCursorCuentas({ orden: "alfabetico", valor: "mucho", id: "abc" });
    expect(decodificarCursorCuentas(bueno, "alfabetico")?.valor).toBe("mucho");
  });
});

describe("lo que llega por la URL se sanea", () => {
  it("el orden desconocido cae al de por defecto, que son las últimas altas", () => {
    expect(ORDEN_CUENTAS_DEFECTO).toBe("alta");
    for (const raw of [undefined, null, "", "PUNTOS", "pointsBalance DESC", 7, ["alta"]]) {
      expect(ordenCuentasDe(raw), String(raw)).toBe(ORDEN_CUENTAS_DEFECTO);
    }
    for (const o of ORDENES_CUENTAS) expect(ordenCuentasDe(o)).toBe(o);
  });

  it("los filtros desconocidos son `null` = sin filtrar (no un filtro inventado)", () => {
    for (const raw of [undefined, "", "todas", "BANNED", 1]) {
      expect(estadoCuentaDe(raw), String(raw)).toBeNull();
      expect(rolFiltroDe(raw), String(raw)).toBeNull();
    }
    expect(estadoCuentaDe("suspendida")).toBe("suspendida");
    expect(rolFiltroDe("ADMIN")).toBe("ADMIN");
    // El rol se compara EXACTO: nada de casar por minúsculas o por prefijo.
    expect(rolFiltroDe("admin")).toBeNull();
  });
});
