/**
 * ESTADO DE VOTO EN CLIENTE — el store compartido y el cálculo del estado del botón.
 *
 * Misma regla que en 3A: todo lo que decide algo vive fuera de React para poder ponerlo en rojo aquí
 * (los tests corren en Node sin DOM). El componente solo se suscribe y pinta.
 *
 * Con dientes:
 *  - votar / mover / quitar dejan el estado Y el delta del recuento correctos, en las DOS
 *    participaciones cuando hay movimiento.
 *  - el optimismo se DESHACE entero si el servidor dice que no: nada de contador movido con botón sin
 *    cambiar, ni "Votado" que no existe en el servidor.
 *  - `requiere-mover` no es un error: revierte y devuelve la señal con `votoActualEn` para el diálogo.
 *  - el copy que se enseña es el HUMANO del servidor, nunca el código.
 *  - el estado del botón se deriva del payload: correcto EN LA CARGA, no tras el primer tap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MSG_VOTO_SIN_VER } from "../src/config/constants";
import {
  accionQuitar,
  accionVotar,
  deltaDe,
  estadoBoton,
  olvidarVotos,
  suscribirVotos,
  type TransporteVoto,
  votoEnReto,
  votoVisible,
} from "../src/lib/voto-cliente";

const RETO = "reto-1";
const A = "sub-a";
const B = "sub-b";

/** Respuesta del endpoint de voto, con la forma que devuelve `cliente-http`. */
const ok = (data: unknown = { estado: "votado" }) => ({ ok: true, status: 200, code: "", data });
const err = (code: string, message: string, status = 409) => ({
  ok: false,
  status,
  code,
  data: { error: { code, message } },
});

function transporte(
  respuestas: Partial<{
    votar: ReturnType<typeof ok> | ReturnType<typeof err> | Error;
    quitar: ReturnType<typeof ok> | ReturnType<typeof err> | Error;
  }> = {},
) {
  const llamadas: { verbo: string; id: string; permitirMover?: boolean }[] = [];
  const responder = (r: unknown) => {
    if (r instanceof Error) throw r;
    return r as ReturnType<typeof ok>;
  };
  const t: TransporteVoto = {
    votar: vi.fn(async (id: string, permitirMover: boolean) => {
      llamadas.push({ verbo: "votar", id, permitirMover });
      return responder(respuestas.votar ?? ok());
    }),
    quitar: vi.fn(async (id: string) => {
      llamadas.push({ verbo: "quitar", id });
      return responder(respuestas.quitar ?? ok({ estado: "quitado" }));
    }),
  };
  return { transporte: t, llamadas };
}

beforeEach(() => olvidarVotos());
afterEach(() => olvidarVotos());

