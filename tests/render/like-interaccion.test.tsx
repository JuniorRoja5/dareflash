/**
 * EL CORAZÓN RESPONDE AL DEDO. El test que NO había, y por eso se desplegó roto.
 *
 * ┌─ LO QUE PASÓ ──────────────────────────────────────────────────────────────────────────────────┐
 * │ El rail del feed tenía un corazón DE ADORNO desde antes de que los likes existieran: un        │
 * │ `<Accion label="Me gusta" valor={0} />` sin `onClick`. Al construir los likes se añadió el     │
 * │ botón de verdad MÁS ABAJO y el adorno se quedó, así que había DOS corazones y el que se        │
 * │ pulsaba era el muerto: ni animación, ni contador, ni petición.                                 │
 * │                                                                                                │
 * │ Todo lo demás estaba bien —el servicio, la ruta, `haySesion`, `esMio`—, y por eso ningún test  │
 * │ lo vio: los había de todo menos de "pulsar el botón hace algo".                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Se prueba en DOS niveles, y hacen falta los dos:
 *  - el BOTÓN: pulsarlo llama a la API y pinta el optimismo;
 *  - el RAIL del feed: hay UN solo control de "me gusta", y es el que responde. Un test solo del
 *    botón habría seguido en verde con el adorno delante.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  postJsonCsrf: vi.fn(),
  delCsrf: vi.fn(),
}));
vi.mock("@/lib/cliente-http", () => http);
const navegar = vi.hoisted(() => ({ navegarDuro: vi.fn() }));
vi.mock("@/lib/navegacion-dura", () => navegar);

import { BotonLike } from "@/components/ui/boton-like";

beforeEach(() => {
  http.postJsonCsrf.mockReset().mockResolvedValue({ ok: true, status: 200, data: {} });
  http.delCsrf.mockReset().mockResolvedValue({ ok: true, status: 200, data: {} });
  navegar.navegarDuro.mockReset();
});
afterEach(cleanup);

const corazon = () => screen.getByRole("button");

describe("pulsar el corazón", () => {
  it("llama a la API del vídeo y pinta el optimismo al instante", async () => {
    render(<BotonLike videoId="vid-1" likes={4} miLike={false} haySesion />);

    fireEvent.click(corazon());

    // El contador sube SIN esperar a la red: el corazón responde al dedo.
    expect(corazon().textContent).toContain("5");
    expect(corazon().getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(http.postJsonCsrf).toHaveBeenCalledTimes(1));
    expect(http.postJsonCsrf.mock.calls[0]?.[0]).toBe("/api/videos/vid-1/like");
  });

  it("y pulsarlo otra vez lo quita, por el otro verbo", async () => {
    render(<BotonLike videoId="vid-1" likes={4} miLike haySesion />);

    fireEvent.click(corazon());

    expect(corazon().textContent).toContain("3");
    expect(corazon().getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => expect(http.delCsrf).toHaveBeenCalledTimes(1));
    expect(http.delCsrf.mock.calls[0]?.[0]).toBe("/api/videos/vid-1/like");
  });

  it("si el servidor dice que no, el optimismo se deshace", async () => {
    http.postJsonCsrf.mockResolvedValue({ ok: false, status: 409, data: {} });
    render(<BotonLike videoId="vid-1" likes={4} miLike={false} haySesion />);

    fireEvent.click(corazon());

    await waitFor(() => expect(corazon().textContent).toContain("4"));
    expect(corazon().getAttribute("aria-pressed")).toBe("false");
  });

  it("y si la red revienta, también", async () => {
    http.postJsonCsrf.mockRejectedValue(new Error("sin red"));
    render(<BotonLike videoId="vid-1" likes={4} miLike={false} haySesion />);

    fireEvent.click(corazon());

    await waitFor(() => expect(corazon().textContent).toContain("4"));
  });
});

describe("quién puede pulsarlo", () => {
  it("lo PROPIO está deshabilitado y no llama a nada", () => {
    render(<BotonLike videoId="vid-1" likes={4} miLike={false} haySesion esMio />);

    expect(corazon().hasAttribute("disabled")).toBe(true);
    fireEvent.click(corazon());
    expect(http.postJsonCsrf).not.toHaveBeenCalled();
  });

  it("un vídeo AJENO con sesión NO está deshabilitado", () => {
    // El caso normal, y el que estaba roto en producción.
    render(<BotonLike videoId="vid-1" likes={4} miLike={false} haySesion esMio={false} />);
    expect(corazon().hasAttribute("disabled")).toBe(false);
  });

  it("un invitado va a entrar, en DURO, y sin llamar a la API", () => {
    render(<BotonLike videoId="vid-1" likes={4} miLike={false} haySesion={false} />);

    fireEvent.click(corazon());

    expect(http.postJsonCsrf).not.toHaveBeenCalled();
    expect(navegar.navegarDuro).toHaveBeenCalledTimes(1);
    expect(navegar.navegarDuro.mock.calls[0]?.[0]).toMatch(/^\/entrar\?siguiente=/);
  });
});
