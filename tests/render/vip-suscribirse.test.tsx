/**
 * SUSCRIBIRSE Y DARSE DE BAJA — render real de las dos islas de /vip.
 *
 * Es el botón que abre un cobro RECURRENTE, así que lo que se fija aquí es lo que cuesta caro:
 *
 *  - EL CUERPO VA VACÍO. No hay plan que elegir ni precio que mandar: el servidor lo resuelve. Se
 *    exige mirando el cuerpo entero, no "que no lleve el precio".
 *  - UNA SUSCRIPCIÓN EN VUELO, UNA SOLA. Un segundo clic abriría una segunda sesión de pago.
 *  - SE SALE A LA URL QUE DEVUELVE EL SERVIDOR, tal cual y con una navegación DURA.
 *  - BLOQUEADA ES BLOQUEADA, igual que en Boost: sin pagos o sin correo verificado no se intenta,
 *    y se dice por qué, atado al botón.
 *  - EL BOTÓN VA EN ORO, nunca en el verde de acción (que es de "Subir vídeo", uno por pantalla).
 *  - DARSE DE BAJA NO ES DE UN TOQUE, y lo que se enseña al volver es el MENSAJE DEL SERVIDOR: la
 *    baja la confirma el webhook, no esta pantalla.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/cliente-http", async (orig) => ({
  ...(await orig<typeof import("@/lib/cliente-http")>()),
  postJsonCsrf: mocks.post,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { CancelarVip } from "@/app/(app)/(shell)/vip/cancelar-vip";
import { CtaVip } from "@/app/(app)/(shell)/vip/cta-vip";
import { MSG_VIP_CANCELADA_OK } from "@/config/constants";

const URL_STRIPE = "https://checkout.stripe.com/c/pay/cs_test_VIP#fidkbWxv";
const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, code: "", data });

/** `window.location.assign` espiado: es la única navegación que sale de la app. */
let irA: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mocks.post.mockReset().mockResolvedValue(ok({ url: URL_STRIPE }));
  mocks.refresh.mockReset();
  irA = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign: irA },
    configurable: true,
  });
});
afterEach(cleanup);

const montarCta = (props: Partial<Parameters<typeof CtaVip>[0]> = {}) =>
  render(<CtaVip puedeSuscribirse {...props} />);
const botonCta = () => screen.getByRole("button", { name: /Hazte VIP|Abriendo/ });

describe("abrir el pago de la suscripción", () => {
  it("el cuerpo va VACÍO: no hay nada que el navegador pueda elegir", async () => {
    montarCta();
    fireEvent.click(botonCta());

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0]?.[0]).toBe("/api/vip/checkout");
    // `toEqual` y no `toMatchObject`: lo que importa es que no haya NADA dentro. Un `{ plan }` o un
    // `{ precioCents }` aquí serían un dato de entrada donde no puede haberlo.
    expect(mocks.post.mock.calls[0]?.[1]).toEqual({});
  });

  it("va a la URL que devuelve el servidor, tal cual", async () => {
    montarCta();
    fireEvent.click(botonCta());
    await waitFor(() => expect(irA).toHaveBeenCalledTimes(1));
    expect(irA).toHaveBeenCalledWith(URL_STRIPE);
  });

  it("un segundo clic NO abre una segunda suscripción", async () => {
    // Nunca resuelve: simula el viaje a Stripe, que es cuando el usuario puede volver a pulsar.
    mocks.post.mockReturnValue(new Promise(() => {}));
    montarCta();

    fireEvent.click(botonCta());
    await waitFor(() => expect(botonCta()).toHaveProperty("disabled", true));
    fireEvent.click(botonCta());

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(botonCta().textContent).toBe("Abriendo el pago…");
  });

  it("si la respuesta viene SIN url, no navega a ninguna parte y lo dice", async () => {
    mocks.post.mockResolvedValue(ok({}));
    montarCta();

    fireEvent.click(botonCta());

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(irA).not.toHaveBeenCalled();
  });

  it("los fallos se dicen en humano, con el copy del servidor y sin jerga", async () => {
    mocks.post.mockResolvedValue(
      ok({ error: { code: "PAGO_NO_CONFIGURADO", message: "No disponible ahora mismo." } }, 503),
    );
    montarCta();

    fireEvent.click(botonCta());

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("No disponible ahora mismo."),
    );
    // EL AVISO no nombra la pasarela: "ha fallado Stripe" no es algo con lo que el usuario pueda
    // hacer nada. (La letra pequeña SÍ dice "Pago seguro con Stripe", y es a propósito: ahí el
    // nombre tranquiliza antes de pagar. Lo que no puede salir nunca es su jerga ni sus códigos.)
    expect(screen.getByRole("alert").textContent).not.toMatch(/stripe/i);
    expect(document.body.textContent ?? "").not.toMatch(/PAGO_NO_CONFIGURADO|sk_|whsec_/);
  });

  it("una EXCEPCIÓN de red también se dice, y el botón vuelve", async () => {
    mocks.post.mockRejectedValue(new Error("fetch falló"));
    montarCta();

    fireEvent.click(botonCta());

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // Lo importante: se puede volver a intentar.
    expect(botonCta()).toHaveProperty("disabled", false);
  });
});

