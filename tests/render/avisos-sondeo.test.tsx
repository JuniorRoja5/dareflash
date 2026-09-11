/**
 * EL BADGE DE AVISOS SE ACTUALIZA SOLO — con temporizadores falsos, simulando un aviso que llega
 * DESPUÉS de cargar la página.
 *
 * El defecto que cierra: el número salía del servidor al pintar y se quedaba quieto; la campana solo
 * lo repedía al abrirla. Un aviso que llegaba con la página abierta no movía nada y el usuario, que
 * solo abre la campana si ya sospecha algo, no se enteraba nunca. Los tests de antes comprobaban "con
 * N pinta N", no "llega un aviso y el número sube": este es ese test.
 *
 * Se montan JUNTOS la campana (escritorio) y la barra inferior (el número del icono de Perfil en móvil)
 * dentro del mismo proveedor: los dos deben decir siempre lo mismo, porque salen del mismo estado.
 *
 * Para romperlo: quitar el intervalo o el recuento al volver a la pestaña (el número se queda rancio,
 * rojo); sondear con la pestaña oculta (rojo); marcar leídas desde el sondeo (rojo).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NOTIF_SONDEO_MS } from "@/config/constants";

const mocks = vi.hoisted(() => ({ getJson: vi.fn(), postJsonCsrf: vi.fn() }));

vi.mock("@/lib/cliente-http", () => ({
  getJson: mocks.getJson,
  postJsonCsrf: mocks.postJsonCsrf,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/retos" }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { ProveedorAvisos } from "@/app/(app)/avisos-contexto";
import { CampanaNotificaciones } from "@/app/(app)/(shell)/campana-notificaciones";
import { NavInferiorActiva } from "@/app/(app)/nav-activa";

let visibilidad: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibilidad = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibilidad,
  });
  mocks.getJson.mockReset();
  mocks.postJsonCsrf.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

const CONTADOR = "/api/notificaciones/no-leidas";
const respuesta = (data: unknown, status = 200) => ({ ok: status < 400, status, code: "", data });
/** El servidor dice que hay `n` sin leer (y, si se abre la campana, una lista con un aviso nuevo). */
function servidorCon(n: number): void {
  mocks.getJson.mockImplementation(async (url: string) =>
    url === CONTADOR
      ? respuesta({ noLeidas: n })
      : respuesta({
          items: [
            { id: "a", texto: "Aviso a", href: "/perfil", leida: false, creadaMs: Date.now() },
          ],
          nextCursor: null,
          noLeidas: n,
        }),
  );
}
const llamadasAlContador = () => mocks.getJson.mock.calls.filter(([u]) => u === CONTADOR).length;

function montar(inicial: number, activo = true) {
  return render(
    <ProveedorAvisos inicial={inicial} activo={activo}>
      <CampanaNotificaciones />
      <NavInferiorActiva rol="USER" />
    </ProveedorAvisos>,
  );
}
const numeroCampana = () =>
  screen.getByRole("button", { name: /Notificaciones/ }).getAttribute("aria-label");
const perfilMovil = () => screen.getByText("Perfil").closest("a")!.textContent;

async function pasan(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function pestana(v: DocumentVisibilityState): Promise<void> {
  visibilidad = v;
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("el contador se refresca solo", () => {
  it("la primera pintura es la del servidor, sin pedir nada", async () => {
    servidorCon(3);
    montar(3);
    await pasan(0);
    expect(numeroCampana()).toBe("Notificaciones (3 sin leer)");
    expect(perfilMovil()).toContain("3");
    expect(mocks.getJson).not.toHaveBeenCalled();
  });

  it("un aviso que llega DESPUÉS de cargar sube el número en un ciclo de sondeo, sin recargar", async () => {
    servidorCon(0);
    montar(0);
    expect(numeroCampana()).toBe("Notificaciones");

    servidorCon(1); // llega un aviso
    await pasan(NOTIF_SONDEO_MS);

    expect(llamadasAlContador()).toBe(1);
    // Los DOS sitios que lo pintan dicen lo mismo: salen del mismo estado.
    expect(numeroCampana()).toBe("Notificaciones (1 sin leer)");
    expect(perfilMovil()).toContain("1");
  });

  it("con la pestaña OCULTA no pide nada; al VOLVER cuenta en el acto", async () => {
    servidorCon(0);
    montar(0);
    await pestana("hidden");
    await pasan(NOTIF_SONDEO_MS * 5);
    expect(mocks.getJson).not.toHaveBeenCalled();

    servidorCon(2);
    await pestana("visible");
    expect(llamadasAlContador()).toBe(1);
    expect(numeroCampana()).toBe("Notificaciones (2 sin leer)");
  });

  it("el sondeo SOLO cuenta: ni trae la lista ni marca nada como leído", async () => {
    servidorCon(4);
    montar(0);
    await pasan(NOTIF_SONDEO_MS * 3);
    expect(llamadasAlContador()).toBe(3);
    expect(mocks.getJson.mock.calls.every(([u]) => u === CONTADOR)).toBe(true);
    expect(mocks.postJsonCsrf).not.toHaveBeenCalled();
  });

  it("abrir la campana sigue marcando leídas, y el número baja en TODOS los sitios", async () => {
    servidorCon(1);
    mocks.postJsonCsrf.mockResolvedValue(respuesta({ noLeidas: 0 }));
    montar(0);
    await pasan(NOTIF_SONDEO_MS);
    expect(perfilMovil()).toContain("1");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Notificaciones/ }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.postJsonCsrf).toHaveBeenCalledWith("/api/notificaciones/leidas", { ids: ["a"] });
    expect(numeroCampana()).toBe("Notificaciones");
    expect(perfilMovil()).toBe("Perfil");
  });

  it("el invitado no pide nada, ni por tiempo ni al volver a la pestaña", async () => {
    servidorCon(5);
    montar(0, false);
    await pasan(NOTIF_SONDEO_MS * 3);
    await pestana("hidden");
    await pestana("visible");
    expect(mocks.getJson).not.toHaveBeenCalled();
  });

  it("si la sesión caducó (401), el sondeo se apaga", async () => {
    mocks.getJson.mockResolvedValue(respuesta({}, 401));
    montar(2);
    await pasan(NOTIF_SONDEO_MS);
    expect(llamadasAlContador()).toBe(1);
    await pasan(NOTIF_SONDEO_MS * 3);
    await pestana("hidden");
    await pestana("visible");
    expect(llamadasAlContador()).toBe(1);
  });
});
