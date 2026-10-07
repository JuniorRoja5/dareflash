/**
 * COMPRAR UN PAQUETE DE BOOSTS — render real de la isla de compra.
 *
 * Es el botón que mueve dinero, así que lo que se fija aquí es lo que cuesta caro:
 *
 *  - EL CUERPO LLEVA SOLO `packageId`. Ni el importe ni el número de boosts: el precio lo resuelve
 *    el servidor contra el catálogo. "El pack de 10 por un dólar" no es algo que esta pantalla
 *    impida — es algo que no puede expresar, y este test lo exige mirando el cuerpo entero.
 *  - UNA COMPRA EN VUELO, UNA SOLA. Al pulsar, los tres botones se deshabilitan: un segundo clic
 *    abriría una SEGUNDA sesión de pago en Stripe, y entonces hay dos cobros posibles por un boost.
 *  - SE SALE A LA URL QUE DEVUELVE EL SERVIDOR, tal cual y sin tocarla.
 *  - UN SOLO BOTÓN PRINCIPAL, el del paquete recomendado (`--df-action` es una acción por pantalla).
 *  - BLOQUEADA ES BLOQUEADA: sin correo verificado o sin pagos configurados no se puede ni intentar,
 *    y se dice por qué. Es UX: la barrera de verdad es la ruta.
 *  - LOS FALLOS SE DICEN EN HUMANO. Cero códigos y cero jerga de Stripe en pantalla.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/cliente-http", async (orig) => ({
  ...(await orig<typeof import("@/lib/cliente-http")>()),
  postJsonCsrf: mocks.post,
}));

import { PaquetesBoost } from "@/app/(app)/(shell)/boosts/paquetes-boost";
import { PAQUETES_BOOST } from "@/config/constants";
import { paquetesEnVenta } from "@/lib/boost-precio";

const URL_STRIPE = "https://checkout.stripe.com/c/pay/cs_test_ABC#fidkbWxv";
const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, code: "", data });

/** `window.location.assign` espiado: es la única navegación que sale de la app. */
let irA: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocks.post.mockReset().mockResolvedValue(ok({ url: URL_STRIPE }));
  irA = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign: irA },
    configurable: true,
  });
});
afterEach(cleanup);

const montar = (props: Partial<Parameters<typeof PaquetesBoost>[0]> = {}) =>
  render(<PaquetesBoost puedeComprar {...props} />);

const botones = () => screen.getAllByRole("button", { name: /Comprar|Abriendo/ });
/** La tarjeta de un paquete, por su clave. */
const tarjeta = (clave: string) => document.querySelector(`[data-paquete="${clave}"]`)!;
const botonDe = (clave: string) => tarjeta(clave).querySelector("button")!;

describe("se pintan los tres paquetes del catálogo", () => {
  it("uno por clave, ni uno más", () => {
    montar();
    const claves = Object.keys(PAQUETES_BOOST);
    expect(botones()).toHaveLength(claves.length);
    for (const c of claves) expect(tarjeta(c), c).not.toBeNull();
  });

  it("con su número de boosts y su importe, que salen del catálogo", () => {
    montar();
    for (const p of paquetesEnVenta()) {
      const texto = tarjeta(p.clave).textContent ?? "";
      expect(texto, p.clave).toContain(String(p.boosts));
      // El importe lo pinta `ImportePremio` troceado en spans; el texto concatenado lleva la cifra.
      expect(texto.replace(/\s/g, ""), p.clave).toContain((p.precioCents / 100).toFixed(2));
    }
  });

  it("y el recomendado es UNO, con el único botón principal de la pantalla", () => {
    montar();
    const mejores = document.querySelectorAll("[data-mejor='si']");
    expect(mejores).toHaveLength(1);

    // `bg-action` es el relleno del botón principal (ver `botonTokens`). Uno, y en esa tarjeta.
    const principales = [...document.querySelectorAll("button")].filter((b) =>
      b.className.includes("bg-action"),
    );
    expect(principales).toHaveLength(1);
    expect(mejores[0]!.contains(principales[0]!)).toBe(true);
  });
});

describe("el cuerpo de la petición", () => {
  it("lleva SOLO la clave del paquete", async () => {
    montar();
    fireEvent.click(botonDe("boost_10"));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0]?.[0]).toBe("/api/boost/checkout");
    // `toEqual` y no `toMatchObject`: lo que importa es que no haya NADA más.
    expect(mocks.post.mock.calls[0]?.[1]).toEqual({ packageId: "boost_10" });
  });

  it("ni el importe ni los boosts viajan desde el navegador", async () => {
    montar();
    fireEvent.click(botonDe("boost_5"));

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    const cuerpo = JSON.stringify(mocks.post.mock.calls[0]?.[1]);
    expect(cuerpo).not.toMatch(/precio|cents|amount|boosts/i);
    expect(cuerpo).not.toMatch(/1500|15/);
  });

  it("cada tarjeta manda SU clave, no la del vecino", async () => {
    montar();
    for (const clave of Object.keys(PAQUETES_BOOST)) {
      mocks.post.mockClear();
      cleanup();
      montar();
      fireEvent.click(botonDe(clave));
      await waitFor(() => expect(mocks.post).toHaveBeenCalled());
      expect(mocks.post.mock.calls[0]?.[1], clave).toEqual({ packageId: clave });
    }
  });
});

