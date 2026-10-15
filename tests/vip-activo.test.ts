/**
 * "¿ES VIP?" — EL CHOKEPOINT, y el invariante del que cuelga la Fase 8 entera.
 *
 * ┌─ EL FALLO QUE ESTO IMPIDE ───────────────────────────────────────────────────────────────────┐
 * │ Un `esVip: true` guardado se queda PEGADO: alguien cancela, o un webhook se pierde, y ese    │
 * │ booleano sigue regalando sello dorado, color de nombre y un boost a la semana para siempre   │
 * │ sin que nada falle. Por eso no se guarda: se CALCULA de la fecha hasta la que está pagado.   │
 * │                                                                                               │
 * │ Y por eso el diente de verdad no es "un VIP tiene sello": es FORZAR UNA SUSCRIPCIÓN CON EL   │
 * │ PERIODO YA VENCIDO y comprobar que no tiene nada. Un test que solo mire un flag en `true`    │
 * │ pasaría igual con la implementación mala, que es justo la que hay que descartar.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo a propósito: hacer que `esVipActivo` mire el estado y no la fecha (rojo en el caso
 * del periodo vencido), tratar `CANCELADA` como sin acceso (rojo: cancelar no es cortar), o dejar
 * que `CORTADA` siga dando acceso porque la fecha aún no llegó (rojo).
 */
import { describe, expect, it } from "vitest";

import { ESTADOS_SIN_ACCESO_VIP, EstadoSuscripcionSchema } from "@/config/constants";
import { esVipActivo, estadoDesdeStripe, finDePeriodo, resolverVip } from "../src/lib/vip";

const AHORA = new Date("2026-10-15T12:00:00Z");
const MAÑANA = new Date("2026-10-16T12:00:00Z");
const AYER = new Date("2026-10-14T12:00:00Z");

describe("ser VIP es tener periodo por delante", () => {
  it("con el periodo en el futuro, sí", () => {
    expect(esVipActivo({ estado: "ACTIVA", periodoFin: MAÑANA }, AHORA)).toBe(true);
  });

  it("CON EL PERIODO YA VENCIDO, NO — aunque el estado diga ACTIVA", () => {
    // ESTE es el caso que separa "se calcula" de "se guarda". Una suscripción cuyo webhook de baja
    // se perdió se queda en ACTIVA para siempre; lo que caduca es la fecha, y es la fecha la que
    // manda. Si este caso pasa con un booleano, el booleano está mal.
    expect(esVipActivo({ estado: "ACTIVA", periodoFin: AYER }, AHORA)).toBe(false);
  });

  it("sin suscripción, no", () => {
    expect(esVipActivo(null, AHORA)).toBe(false);
    expect(esVipActivo(undefined, AHORA)).toBe(false);
  });

  it("en el instante EXACTO del fin ya se acabó", () => {
    // Un `>=` regalaría el último milisegundo. No importa por el milisegundo: importa porque deja
    // el borde ambiguo, y un borde ambiguo en una fecha de acceso se discute con un usuario.
    expect(esVipActivo({ estado: "ACTIVA", periodoFin: AHORA }, AHORA)).toBe(false);
    expect(
      esVipActivo({ estado: "ACTIVA", periodoFin: new Date(AHORA.getTime() + 1) }, AHORA),
    ).toBe(true);
  });
});

describe("cancelar no es cortar", () => {
  it("CANCELADA con periodo por delante SIGUE siendo VIP", () => {
    // Está pagado hasta esa fecha y eso es lo prometido: sin prorrateo y sin reembolso. Cortar al
    // pulsar "cancelar" sería quedarse con el dinero del mes y retirar el servicio.
    expect(esVipActivo({ estado: "CANCELADA", periodoFin: MAÑANA }, AHORA)).toBe(true);
  });

  it("y cuando llega la fecha, deja de serlo sin que nadie haga nada", () => {
    expect(esVipActivo({ estado: "CANCELADA", periodoFin: AYER }, AHORA)).toBe(false);
  });

  it("CORTADA no da acceso ni con periodo por delante", () => {
    // Es la única que quita el acceso por sí misma: devolución de cargo o fraude.
    expect(esVipActivo({ estado: "CORTADA", periodoFin: MAÑANA }, AHORA)).toBe(false);
  });

  it("y la lista de estados que cortan está declarada, no deducida", () => {
    expect([...ESTADOS_SIN_ACCESO_VIP]).toEqual(["CORTADA"]);
    // Todos los estados que corten tienen que EXISTIR: una lista con un estado fantasma no corta
    // nada y parece que sí.
    for (const e of ESTADOS_SIN_ACCESO_VIP) {
      expect(EstadoSuscripcionSchema.safeParse(e).success, e).toBe(true);
    }
  });
});

