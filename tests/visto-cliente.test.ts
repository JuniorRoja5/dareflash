/**
 * GATE DE "VISTO", LADO CLIENTE — medida de reproducción real + marca en el servidor.
 *
 * Toda la decisión vive en `lib/visto-cliente` justamente para poder probarla aquí: los tests corren en
 * Node sin DOM, así que lo que quedara dentro de un `useEffect` no se podría poner en rojo. Lo único
 * que queda en el reproductor es `addEventListener("timeupdate", …)`.
 *
 * Con dientes:
 *  - a los `VISTO_SEGUNDOS_MINIMOS` de reproducción se llama al endpoint UNA vez, y seguir viendo NO
 *    vuelve a llamar (idempotencia del cliente, no solo del servidor).
 *  - PAUSAR no acumula: se mide el avance del vídeo, no el reloj de pared. Tampoco acumula un SEEK ni
 *    el salto del bucle.
 *  - sin sesión NO se llama.
 *  - un fallo de la llamada no lanza (el vídeo se ve pase lo que pase) y NO deja el estado local en
 *    "vista" —eso habilitaría el botón de voto para que el gate del servidor lo tumbara al pulsar—,
 *    pero SÍ permite un reintento acotado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VISTO_SEGUNDOS_MINIMOS } from "../src/config/constants";
import {
  crearMarcadorVisto,
  crearVigilanteVisto,
  estaVista,
  marcarVista,
  olvidarVistas,
  SALTO_MAX_SEG,
  suscribirVistas,
} from "../src/lib/visto-cliente";

const SUB = "sub-1";

/** Envío falso. `respuesta` decide qué contesta el "servidor"; `urls` deja contar las llamadas. */
function envioFalso(
  respuesta: { ok: boolean; status: number } | Error = { ok: true, status: 200 },
) {
  const llamadas: string[] = [];
  const enviar = vi.fn(async (id: string) => {
    llamadas.push(id);
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
  return { enviar, llamadas };
}

/** Simula reproducción CONTINUA: N muestras de `timeupdate` a 250 ms de vídeo, como un navegador. */
function reproducir(
  destino: { tiempo(t: number): void },
  segundos: number,
  desde = 0,
  paso = 0.25,
): number {
  let t = desde;
  for (let i = 0; i < Math.round(segundos / paso); i += 1) {
    t += paso;
    destino.tiempo(t);
  }
  return t;
}

beforeEach(() => {
  olvidarVistas();
});
afterEach(() => {
  olvidarVistas();
});

describe("medida de reproducción REAL (no reloj de pared)", () => {
  it("avisa al cruzar el umbral, y UNA sola vez por mucho que se siga viendo", async () => {
    const alCumplir = vi.fn();
    const v = crearVigilanteVisto({ alCumplir });

    const t = reproducir(v, VISTO_SEGUNDOS_MINIMOS - 0.5);
    expect(alCumplir).not.toHaveBeenCalled(); // aún no llega

    reproducir(v, 30, t); // sigue viendo un buen rato
    expect(alCumplir).toHaveBeenCalledTimes(1); // ni cero, ni una por cada evento
  });

  it("PAUSAR no acumula: el tiempo parado no cuenta", () => {
    const alCumplir = vi.fn();
    const v = crearVigilanteVisto({ alCumplir });

    const t = reproducir(v, VISTO_SEGUNDOS_MINIMOS - 1);
    // Pausa: el <video> deja de emitir `timeupdate` y `currentTime` NO avanza. Si al reanudar se
    // contara el hueco (reloj de pared), esto ya habría cruzado el umbral.
    v.tiempo(t);
    v.tiempo(t);
    v.tiempo(t);
    expect(alCumplir).not.toHaveBeenCalled();
    expect(v.acumulado).toBeLessThan(VISTO_SEGUNDOS_MINIMOS);

    reproducir(v, 1.5, t); // al reanudar, sigue sumando desde donde estaba
    expect(alCumplir).toHaveBeenCalledTimes(1);
  });

  it("un SEEK no da crédito: arrastrar la barra no es ver el vídeo", () => {
    const alCumplir = vi.fn();
    const v = crearVigilanteVisto({ alCumplir });

    v.tiempo(0.25);
    v.tiempo(600); // salto al final
    v.tiempo(600.25);
    expect(alCumplir).not.toHaveBeenCalled();
    expect(v.acumulado).toBeLessThan(1);
  });

  it("el salto del BUCLE (el feed repite) tampoco acumula", () => {
    const alCumplir = vi.fn();
    const v = crearVigilanteVisto({ alCumplir });

    reproducir(v, VISTO_SEGUNDOS_MINIMOS - 1);
    const acumuladoAntes = v.acumulado;
    v.tiempo(0); // vuelta al principio: avance NEGATIVO
    expect(v.acumulado).toBe(acumuladoAntes); // no suma... y tampoco resta
    expect(alCumplir).not.toHaveBeenCalled();
  });

  it("un hueco mayor que el salto natural se descarta (pestaña en segundo plano)", () => {
    const v = crearVigilanteVisto({ alCumplir: vi.fn() });
    v.tiempo(1);
    v.tiempo(1 + SALTO_MAX_SEG + 0.1);
    expect(v.acumulado).toBe(0);

    const v2 = crearVigilanteVisto({ alCumplir: vi.fn() });
    v2.tiempo(1);
    v2.tiempo(1 + SALTO_MAX_SEG); // justo en el límite: SÍ cuenta
    expect(v2.acumulado).toBeCloseTo(SALTO_MAX_SEG, 5);
  });
});

describe("marcar en el servidor", () => {
  it("marca, deja el estado local en `vista` y avisa a los suscritos", async () => {
    const { enviar, llamadas } = envioFalso();
    const oyente = vi.fn();
    const baja = suscribirVistas(oyente);

    expect(estaVista(SUB)).toBe(false);
    expect(await marcarVista(SUB, { haySesion: true, enviar })).toBe("marcada");

    expect(llamadas).toEqual([SUB]);
    expect(estaVista(SUB)).toBe(true);
    expect(oyente).toHaveBeenCalledTimes(1); // la Pieza 3B se entera sin ir al servidor
    baja();
  });

  it("SIN SESIÓN no se llama al endpoint", async () => {
    const { enviar } = envioFalso();
    expect(await marcarVista(SUB, { haySesion: false, enviar })).toBe("sin-sesion");
    expect(enviar).not.toHaveBeenCalled();
    expect(estaVista(SUB)).toBe(false);
  });

  it("no repite la llamada de una participación ya marcada", async () => {
    const { enviar } = envioFalso();
    await marcarVista(SUB, { haySesion: true, enviar });
    expect(await marcarVista(SUB, { haySesion: true, enviar })).toBe("ya-estaba");
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("dos avisos SIMULTÁNEOS de la misma hacen un solo POST", async () => {
    const { enviar } = envioFalso();
    const [a, b] = await Promise.all([
      marcarVista(SUB, { haySesion: true, enviar }),
      marcarVista(SUB, { haySesion: true, enviar }),
    ]);
    expect([a, b].sort()).toEqual(["en-vuelo", "marcada"]);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("cada participación se marca por separado", async () => {
    const { enviar } = envioFalso();
    await marcarVista("sub-a", { haySesion: true, enviar });
    expect(estaVista("sub-a")).toBe(true);
    expect(estaVista("sub-b")).toBe(false);
  });

  it.each([
    ["una excepción de red", new Error("network")],
    ["un 500 del servidor", { ok: false, status: 500 }],
  ])("%s NO lanza y NO deja el estado local en `vista`", async (_caso, respuesta) => {
    const { enviar } = envioFalso(respuesta as { ok: boolean; status: number } | Error);

    // Que no lance es el invariante: el usuario está VIENDO un vídeo, no operando.
    expect(await marcarVista(SUB, { haySesion: true, enviar })).toBe("fallo");
    // Y que no mienta: si el servidor no tiene la marca, el botón de voto no puede creer que sí.
    expect(estaVista(SUB)).toBe(false);
  });

  it("un 4xx se DESCARTA (no se reintenta), pero un 429 sí es reintentable", async () => {
    expect(
      await marcarVista(SUB, {
        haySesion: true,
        enviar: envioFalso({ ok: false, status: 404 }).enviar,
      }),
    ).toBe("descartada");
    expect(
      await marcarVista(SUB, {
        haySesion: true,
        enviar: envioFalso({ ok: false, status: 429 }).enviar,
      }),
    ).toBe("fallo");
  });
});

describe("marcador completo (lo que consume el reproductor)", () => {
  it("reproducir el mínimo dispara UNA llamada; seguir viendo no dispara más", async () => {
    const { enviar } = envioFalso();
    const m = crearMarcadorVisto(SUB, { haySesion: true, enviar });

    const t = reproducir(m, VISTO_SEGUNDOS_MINIMOS + 0.5);
    await vi.waitFor(() => expect(estaVista(SUB)).toBe(true));

    reproducir(m, 60, t); // un minuto más de vídeo
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("sin sesión, ver el vídeo entero no llama ni una vez", async () => {
    const { enviar } = envioFalso();
    const m = crearMarcadorVisto(SUB, { haySesion: false, enviar });

    reproducir(m, VISTO_SEGUNDOS_MINIMOS * 10);

    expect(enviar).not.toHaveBeenCalled();
    expect(estaVista(SUB)).toBe(false);
  });

  it("un fallo se reintenta tras otro tramo de reproducción, pero ACOTADO", async () => {
    // El servidor está caído: sin tope, un vídeo en bucle dispararía una petición cada pocos segundos
    // para siempre.
    const { enviar } = envioFalso({ ok: false, status: 500 });
    const m = crearMarcadorVisto(SUB, { haySesion: true, enviar, reintentos: 1 });

    let t = reproducir(m, VISTO_SEGUNDOS_MINIMOS + 0.5);
    // El rearme ocurre cuando la promesa del envío se resuelve, no cuando se lanza: se espera a que el
    // contador vuelva a cero, que es la señal observable de que hay otro intento armado.
    await vi.waitFor(() => expect(m.acumulado).toBe(0));
    expect(enviar).toHaveBeenCalledTimes(1);

    t = reproducir(m, VISTO_SEGUNDOS_MINIMOS + 0.5, t); // segundo tramo -> reintenta
    await vi.waitFor(() => expect(enviar).toHaveBeenCalledTimes(2));

    reproducir(m, VISTO_SEGUNDOS_MINIMOS * 5, t); // y a partir de ahí, se rinde
    await new Promise((r) => setTimeout(r, 20));
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("lo DESCARTADO no se reintenta aunque se siga viendo", async () => {
    // Un 404 (participación retirada) no se arregla reproduciendo más: machacar el endpoint no ayuda.
    const { enviar } = envioFalso({ ok: false, status: 404 });
    const m = crearMarcadorVisto(SUB, { haySesion: true, enviar, reintentos: 5 });

    const t = reproducir(m, VISTO_SEGUNDOS_MINIMOS + 0.5);
    await vi.waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(m.acumulado).toBeGreaterThan(0); // NO se rearmó: no hay otro intento en camino

    reproducir(m, VISTO_SEGUNDOS_MINIMOS * 5, t);
    await new Promise((r) => setTimeout(r, 20));
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

describe("la constante es de fuente única", () => {
  it("el umbral por defecto es `VISTO_SEGUNDOS_MINIMOS`, no un número escrito en el sitio", () => {
    const alCumplir = vi.fn();
    const v = crearVigilanteVisto({ alCumplir });

    reproducir(v, VISTO_SEGUNDOS_MINIMOS - 0.5);
    expect(alCumplir).not.toHaveBeenCalled();
    reproducir(v, 1, VISTO_SEGUNDOS_MINIMOS - 0.5);
    expect(alCumplir).toHaveBeenCalledTimes(1);
  });
});