describe("estado inicial desde el payload, SIN escribir en el render", () => {
  it("el botón nace pintado: sin store, manda el payload (no hay parpadeo)", () => {
    // `votoVisible` es PURA: la vista la llama en cada render sin tocar estado compartido. Y devuelve
    // el valor bueno desde el PRIMER render, así que no hay un fotograma con el botón equivocado.
    expect(votoVisible(RETO, A)).toBe(A);
    expect(votoVisible(RETO, null)).toBeNull();
    expect(votoEnReto(RETO)).toBeUndefined(); // ...y leerlo NO ha sembrado nada
    expect(deltaDe(A)).toBe(0); // el recuento del payload YA lo incluye: el delta es solo lo TUYO
  });

  it("un voto QUITADO no resucita con el payload", async () => {
    // El `null` del store ("sé que no tienes voto") NO es lo mismo que `undefined` ("no sé"). Con un
    // `votoEnReto(reto) ?? miVoto` los dos caerían al payload y el botón volvería a "Votado".
    const { transporte: t } = transporte();
    await accionQuitar({ retoId: RETO, participacionId: A, miVoto: A }, { transporte: t });

    expect(votoEnReto(RETO)).toBeNull();
    expect(votoVisible(RETO, A)).toBeNull();
  });

  it("lo que el usuario acaba de hacer manda sobre el payload de la carga", async () => {
    await accionVotar({ retoId: RETO, participacionId: A, miVoto: null }, transporte());

    // Otro montaje del botón (abrir el modal tras votar en el rail) llega con el valor de la CARGA.
    expect(votoVisible(RETO, null)).toBe(A); // si el payload pisara, volvería a "Votar"
    expect(deltaDe(A)).toBe(1);
  });

  it("la siembra perezosa conserva el ORIGEN del movimiento", async () => {
    // Primera acción de la página: el store no sabe nada, y el origen solo puede salir del payload.
    // Sin sembrar antes de aplicar, el contador de A se quedaría alto.
    const { transporte: t } = transporte({ votar: ok({ estado: "movido" }) });
    await accionVotar(
      { retoId: RETO, participacionId: B, permitirMover: true, miVoto: A },
      { transporte: t },
    );

    expect(votoEnReto(RETO)).toBe(B);
    expect(deltaDe(A)).toBe(-1);
    expect(deltaDe(B)).toBe(1);
  });

  it("la siembra NO pisa el estado ya vivo aunque el payload venga viejo", async () => {
    await accionVotar({ retoId: RETO, participacionId: A, miVoto: null }, transporte());
    // Segunda acción con un payload obsoleto (el del primer render, que decía "sin voto").
    const { transporte: t } = transporte({ votar: ok({ estado: "movido" }) });
    await accionVotar(
      { retoId: RETO, participacionId: B, permitirMover: true, miVoto: null },
      { transporte: t },
    );

    expect(votoEnReto(RETO)).toBe(B);
    expect(deltaDe(A)).toBe(0); // +1 del voto y −1 del movimiento: cuadra
    expect(deltaDe(B)).toBe(1);
  });

  it("avisa a los suscritos (la celda y el modal se enteran a la vez)", async () => {
    const oyente = vi.fn();
    const baja = suscribirVotos(oyente);
    await accionVotar({ retoId: RETO, participacionId: A, miVoto: null }, transporte());
    expect(oyente).toHaveBeenCalled();
    baja();
  });
});

describe("votar", () => {
  it("deja el voto y suma 1 al recuento", async () => {
    const { transporte: t, llamadas } = transporte();

    expect(
      await accionVotar({ retoId: RETO, participacionId: A, miVoto: null }, { transporte: t }),
    ).toEqual({ estado: "hecho" });
    expect(votoEnReto(RETO)).toBe(A);
    expect(deltaDe(A)).toBe(1);
    // Sin consentimiento explícito NO se pide mover.
    expect(llamadas).toEqual([{ verbo: "votar", id: A, permitirMover: false }]);
  });

  it("votar la que ya tienes votada no vuelve a llamar ni recuenta", async () => {
    const { transporte: t } = transporte();

    expect(
      await accionVotar({ retoId: RETO, participacionId: A, miVoto: A }, { transporte: t }),
    ).toEqual({ estado: "hecho" });
    expect(t.votar).not.toHaveBeenCalled();
    expect(deltaDe(A)).toBe(0);
  });

  it("dos pulsaciones seguidas en el mismo reto no lanzan dos peticiones", async () => {
    const { transporte: t } = transporte();
    const [r1, r2] = await Promise.all([
      accionVotar({ retoId: RETO, participacionId: A, miVoto: null }, { transporte: t }),
      accionVotar({ retoId: RETO, participacionId: B, miVoto: null }, { transporte: t }),
    ]);
    expect([r1.estado, r2.estado].sort()).toEqual(["hecho", "ocupado"]);
    expect(t.votar).toHaveBeenCalledTimes(1);
  });
});

