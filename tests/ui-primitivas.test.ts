/**
 * Primitivas de DareFlash — logica PURA con dientes. Ata los dos invariantes de producto que no
 * pueden depender de que alguien se acuerde: el umbral de las 24 h de la cuenta atras
 * (--df-time <-> --df-alarm) en los dos sentidos, y que el oro (--df-rank) solo salga en el podio.
 * Romper cualquiera de los predicados pone estos tests en rojo.
 */
import { describe, expect, it } from "vitest";

import {
  botonTokens,
  type BotonVariante,
  esCuentaAtrasCritica,
  formatearCuentaAtras,
  formatearImporte,
  NAV_DESTINOS,
  tokenCuentaAtras,
  tokenPuesto,
  UMBRAL_ALARMA_MS,
} from "../src/components/ui/logic";

const H = 60 * 60 * 1000;

describe("cuenta atras: umbral de 24 h (--df-time <-> --df-alarm)", () => {
  it("por ENCIMA de 24 h -> time; justo por DEBAJO -> alarm (los dos sentidos)", () => {
    expect(tokenCuentaAtras(UMBRAL_ALARMA_MS + 1)).toBe("time");
    expect(tokenCuentaAtras(UMBRAL_ALARMA_MS - 1)).toBe("alarm");
  });

  it("en el limite EXACTO de 24 h todavia es time (no critico)", () => {
    expect(esCuentaAtrasCritica(UMBRAL_ALARMA_MS)).toBe(false);
    expect(tokenCuentaAtras(UMBRAL_ALARMA_MS)).toBe("time");
  });

  it("agotado (<= 0) es alarm", () => {
    expect(tokenCuentaAtras(0)).toBe("alarm");
    expect(tokenCuentaAtras(-5000)).toBe("alarm");
  });

  it("el token de la cuenta atras SOLO es time o alarm (nunca money/rank/action/ok)", () => {
    const casos = [-1, 0, 1, 10_000, UMBRAL_ALARMA_MS - 1, UMBRAL_ALARMA_MS, 10 * UMBRAL_ALARMA_MS];
    for (const ms of casos) expect(["time", "alarm"]).toContain(tokenCuentaAtras(ms));
  });
});

describe("cuenta atras: formato con cifras tabulares", () => {
  it(">=24 h -> 'N d HH h'; <24 h -> HH:MM:SS; agotado -> 00:00:00", () => {
    expect(formatearCuentaAtras(6 * 24 * H + 4 * H)).toBe("6 d 04 h");
    expect(formatearCuentaAtras(2 * H + 41 * 60 * 1000 + 9 * 1000)).toBe("02:41:09");
    expect(formatearCuentaAtras(45 * 1000)).toBe("00:00:45");
    expect(formatearCuentaAtras(0)).toBe("00:00:00");
    expect(formatearCuentaAtras(-1)).toBe("00:00:00");
  });
});

describe("fila de puesto: el oro (--df-rank) SOLO en el podio", () => {
  it("1/2/3 -> rank; 4+, 0 y no-enteros -> neutral (los dos sentidos)", () => {
    expect(tokenPuesto(1)).toBe("rank");
    expect(tokenPuesto(2)).toBe("rank");
    expect(tokenPuesto(3)).toBe("rank");
    expect(tokenPuesto(4)).toBe("neutral");
    expect(tokenPuesto(20)).toBe("neutral");
    expect(tokenPuesto(0)).toBe("neutral");
    expect(tokenPuesto(1.5)).toBe("neutral");
  });
});

describe("importe: money en USD, formato en-US", () => {
  it("centimos -> $ con miles por coma y dos decimales", () => {
    expect(formatearImporte(125000)).toBe("$1,250.00");
    expect(formatearImporte(2500)).toBe("$25.00");
    expect(formatearImporte(0)).toBe("$0.00");
  });
});

describe("boton: mapa variante -> tokens", () => {
  it("principal -> relleno action con TEXTO NEGRO (void); peligro -> relleno alarm", () => {
    expect(botonTokens("principal")).toEqual({ fondo: "action", texto: "void", filete: false });
    expect(botonTokens("peligro")).toEqual({ fondo: "alarm", texto: "void", filete: false });
  });

  it("secundario lleva filete sin relleno; fantasma no lleva ni relleno ni filete", () => {
    expect(botonTokens("secundario")).toEqual({ fondo: null, texto: "text", filete: true });
    expect(botonTokens("fantasma")).toEqual({ fondo: null, texto: "text", filete: false });
  });

  it("INVARIANTE: todo boton con relleno semantico lleva texto negro (void), nunca blanco", () => {
    const variantes: BotonVariante[] = ["principal", "secundario", "fantasma", "peligro"];
    for (const v of variantes) {
      const t = botonTokens(v);
      if (t.fondo !== null) expect(t.texto).toBe("void");
    }
  });
});

describe("navegacion: cinco destinos, en orden y con sus nombres", () => {
  it("son exactamente cinco", () => {
    expect(NAV_DESTINOS).toHaveLength(5);
  });

  it("orden y claves exactos (reordenar o perder uno cae en rojo)", () => {
    expect(NAV_DESTINOS.map((d) => d.clave)).toEqual([
      "inicio",
      "retos",
      "crear",
      "ranking",
      "perfil",
    ]);
  });

  it("nombres exactos, en ese orden", () => {
    expect(NAV_DESTINOS.map((d) => d.nombre)).toEqual([
      "Inicio",
      "Retos",
      "Crear",
      "Ranking",
      "Perfil",
    ]);
  });

  it("hay UN unico destino central (el [+] = crear)", () => {
    const centrales = NAV_DESTINOS.filter((d) => "central" in d && d.central).map((d) => d.clave);
    expect(centrales).toEqual(["crear"]);
  });
});
