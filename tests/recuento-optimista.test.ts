/**
 * RECUENTO MOSTRADO — el número que ve el usuario nunca puede ser IMPOSIBLE.
 *
 * Bug real, encontrado en producción: la BD estaba bien y el fallo era del cliente. El delta optimista
 * era COMPARTIDO entre superficies pero cada una pintaba `su_total + delta`, así que:
 *  (a) si llegaba un payload FRESCO cuyo total YA incluía el voto, se le volvía a sumar el delta -> 2
 *      donde debía haber 1;
 *  (b) dos superficies con totales capturados en momentos distintos compartían el mismo delta, así que
 *      la del total menor podía bajar de cero -> −1, que no existe.
 *
 * La raíz es que un delta es RELATIVO a un total concreto, y aquí se aplicaba a totales de otra
 * pantalla. El arreglo deja de acumular nada: cada superficie reconcilia contra SU propio total usando
 * el `miVoto` que ya trae en su payload —que le dice si ese total ya contaba su voto—, así que el
 * resultado es ABSOLUTO e idempotente.
 *
 * Estos dos primeros casos son la REPRODUCCIÓN: fallan contra el mecanismo viejo.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  accionQuitar,
  accionVotar,
  olvidarVotos,
  type TransporteVoto,
  votosMostrados,
} from "../src/lib/voto-cliente";

const RETO = "reto-1";
const A = "sub-a";
const B = "sub-b";

const transporte = (data: unknown = { estado: "votado" }): { transporte: TransporteVoto } => ({
  transporte: {
    votar: async () => ({ ok: true, status: 200, code: "", data }),
    quitar: async () => ({ ok: true, status: 200, code: "", data: { estado: "quitado" } }),
  },
});

beforeEach(() => olvidarVotos());
afterEach(() => olvidarVotos());

describe("(a) un payload FRESCO no se cuenta dos veces", () => {
  it("tras votar, una superficie cuyo total YA incluye el voto muestra 1, no 2", async () => {
    // Superficie 1: el usuario vota. Su payload decía 0 votos y ningún voto suyo.
    await accionVotar({ retoId: RETO, participacionId: A, miVoto: null }, transporte());
    expect(votosMostrados({ retoId: RETO, participacionId: A, votos: 0, miVoto: null })).toBe(1);

    // Superficie 2: se monta DESPUÉS (otra página del feed, o el modal) con un payload FRESCO que ya
    // refleja el voto: total 1 y `miVoto` apuntando aquí. No hay que sumarle nada más.
    expect(votosMostrados({ retoId: RETO, participacionId: A, votos: 1, miVoto: A })).toBe(1);
  });

  it("sin haber hecho nada, un payload que ya incluye tu voto se muestra tal cual", () => {
    expect(votosMostrados({ retoId: RETO, participacionId: A, votos: 7, miVoto: A })).toBe(7);
  });
});

describe("(b) el recuento nunca es negativo ni imposible", () => {
  it("dos superficies con totales de momentos distintos no se contaminan entre sí", async () => {
    // Escenario real: el detalle se cargó con el voto ya puesto (1, `miVoto` aquí) y una página del
    // feed se cargó ANTES, cuando el total todavía era 0 y no había voto. El usuario quita el voto en
    // el detalle. Con un delta COMPARTIDO, el −1 se le aplica también a la del total 0 -> −1.
    await accionQuitar({ retoId: RETO, participacionId: A, miVoto: A }, transporte());

    const conElVoto = votosMostrados({ retoId: RETO, participacionId: A, votos: 1, miVoto: A });
    const sinElVoto = votosMostrados({ retoId: RETO, participacionId: A, votos: 0, miVoto: null });

    expect(conElVoto).toBe(0); // su total SÍ lo contaba: baja a 0
    expect(sinElVoto).toBe(0); // su total NUNCA lo contó: no puede bajar de ahí
    expect(sinElVoto).toBeGreaterThanOrEqual(0);
  });

  it("nunca devuelve un número negativo, ni con un payload incoherente", async () => {
    // Payload IMPOSIBLE: dice que mi voto está aquí y a la vez que el total es 0 (el servidor nunca
    // debería mandar eso). Si además he quitado el voto, la resta se va por debajo de cero. El suelo
    // existe para eso: ver un número desactualizado es malo; ver uno IMPOSIBLE es peor.
    await accionQuitar({ retoId: RETO, participacionId: A, miVoto: A }, transporte());

    expect(votosMostrados({ retoId: RETO, participacionId: A, votos: 0, miVoto: A })).toBe(0);
    // Y con el payload coherente el suelo no se nota: no está enmascarando nada.
    expect(votosMostrados({ retoId: RETO, participacionId: A, votos: 1, miVoto: A })).toBe(0);
    expect(votosMostrados({ retoId: RETO, participacionId: A, votos: 8, miVoto: A })).toBe(7);
  });
});

describe("mover reconcilia las DOS participaciones, cada una contra su total", () => {
  it("−1 en el origen y +1 en el destino, sin depender de qué pantalla lo hizo", async () => {
    await accionVotar(
      { retoId: RETO, participacionId: B, permitirMover: true, miVoto: A },
      transporte({ estado: "movido" }),
    );

    // Payloads de la carga: A tenía el voto (5, incluido) y B no (3).
    expect(votosMostrados({ retoId: RETO, participacionId: A, votos: 5, miVoto: A })).toBe(4);
    expect(votosMostrados({ retoId: RETO, participacionId: B, votos: 3, miVoto: A })).toBe(4);
  });

  it("es IDEMPOTENTE: recargar con el payload ya movido da lo mismo", async () => {
    await accionVotar(
      { retoId: RETO, participacionId: B, permitirMover: true, miVoto: A },
      transporte({ estado: "movido" }),
    );

    // Payload fresco tras el movimiento: A ya bajó a 4, B ya subió a 4, y `miVoto` apunta a B.
    expect(votosMostrados({ retoId: RETO, participacionId: A, votos: 4, miVoto: B })).toBe(4);
    expect(votosMostrados({ retoId: RETO, participacionId: B, votos: 4, miVoto: B })).toBe(4);
  });
});

describe("participaciones ajenas", () => {
  it("votar en una NO mueve el recuento de otra del mismo reto", async () => {
    await accionVotar({ retoId: RETO, participacionId: A, miVoto: null }, transporte());
    expect(votosMostrados({ retoId: RETO, participacionId: B, votos: 9, miVoto: null })).toBe(9);
  });
});
