/**
 * EL RECORRIDO DE UNA RETIRADA — el stepper, en lo que no toca ni BD ni React.
 *
 * ┌─ LO QUE UN RECORRIDO NO PUEDE HACER ES FINGIR ────────────────────────────────────────────────┐
 * │ Un stepper es una afirmación sobre dinero de alguien: "esto ya está aceptado", "esto ya va de │
 * │ camino". Si pinta un paso de más, le dice a una persona que su cobro avanzó cuando no avanzó, │
 * │ y no falla nada —se ve bien—. Por eso el recorrido no lo decide la vista: sale de aquí, que   │
 * │ es puro, y aquí se comprueba estado por estado.                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y SE DERIVA DE LA MÁQUINA DE ESTADOS, no se enumera: el camino se construye siguiendo la tabla de
 * transiciones desde el estado inicial. Un paso nuevo en la tabla aparece solo en el stepper.
 *
 * Para romperlo a propósito: marcar el paso actual como "hecho" (rojo: "en proceso" pasaría a
 * leerse como "ya te lo mandamos"), devolver un recorrido para `REJECTED` (rojo), o escribir el
 * camino a mano en vez de derivarlo (rojo en cuanto la tabla y la lista discrepen).
 */
import { describe, expect, it } from "vitest";

import {
  CAMINO_RETIRADA,
  ESTADOS_RETIRADA,
  ETIQUETA_ESTADO,
  nombreDeMetodo,
  pasosDe,
  siguientesEstados,
  type EstadoRetirada,
} from "../src/lib/retirada";

describe("el camino sale de la tabla de transiciones", () => {
  it("es el que hay hoy, y de principio a fin", () => {
    expect([...CAMINO_RETIRADA]).toEqual(["PENDING", "APPROVED", "PROCESSING", "PAID"]);
  });

  it("y cada paso ENLAZA con el siguiente de verdad (no es una lista escrita al lado)", () => {
    // Si alguien enumerara el camino a mano y luego cambiara la tabla, esto se pondría rojo: cada
    // salto tiene que existir como transición válida.
    for (let i = 0; i < CAMINO_RETIRADA.length - 1; i++) {
      const desde = CAMINO_RETIRADA[i]!;
      const hasta = CAMINO_RETIRADA[i + 1]!;
      expect(siguientesEstados(desde), `${desde} no lleva a ${hasta}`).toContain(hasta);
    }
  });

  it("el rechazo NO está en el camino: es una salida, no un paso", () => {
    expect([...CAMINO_RETIRADA]).not.toContain("REJECTED");
  });

  it("y el camino no se cuela en un bucle", () => {
    expect(new Set(CAMINO_RETIRADA).size).toBe(CAMINO_RETIRADA.length);
  });
});