describe("mover", () => {
  it("sin consentimiento: revierte y devuelve la señal con DÓNDE está el voto", async () => {
    // El cliente cree que no ha votado (payload `null`); el servidor sabe que sí.
    const { transporte: t } = transporte({
      votar: ok({ estado: "requiere-mover", votoActualEn: A, mensaje: "Ya has votado otra." }),
    });

    const r = await accionVotar(
      { retoId: RETO, participacionId: B, miVoto: null },
      { transporte: t },
    );

    expect(r).toEqual({
      estado: "requiere-mover",
      votoActualEn: A,
      mensaje: "Ya has votado otra.",
    });
    // Y el optimismo se DESHACE: nada de dejar "Votado" en B mientras se pregunta.
    expect(deltaDe(B)).toBe(0);
    expect(votoEnReto(RETO)).toBeNull();
  });

  it("con consentimiento: −1 en el origen y +1 aquí, en una sola acción", async () => {
    const { transporte: t, llamadas } = transporte({ votar: ok({ estado: "movido" }) });

    const r = await accionVotar(
      { retoId: RETO, participacionId: B, permitirMover: true, miVoto: A },
      { transporte: t },
    );

    expect(r).toEqual({ estado: "hecho" });
    expect(votoEnReto(RETO)).toBe(B);
    expect(deltaDe(A)).toBe(-1);
    expect(deltaDe(B)).toBe(1);
    expect(llamadas).toEqual([{ verbo: "votar", id: B, permitirMover: true }]);
  });

  it("mover y volver deja los deltas a cero (no acumula fantasmas)", async () => {
    const { transporte: t } = transporte({ votar: ok({ estado: "movido" }) });

    await accionVotar(
      { retoId: RETO, participacionId: B, permitirMover: true, miVoto: A },
      { transporte: t },
    );
    await accionVotar({ retoId: RETO, participacionId: A, permitirMover: true }, { transporte: t });

    expect(votoEnReto(RETO)).toBe(A);
    expect(deltaDe(A)).toBe(0);
    expect(deltaDe(B)).toBe(0);
  });
});

describe("quitar", () => {
  it("quita el voto y resta 1", async () => {
    const { transporte: t } = transporte();

    expect(
      await accionQuitar({ retoId: RETO, participacionId: A, miVoto: A }, { transporte: t }),
    ).toEqual({ estado: "hecho" });
    expect(votoEnReto(RETO)).toBeNull();
    expect(deltaDe(A)).toBe(-1);
  });

  it("quitar donde NO tienes el voto no toca nada ni llama", async () => {
    const { transporte: t } = transporte();

    await accionQuitar({ retoId: RETO, participacionId: B, miVoto: A }, { transporte: t });

    expect(t.quitar).not.toHaveBeenCalled();
    expect(votoEnReto(RETO)).toBe(A);
    expect(deltaDe(B)).toBe(0);
  });

  it("votar y quitar deja el recuento como estaba", async () => {
    const { transporte: t } = transporte();
    await accionVotar({ retoId: RETO, participacionId: A, miVoto: null }, { transporte: t });
    await accionQuitar({ retoId: RETO, participacionId: A }, { transporte: t });
    expect(deltaDe(A)).toBe(0);
    expect(votoEnReto(RETO)).toBeNull();
  });
});

