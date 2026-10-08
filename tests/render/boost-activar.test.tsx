/**
 * DESTACAR MI PERFIL — render real del botón que gasta un Boost.
 *
 *  - UN TOKEN POR INTENCIÓN. El doble clic manda el MISMO token (eso es lo que hace el reintento
 *    inofensivo), y sólo tras un éxito se renueva. Con un token nuevo por envío, un doble clic
 *    cuesta dos Boosts.
 *  - SIN SALDO NO HAY BOTÓN, y con el límite gastado está deshabilitado CON su motivo atado.
 *  - `sin-saldo` y `limite` llegan con 200: se enseña su copy, no un "ha fallado algo".
 *  - UN SOLO MAGENTA EN LA PANTALLA, y cuál depende de lo que la persona tiene. Esto es un test de
 *    COMPOSICIÓN: cada pieza por separado pasaba sus guards, y lo que puede romperse es el conjunto
 *    (dos botones principales a la vez, o ninguno).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/cliente-http", async (orig) => ({
  ...(await orig<typeof import("@/lib/cliente-http")>()),
  postJsonCsrf: mocks.post,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { ActivarBoost } from "@/app/(app)/(shell)/boosts/activar-boost";
import { HeroBoosts } from "@/app/(app)/(shell)/boosts/hero-boosts";
import { PaquetesBoost } from "@/app/(app)/(shell)/boosts/paquetes-boost";
import { BOOST_DAILY_LIMIT, BOOST_DURACION_MIN } from "@/config/constants";
import { duracionBoostHumana } from "@/lib/boost-duracion";

const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, code: "", data });

beforeEach(() => {
  mocks.post.mockReset().mockResolvedValue(ok({ estado: "activado", saldo: 2, usadasHoy: 1 }));
  mocks.refresh.mockReset();
});
afterEach(cleanup);

const montar = (props: Partial<Parameters<typeof ActivarBoost>[0]> = {}) =>
  render(<ActivarBoost saldo={3} usadasHoy={0} vigenteHastaMs={null} {...props} />);

const boton = () => screen.getByRole("button", { name: /Destacar|Destacando/ });

describe("el token es por INTENCIÓN, no por envío", () => {
  it("un doble clic manda el MISMO token", async () => {
    // Nunca resuelve: el botón se queda ocupado, como mientras viaja la petición de verdad.
    mocks.post.mockReturnValue(new Promise(() => {}));
    montar();

    fireEvent.click(boton());
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    fireEvent.click(boton());

    // El botón está deshabilitado mientras envía, así que el segundo clic no llega. Y si llegara
    // (una pulsación de teclado, un `form` raro), sería con el mismo token: no puede gastar dos.
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it("y tras un ÉXITO se renueva: destacar otra vez es otra intención", async () => {
    montar();

    fireEvent.click(boton());
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const primero = (mocks.post.mock.calls[0]?.[1] as { token: string }).token;

    fireEvent.click(boton());
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    const segundo = (mocks.post.mock.calls[1]?.[1] as { token: string }).token;

    expect(primero).toBeTruthy();
    expect(segundo).not.toBe(primero);
  });

  it("tras un FALLO NO se renueva: reintentar no puede duplicar", async () => {
    mocks.post.mockResolvedValue(ok({ estado: "sin-saldo", mensaje: "No te quedan Boosts." }));
    montar();

    fireEvent.click(boton());
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    fireEvent.click(boton());
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));

    const a = (mocks.post.mock.calls[0]?.[1] as { token: string }).token;
    const b = (mocks.post.mock.calls[1]?.[1] as { token: string }).token;
    expect(b, "un reintento con token nuevo gastaría dos Boosts").toBe(a);
  });

  it("el cuerpo lleva SOLO el token: quién activa lo decide el servidor", async () => {
    montar();
    fireEvent.click(boton());
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());

    expect(mocks.post.mock.calls[0]?.[0]).toBe("/api/boost/activar");
    expect(Object.keys(mocks.post.mock.calls[0]?.[1] as object)).toEqual(["token"]);
  });
});

describe("qué se ve según el estado", () => {
  it("SIN saldo no hay botón: lo que hay que hacer es comprar, y eso está debajo", () => {
    montar({ saldo: 0 });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("con el límite del día gastado, deshabilitado y con el motivo ATADO", () => {
    montar({ usadasHoy: BOOST_DAILY_LIMIT });
    expect(boton()).toHaveProperty("disabled", true);

    const id = boton().getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    const motivo = document.getElementById(id!)?.textContent ?? "";
    expect(motivo).toContain(String(BOOST_DAILY_LIMIT));
    // Y dice la verdad del corte: medianoche UTC, no "mañana".
    expect(motivo).toMatch(/UTC/);
    expect(motivo).not.toMatch(/mañana/i);
  });

  it("y pulsarlo con el límite gastado no llama a nada", () => {
    montar({ usadasHoy: BOOST_DAILY_LIMIT });
    fireEvent.click(boton());
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("si ya estás destacado, se AVISA del desperdicio en vez de prohibirlo", () => {
    // El producto no tiene una regla de "uno a la vez": las reglas son el saldo y el límite diario.
    // Inventar aquí un bloqueo que nadie ha decidido sería peor que decir lo que cuesta.
    montar({ vigenteHastaMs: Date.now() + 10 * 60_000 });
    expect(boton()).toHaveProperty("disabled", false);
    expect(screen.getByText(/Ya estás destacado ahora mismo/)).toBeTruthy();
    expect(screen.getByText(/se gasta un Boost/)).toBeTruthy();
  });

  it("la duración que promete sale de la constante", () => {
    montar();
    expect(screen.getByText(new RegExp(duracionBoostHumana(BOOST_DURACION_MIN)))).toBeTruthy();
  });
});

describe("lo que responde el servidor se dice tal cual", () => {
  it("un éxito se confirma y repinta desde el servidor", async () => {
    montar();
    fireEvent.click(boton());

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toMatch(/destacado/i);
    // El saldo y las apariciones de hoy las sabe el servidor, no este componente.
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("`repetida` NO es un error: se dice que ya estaba hecho", async () => {
    mocks.post.mockResolvedValue(ok({ estado: "repetida" }));
    montar();
    fireEvent.click(boton());

    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toMatch(/ya estaba/i);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("`sin-saldo` y `limite` enseñan SU mensaje, no uno inventado aquí", async () => {
    for (const mensaje of ["No te quedan Boosts. Compra uno.", "Ya has destacado 3 veces hoy."]) {
      cleanup();
      mocks.post.mockResolvedValue(ok({ estado: "limite", mensaje }));
      montar();
      fireEvent.click(boton());
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(mensaje));
    }
  });

  it("una excepción de red se dice, y dice que reintentar es seguro", async () => {
    mocks.post.mockRejectedValue(new Error("fetch falló"));
    montar();
    fireEvent.click(boton());

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/no se repetirá/i);
    // Y se puede volver a intentar: un botón muerto tras un fallo de red deja sin salida.
    expect(boton()).toHaveProperty("disabled", false);
  });

  it("hay UNA sola región de aviso, no una por estado", async () => {
    mocks.post.mockResolvedValue(ok({ estado: "limite", mensaje: "Tope." }));
    montar();
    fireEvent.click(boton());
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
  });
});

/**
 * EL TEST DE COMPOSICIÓN. Lo que se rompe cuando dos piezas correctas se juntan: el sistema reserva
 * `--df-action` para UNA acción por pantalla, y ahora la pantalla tiene dos candidatas (destacar y
 * comprar). Ninguno de los tests de arriba, ni los de los paquetes, ve el conjunto.
 */
