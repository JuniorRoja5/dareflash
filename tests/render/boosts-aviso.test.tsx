/**
 * LA VUELTA DE STRIPE — render real del aviso.
 *
 * El hueco entre el cobro y el abono es real: Stripe devuelve al usuario en cuanto cobra y el
 * webhook que acredita llega por otro camino. Lo que se fija aquí es el comportamiento de ese hueco:
 *
 *  - "ACTUALIZAR" VUELVE A PEDIR LA PÁGINA AL SERVIDOR (`router.refresh`), que es lo único que
 *    puede hacer aparecer el saldo nuevo. Sin él, la única salida honesta sería "recarga tú".
 *  - Y SE QUEDA DESHABILITADO después: dos refrescos seguidos no traen el saldo antes.
 *  - CANCELAR NO PIDE NADA. No hay nada que esperar: no se ha cobrado.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { AvisoCompra } from "@/app/(app)/(shell)/boosts/aviso-compra";

beforeEach(() => {
  mocks.refresh.mockReset();
});
afterEach(cleanup);

/** El botón, antes y DESPUÉS de pulsarlo: cambia de texto a "Actualizando…". */
const actualizar = () => screen.getByRole("button", { name: /Actualizar|Actualizando/ });

describe("vuelta con pago cobrado", () => {
  it("lo dice, y lo dice como estado para quien usa lector de pantalla", () => {
    render(<AvisoCompra estado="ok" />);
    const region = screen.getByRole("status");
    expect(region.textContent).toContain("Pago recibido");
  });

  it("NO afirma que los boosts ya estén en el saldo", () => {
    // Es la mentira fácil de esta pantalla: el hero de arriba puede estar enseñando el saldo viejo.
    render(<AvisoCompra estado="ok" />);
    const texto = screen.getByRole("status").textContent ?? "";
    expect(texto).not.toMatch(/acreditad|añadid|a[ñn]adido|ya tienes/i);
    expect(texto).toMatch(/en unos segundos/);
  });

  it("y no da ninguna cifra: no sabe qué paquete se compró", () => {
    render(<AvisoCompra estado="ok" />);
    expect(screen.getByRole("status").textContent).not.toMatch(/\d/);
  });

  it("«Actualizar» vuelve a pedir la página al servidor", () => {
    render(<AvisoCompra estado="ok" />);
    fireEvent.click(actualizar());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("y queda deshabilitado: dos refrescos no traen el saldo antes", () => {
    render(<AvisoCompra estado="ok" />);
    fireEvent.click(actualizar());
    expect(actualizar()).toHaveProperty("disabled", true);
    expect(actualizar().textContent).toBe("Actualizando…");

    fireEvent.click(actualizar());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("vuelta sin pagar", () => {
  it("dice que no se ha cobrado nada, en tono neutro", () => {
    render(<AvisoCompra estado="cancelada" />);
    expect(screen.getByText(/No se te ha cobrado nada/)).toBeTruthy();
  });

  it("y no ofrece actualizar: no hay nada que esperar", () => {
    render(<AvisoCompra estado="cancelada" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("no es un error: no se anuncia como alerta", () => {
    // Quien cierra el formulario de pago cambió de idea. Gritarle es decirle que rompió algo.
    render(<AvisoCompra estado="cancelada" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