describe("lo que la pantalla puede contar", () => {
  it("un VIP que canceló sabe que termina al final del periodo", () => {
    const r = resolverVip({ estado: "CANCELADA", periodoFin: MAÑANA }, AHORA);
    expect(r).toMatchObject({ activo: true, terminaAlFinal: true, hasta: MAÑANA });
  });

  it("uno que se renueva, no", () => {
    expect(resolverVip({ estado: "ACTIVA", periodoFin: MAÑANA }, AHORA).terminaAlFinal).toBe(false);
  });

  it("y uno ya vencido NO dice 'termina al final': eso ya pasó", () => {
    // Anunciar un final que ya ocurrió es contar un futuro que no existe.
    const r = resolverVip({ estado: "CANCELADA", periodoFin: AYER }, AHORA);
    expect(r.activo).toBe(false);
    expect(r.terminaAlFinal).toBe(false);
  });

  it("y sin suscripción no se inventa nada", () => {
    expect(resolverVip(null, AHORA)).toEqual({
      activo: false,
      terminaAlFinal: false,
      hasta: null,
      estado: null,
    });
  });
});

describe("traducir lo que dice Stripe", () => {
  it("lo que sigue vivo es ACTIVA", () => {
    for (const s of ["active", "trialing", "past_due", "incomplete"]) {
      expect(estadoDesdeStripe(s, false), s).toBe("ACTIVA");
    }
  });

  it("lo que ya no se renueva es CANCELADA", () => {
    for (const s of ["canceled", "unpaid", "incomplete_expired"]) {
      expect(estadoDesdeStripe(s, false), s).toBe("CANCELADA");
    }
  });

  it("la baja pedida MANDA sobre el estado", () => {
    // `active` + baja pedida es nuestra CANCELADA: sigue dando acceso, pero no se renovará, y eso
    // es lo que la pantalla tiene que poder decir.
    expect(estadoDesdeStripe("active", true)).toBe("CANCELADA");
  });

  it("y NUNCA sale CORTADA de aquí: cortar es una decisión humana", () => {
    // Si un `unpaid` transitorio —una tarjeta caducada que se reintenta— pudiera cortar, alguien
    // se quedaría sin VIP a mitad de un mes que ya pagó.
    for (const s of [
      "canceled",
      "unpaid",
      "incomplete_expired",
      "active",
      "paused",
      "lo_que_sea",
    ]) {
      expect(estadoDesdeStripe(s, false), s).not.toBe("CORTADA");
      expect(estadoDesdeStripe(s, true), s).not.toBe("CORTADA");
    }
  });
});

describe("el fin de periodo que manda Stripe", () => {
  it("son segundos, y salen como fecha", () => {
    // La expectativa se DERIVA de la fecha, no se escribe a mano en segundos: calcular el epoch de
    // cabeza es cómo me equivoqué la primera vez, y un test con la cuenta mal acusa al código.
    const fecha = new Date("2026-10-16T00:00:00.000Z");
    expect(finDePeriodo(fecha.getTime() / 1000)?.toISOString()).toBe(fecha.toISOString());
  });

  it("y lo que NO es un número es `null`, nunca una fecha inválida", () => {
    // ┌─ EL CASO REAL ────────────────────────────────────────────────────────────────────────────┐
    // │ `current_period_end` se mudó de la suscripción a sus LÍNEAS al cambiar la versión de la    │
    // │ API. Leerlo del sitio de antes da `undefined`, y `new Date(undefined * 1000)` es un        │
    // │ `Invalid Date` — que se guarda en la columna tan ricamente y deja a alguien con un VIP que │
    // │ no se sabe cuándo acaba. Devolver `null` obliga a quien llama a decidir, y lo que decide   │
    // │ el webhook es no escribir nada y dejarlo dicho en el log.                                  │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    for (const v of [undefined, null, NaN, 0, -1, "1792180800", {}, Infinity]) {
      expect(finDePeriodo(v), JSON.stringify(v) ?? "undefined").toBeNull();
    }
  });

  it("y un número ABSURDO tampoco: ahí es donde nace el `Invalid Date`", () => {
    // ┌─ ESTE CASO FALTABA, Y SE VIO ROMPIENDO ────────────────────────────────────────────────┐
    // │ Al quitar la comprobación final del `NaN`, los casos de arriba seguían verdes: todos    │
    // │ los cazaba la guarda ANTERIOR (no es número, no es finito, no es positivo), así que esa │
    // │ línea no la ejercitaba nadie. Un segundo absurdo —finito y positivo— sí la alcanza:     │
    // │ `new Date(1e18)` se sale del rango de fechas y es `Invalid`, que es justo lo que no     │
    // │ puede acabar guardado como el fin de un acceso de pago.                                 │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    expect(finDePeriodo(1e15)).toBeNull();
  });
});