describe("un solo magenta en la pantalla, y el que toca", () => {
  /** Los botones de relleno sólido del acento: `bg-action` es lo que pinta `botonTokens`. */
  const magentas = () =>
    [...document.querySelectorAll("button")].filter((b) => b.className.includes("bg-action"));

  const pantalla = (saldo: number) =>
    render(
      <>
        <HeroBoosts saldo={saldo} usadasHoy={0} vigenteHastaMs={null} />
        <PaquetesBoost puedeComprar cedeElAcento={saldo > 0} />
      </>,
    );

  it("CON saldo, el magenta es DESTACAR y los paquetes ceden", () => {
    pantalla(3);
    expect(magentas()).toHaveLength(1);
    expect(magentas()[0]!.textContent).toMatch(/Destacar/);
  });

  it("SIN saldo, el magenta es COMPRAR el paquete recomendado", () => {
    pantalla(0);
    expect(magentas()).toHaveLength(1);
    expect(magentas()[0]!.textContent).toMatch(/Comprar/);
    // Y está en la tarjeta del recomendado, no en una cualquiera.
    expect(document.querySelector("[data-mejor='si']")!.contains(magentas()[0]!)).toBe(true);
  });

  it("nunca hay dos, y nunca hay cero", () => {
    for (const saldo of [0, 1, 7]) {
      cleanup();
      pantalla(saldo);
      expect(magentas(), `con saldo ${saldo}`).toHaveLength(1);
    }
  });
});