describe("el optimismo se deshace ENTERO cuando el servidor dice que no", () => {
  it.each([
    ["el reto está cerrado", err("RETO_CERRADO", "Este reto ya no admite votos.")],
    ["es tu propia participación", err("AUTOVOTO", "No puedes votar tu propia participación.")],
    ["la participación ya no existe", err("NOT_FOUND", "Vídeo no disponible.", 404)],
    ["la red se cae", new Error("network")],
  ])("%s -> ni voto ni delta, y copy HUMANO", async (_caso, respuesta) => {
    const { transporte: t } = transporte({ votar: respuesta });

    const r = await accionVotar(
      { retoId: RETO, participacionId: A, miVoto: null },
      { transporte: t },
    );

    expect(r.estado).toBe("rechazado");
    expect(votoEnReto(RETO)).toBeNull();
    expect(deltaDe(A)).toBe(0);
    // Copy humano, nunca el código: el mensaje no puede ser "RETO_CERRADO".
    const mensaje = "mensaje" in r ? r.mensaje : "";
    expect(mensaje).not.toMatch(/^[A-Z_]+$/);
    expect(mensaje.length).toBeGreaterThan(10);
  });

  it("un movimiento fallido devuelve el voto a su sitio, con los dos deltas", async () => {
    const { transporte: t } = transporte({
      votar: err("RETO_CERRADO", "Este reto ya no admite votos."),
    });

    await accionVotar(
      { retoId: RETO, participacionId: B, permitirMover: true, miVoto: A },
      { transporte: t },
    );

    expect(votoEnReto(RETO)).toBe(A);
    expect(deltaDe(A)).toBe(0); // no se queda con el −1 del optimismo
    expect(deltaDe(B)).toBe(0);
  });

  it("un quitar fallido deja el voto donde estaba", async () => {
    const { transporte: t } = transporte({
      quitar: err("RETO_CERRADO", "Este reto ya no admite votos."),
    });

    await accionQuitar({ retoId: RETO, participacionId: A, miVoto: A }, { transporte: t });

    expect(votoEnReto(RETO)).toBe(A);
    expect(deltaDe(A)).toBe(0);
  });

  it("el gate caducado se distingue del resto: pide reproducir, no reintentar", async () => {
    const { transporte: t } = transporte({ votar: err("SIN_VER", MSG_VOTO_SIN_VER) });

    const r = await accionVotar(
      { retoId: RETO, participacionId: A, miVoto: null },
      { transporte: t },
    );

    expect(r).toEqual({ estado: "sin-ver", mensaje: MSG_VOTO_SIN_VER });
    expect(deltaDe(A)).toBe(0);
  });
});

describe("qué pinta el botón (derivado, nunca guardado)", () => {
  const base = {
    retoAbierto: true,
    haySesion: true,
    visto: true,
    votoActual: null as string | null | undefined,
    participacionId: A,
  };

  it("con el payload correcto, el botón nace bien: no hace falta un tap para saberlo", () => {
    expect(estadoBoton({ ...base, votoActual: A })).toBe("votado");
    expect(estadoBoton({ ...base, votoActual: B })).toBe("votar"); // votado en OTRA: aquí se ofrece votar
    expect(estadoBoton({ ...base, votoActual: null })).toBe("votar");
  });

  it("sin marca de visto NO ofrece votar (nada de dejar pulsar y que el servidor lo tumbe)", () => {
    expect(estadoBoton({ ...base, visto: false })).toBe("sin-ver");
  });

  it("un invitado va a iniciar sesión, no a un botón muerto", () => {
    expect(estadoBoton({ ...base, haySesion: false })).toBe("invitado");
  });

  it("el reto cerrado manda sobre todo lo demás", () => {
    // Incluso para un invitado: decirle "inicia sesión" para algo que ya no se puede votar es mentir.
    expect(estadoBoton({ ...base, retoAbierto: false, haySesion: false })).toBe("cerrado");
    expect(estadoBoton({ ...base, retoAbierto: false, votoActual: A })).toBe("cerrado");
    // Y también sobre "es tuya", que es el ÚNICO caso que distingue el orden de esas dos guardas:
    // sin esta línea se pueden intercambiar y nada se pone rojo (comprobado rompiéndolo).
    expect(estadoBoton({ ...base, retoAbierto: false, esMia: true })).toBe("cerrado");
  });

  it("tu propia participación no se vota", () => {
    expect(estadoBoton({ ...base, esMia: true })).toBe("no-votable");
  });

  it("quitar tu voto NO exige visto: la marca caduca antes que el voto", () => {
    // Si lo exigiera, el usuario se quedaría atrapado con un voto que no puede retirar.
    expect(estadoBoton({ ...base, visto: false, votoActual: A })).toBe("votado");
  });
});