describe("el recorrido dice la verdad en cada estado", () => {
  /** Lo que se espera ver: cuántos pasos hechos, cuál es el actual y qué porcentaje de barra. */
  const CASOS: Array<{
    estado: EstadoRetirada;
    hechos: number;
    /** `null` cuando el estado es FINAL: lo terminado no tiene un paso "ocurriendo". */
    actual: EstadoRetirada | null;
    progreso: number;
  }> = [
    { estado: "PENDING", hechos: 0, actual: "PENDING", progreso: 0 },
    { estado: "APPROVED", hechos: 1, actual: "APPROVED", progreso: 33 },
    { estado: "PROCESSING", hechos: 2, actual: "PROCESSING", progreso: 67 },
    { estado: "PAID", hechos: 4, actual: null, progreso: 100 },
  ];

  for (const c of CASOS) {
    it(`${c.estado}: ${c.hechos} hecho(s) y el actual sin adelantar`, () => {
      const r = pasosDe(c.estado);
      expect(r, `${c.estado} no tiene recorrido`).not.toBeNull();
      expect(r!.pasos).toHaveLength(CAMINO_RETIRADA.length);
      expect(r!.pasos.filter((p) => p.situacion === "hecho")).toHaveLength(c.hechos);
      const actuales = r!.pasos.filter((p) => p.situacion === "actual");
      if (c.actual === null) {
        expect(actuales, "un estado terminado tiene un paso 'en curso'").toHaveLength(0);
      } else {
        // EXACTAMENTE UNO actual: ni cero (el recorrido se quedaría sin "dónde estoy") ni dos.
        expect(actuales).toHaveLength(1);
        expect(actuales[0]!.estado).toBe(c.actual);
      }
      expect(r!.progreso).toBe(c.progreso);
    });
  }

  it("el paso ACTUAL no cuenta como hecho, y en eso consiste el caso", () => {
    // "En proceso" significa que el equipo está haciendo la transferencia, NO que ya llegó. Un
    // stepper que lo marcara ✓ le estaría diciendo a alguien que mire su cuenta.
    const r = pasosDe("PROCESSING")!;
    const enProceso = r.pasos.find((p) => p.estado === "PROCESSING")!;
    expect(enProceso.situacion).toBe("actual");
    expect(r.pasos.find((p) => p.estado === "PAID")!.situacion).toBe("pendiente");
  });

  it("una PAGADA está ENTERA hecha: ni pendiente ni 'en curso'", () => {
    // ┌─ ESTO SE VIO MIRANDO LA PANTALLA, NO LEYENDO ─────────────────────────────────────────────┐
    // │ El último punto de una retirada ya pagada salía HUECO, con el aro de "esto está pasando",  │
    // │ sobre un cobro terminado hace una semana. Y el test de entonces lo daba por bueno, porque  │
    // │ lo que afirmaba era "no queda ningún paso pendiente" —cierto— en vez de "no queda ninguno  │
    // │ EN CURSO". Un estado final no tiene presente: todo lo suyo ya ocurrió.                     │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    const r = pasosDe("PAID")!;
    expect(r.pasos.filter((p) => p.situacion === "pendiente")).toHaveLength(0);
    expect(r.pasos.filter((p) => p.situacion === "actual")).toHaveLength(0);
    expect(r.pasos.every((p) => p.situacion === "hecho")).toBe(true);
  });

  it("una RECHAZADA no tiene recorrido: no avanzó, se salió", () => {
    // Devolver aquí los cuatro pasos apagados sería contar un progreso que no existe. La vista
    // tiene que dar su propio cierre (el dinero volvió al saldo).
    expect(pasosDe("REJECTED")).toBeNull();
  });

  it("y un estado que no existe tampoco inventa un recorrido", () => {
    expect(pasosDe("LO_QUE_SEA" as EstadoRetirada)).toBeNull();
  });
});

describe("el nombre del método se dice IGUAL en toda la pantalla", () => {
  it("la red se nombra por su nombre, nunca por su código", () => {
    // El selector de "pedir un cobro" decía "Cripto · TRC20" y la tarjeta de al lado "Cripto ·
    // TRON (TRC-20)": el mismo método, dos nombres, en la misma pantalla.
    expect(nombreDeMetodo({ metodo: "CRYPTO", red: "TRC20" })).toBe("Cripto · TRON (TRC-20)");
    expect(nombreDeMetodo({ metodo: "CRYPTO", red: "ERC20" })).toContain("Ethereum");
    expect(nombreDeMetodo({ metodo: "CRYPTO", red: "TRC20" })).not.toMatch(/TRC20\b/);
  });

  it("un banco es un banco, y una red desconocida no inventa nombre", () => {
    expect(nombreDeMetodo({ metodo: "BANK", red: null })).toBe("Cuenta bancaria");
    expect(nombreDeMetodo({ metodo: "CRYPTO", red: "LO_QUE_SEA" })).toBe("Cripto");
  });
});

describe("las palabras", () => {
  it("cada estado tiene su etiqueta, y ninguna es el código", () => {
    for (const e of ESTADOS_RETIRADA) {
      const etiqueta = ETIQUETA_ESTADO[e];
      expect(etiqueta, `falta la etiqueta de ${e}`).toBeTruthy();
      expect(etiqueta).not.toBe(e);
      expect(etiqueta).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("el recorrido nombra EVENTOS y el chip nombra ESTADOS: no son la misma palabra", () => {
    // "Pedida" (pasó) frente a "Pendiente" (está). Mezclarlas hace que el primer paso de la barra
    // diga lo mismo que el chip de al lado y el recorrido deje de leerse como un recorrido.
    expect(pasosDe("PENDING")!.pasos[0]!.etiqueta).toBe("Pedida");
    expect(ETIQUETA_ESTADO.PENDING).toBe("Pendiente");
  });
});