describe("una compra en vuelo, una sola", () => {
  it("al pulsar, los TRES botones se deshabilitan", async () => {
    // Nunca resuelve: simula el viaje a Stripe, que es cuando el usuario puede volver a pulsar.
    mocks.post.mockReturnValue(new Promise(() => {}));
    montar();

    fireEvent.click(botonDe("boost_1"));

    await waitFor(() => expect(botonDe("boost_1")).toHaveProperty("disabled", true));
    for (const b of botones()) expect(b).toHaveProperty("disabled", true);
  });

  it("y el que se pulsó lo dice, para que no parezca que no pasó nada", async () => {
    mocks.post.mockReturnValue(new Promise(() => {}));
    montar();

    fireEvent.click(botonDe("boost_5"));

    await waitFor(() => expect(botonDe("boost_5").textContent).toBe("Abriendo el pago…"));
    // Los otros NO cambian de texto: solo están deshabilitados.
    expect(botonDe("boost_1").textContent).toBe("Comprar");
  });

  it("un segundo clic no abre una segunda sesión de pago", async () => {
    mocks.post.mockReturnValue(new Promise(() => {}));
    montar();

    fireEvent.click(botonDe("boost_10"));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    fireEvent.click(botonDe("boost_10"));
    fireEvent.click(botonDe("boost_1"));

    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
});

describe("salir a Stripe", () => {
  it("va a la URL que devuelve el servidor, tal cual", async () => {
    montar();
    fireEvent.click(botonDe("boost_1"));
    await waitFor(() => expect(irA).toHaveBeenCalledTimes(1));
    expect(irA).toHaveBeenCalledWith(URL_STRIPE);
  });

  it("si la respuesta viene SIN url, no navega a ninguna parte y lo dice", async () => {
    // Un 200 sin `url` es una respuesta que no sirve: navegar a `undefined` dejaría al usuario en
    // una pantalla en blanco sin saber si se le ha cobrado.
    mocks.post.mockResolvedValue(ok({}));
    montar();

    fireEvent.click(botonDe("boost_1"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(irA).not.toHaveBeenCalled();
  });
});

describe("los fallos se dicen en humano", () => {
  it("se enseña el mensaje del servidor", async () => {
    mocks.post.mockResolvedValue(
      ok(
        { error: { code: "RATE_LIMITED", message: "Demasiados intentos. Espera un momento." } },
        429,
      ),
    );
    montar();

    fireEvent.click(botonDe("boost_1"));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Demasiados intentos. Espera un momento."),
    );
  });

  it("sin mensaje del servidor hay un copy de reserva, no un hueco", async () => {
    mocks.post.mockResolvedValue(ok({}, 503));
    montar();

    fireEvent.click(botonDe("boost_1"));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBeTruthy());
    expect(screen.getByRole("alert").textContent!.length).toBeGreaterThan(10);
  });

  it("una EXCEPCIÓN de red también se dice, y los botones vuelven", async () => {
    mocks.post.mockRejectedValue(new Error("fetch falló"));
    montar();

    fireEvent.click(botonDe("boost_1"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // Lo importante: se puede volver a intentar. Un botón deshabilitado para siempre tras un fallo
    // de red deja al usuario sin salida.
    for (const b of botones()) expect(b).toHaveProperty("disabled", false);
  });

  it("NUNCA aparece un código ni jerga de la pasarela en pantalla", async () => {
    mocks.post.mockResolvedValue(
      ok({ error: { code: "PAGO_NO_CONFIGURADO", message: "Pagos no disponibles." } }, 503),
    );
    montar();

    fireEvent.click(botonDe("boost_1"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const visible = document.body.textContent ?? "";
    expect(visible).not.toMatch(/stripe/i);
    expect(visible).not.toMatch(/PAGO_NO_CONFIGURADO|sk_|whsec_/);
  });

  it("y hay UNA sola región de aviso, no una por tarjeta", async () => {
    // Tres regiones serían tres sitios donde buscar el mismo mensaje — y, en un test, tres roles
    // `alert` colisionando (el fallo que ya dio el botón de compartir con `role="status"`).
    mocks.post.mockResolvedValue(ok({ error: { code: "X", message: "Ha fallado." } }, 500));
    montar();

    fireEvent.click(botonDe("boost_1"));

    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
  });
});

describe("cuando no se puede comprar", () => {
  it("los tres botones están deshabilitados y NO se llama a nada", () => {
    montar({ puedeComprar: false, motivoBloqueo: "Verifica tu correo para poder comprar." });

    for (const b of botones()) expect(b).toHaveProperty("disabled", true);
    fireEvent.click(botonDe("boost_1"));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("y se dice POR QUÉ, una vez", () => {
    montar({ puedeComprar: false, motivoBloqueo: "Verifica tu correo para poder comprar." });
    expect(screen.getByText("Verifica tu correo para poder comprar.")).toBeTruthy();
  });

  it("el motivo está ATADO a los botones para quien usa lector de pantalla", () => {
    // Un botón deshabilitado sin explicación es un callejón sin salida: `aria-describedby` hace que
    // al enfocarlo se lea el por qué, no solo "no disponible".
    montar({ puedeComprar: false, motivoBloqueo: "Verifica tu correo para poder comprar." });
    const id = botonDe("boost_1").getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe(
      "Verifica tu correo para poder comprar.",
    );
  });

  it("sin motivo no se inventa uno, pero sigue bloqueado", () => {
    montar({ puedeComprar: false });
    for (const b of botones()) expect(b).toHaveProperty("disabled", true);
  });

  it("y cuando SÍ se puede, no queda ningún aviso de bloqueo colgado", () => {
    montar();
    for (const b of botones()) expect(b).toHaveProperty("disabled", false);
    expect(document.getElementById("boost-bloqueo")).toBeNull();
  });
});