describe("cuando no se puede pagar (igual que en Boost)", () => {
  const BLOQUEO = "Las suscripciones no están disponibles ahora mismo.";

  it("el botón está deshabilitado y NO se llama a nada", () => {
    montarCta({ puedeSuscribirse: false, motivoBloqueo: BLOQUEO });

    expect(botonCta()).toHaveProperty("disabled", true);
    fireEvent.click(botonCta());
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("se dice por qué, y está ATADO al botón para quien usa lector de pantalla", () => {
    montarCta({ puedeSuscribirse: false, motivoBloqueo: BLOQUEO });
    const id = botonCta().getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe(BLOQUEO);
  });

  it("sin motivo no se inventa uno, pero sigue bloqueado", () => {
    montarCta({ puedeSuscribirse: false });
    expect(botonCta()).toHaveProperty("disabled", true);
    expect(document.getElementById("vip-bloqueo")).toBeNull();
  });

  it("y cuando SÍ se puede, no queda ningún aviso colgado", () => {
    montarCta();
    expect(botonCta()).toHaveProperty("disabled", false);
    expect(botonCta().getAttribute("aria-describedby")).toBeNull();
  });
});

describe("el CTA va en ORO", () => {
  it("el relleno es el oro del VIP y la tinta su token, no un color fijo", () => {
    montarCta();
    // El atributo CRUDO y no `style.backgroundColor`: jsdom no resuelve `var(…)`, así que leer la
    // propiedad computada devolvería vacío y el caso pasaría sin mirar nada.
    const estilo = botonCta().getAttribute("style") ?? "";
    expect(estilo).toContain("var(--vip-gold)");
    expect(estilo).toContain("var(--vip-tinta)");
  });

  it("y NUNCA el verde de acción, que es de «Subir vídeo»", () => {
    montarCta();
    const estilo = botonCta().getAttribute("style") ?? "";
    expect(estilo).not.toContain("--df-action");
    // `bg-action` es el relleno del botón principal del sistema (ver `botonTokens`).
    expect(botonCta().className).not.toContain("bg-action");
  });
});

describe("darse de baja", () => {
  const montarBaja = () => render(<CancelarVip />);
  const boton = (nombre: RegExp) => screen.getByRole("button", { name: nombre });

  it("el primer clic NO cancela nada: pide confirmación", () => {
    montarBaja();
    fireEvent.click(boton(/Cancelar suscripción/));

    expect(mocks.post).not.toHaveBeenCalled();
    expect(boton(/Sí, dar de baja/)).toBeTruthy();
    expect(boton(/Seguir siendo VIP/)).toBeTruthy();
  });

  it("y dice, ANTES de confirmar, que el acceso no se pierde", () => {
    montarBaja();
    fireEvent.click(boton(/Cancelar suscripción/));
    expect(document.body.textContent).toMatch(/hasta que acabe el periodo que ya has pagado/i);
  });

  it("se puede echar atrás", () => {
    montarBaja();
    fireEvent.click(boton(/Cancelar suscripción/));
    fireEvent.click(boton(/Seguir siendo VIP/));

    expect(mocks.post).not.toHaveBeenCalled();
    expect(boton(/Cancelar suscripción/)).toBeTruthy();
  });

  it("al confirmar, pide la baja con el cuerpo vacío", async () => {
    mocks.post.mockResolvedValue(ok({ estado: "cancelada", mensaje: MSG_VIP_CANCELADA_OK }));
    montarBaja();

    fireEvent.click(boton(/Cancelar suscripción/));
    fireEvent.click(boton(/Sí, dar de baja/));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0]?.[0]).toBe("/api/vip/cancelar");
    expect(mocks.post.mock.calls[0]?.[1]).toEqual({});
  });

  it("lo que se enseña es el MENSAJE DEL SERVIDOR, no un éxito inventado", async () => {
    // La baja la confirma el webhook, no esta pantalla: "suscripción cancelada" sería afirmar algo
    // que todavía no ha pasado. Y el caso "ya estaba cancelada" tiene su propio copy, que solo
    // conoce la ruta.
    mocks.post.mockResolvedValue(ok({ estado: "ya-cancelada", mensaje: "Ya estaba cancelada." }));
    montarBaja();

    fireEvent.click(boton(/Cancelar suscripción/));
    fireEvent.click(boton(/Sí, dar de baja/));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Ya estaba cancelada."),
    );
  });

  it("no se refresca solo: ofrece hacerlo cuando el webhook haya llegado", async () => {
    mocks.post.mockResolvedValue(ok({ mensaje: MSG_VIP_CANCELADA_OK }));
    montarBaja();

    fireEvent.click(boton(/Cancelar suscripción/));
    fireEvent.click(boton(/Sí, dar de baja/));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());

    // Un refresco automático repintaría la tarjeta IGUAL —el webhook aún no ha escrito— y parecería
    // que el botón no ha hecho nada.
    expect(mocks.refresh).not.toHaveBeenCalled();
    fireEvent.click(boton(/Actualizar/));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("si la ruta dice que no, se dice en humano y se puede reintentar", async () => {
    mocks.post.mockResolvedValue(
      ok({ error: { code: "NO_ERES_VIP", message: "No tienes ninguna suscripción activa." } }, 409),
    );
    montarBaja();

    fireEvent.click(boton(/Cancelar suscripción/));
    fireEvent.click(boton(/Sí, dar de baja/));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("No tienes ninguna suscripción activa."),
    );
    expect(boton(/Cancelar suscripción/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/NO_ERES_VIP/);
  });
});
