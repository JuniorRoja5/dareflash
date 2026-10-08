/**
 * LA VUELTA DE STRIPE — render real del aviso.
 *
 * ┌─ ESTE TEST SE REESCRIBIÓ PORQUE AFIRMABA ALGO FALSO ──────────────────────────────────────────┐
 * │ La primera versión exigía `router.refresh()` y daba por bueno que el botón se quedara          │
 * │ deshabilitado para siempre ("dos refrescos no traen el saldo antes"). Eran dos bugs vestidos   │
 * │ de invariante: `refresh()` no quita `?compra=ok` de la dirección —así que el aviso volvía al   │
 * │ recargar y seguía puesto con el saldo ya al día— y no remonta el componente, así que el        │
 * │ "Actualizando…" no bajaba nunca. Un test puede fijar un fallo con la misma firmeza que una     │
 * │ decisión; la señal fue que el invariante que defendía era raro de leer.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que se fija ahora:
 *  - EL AVISO ES DE UN SOLO USO: el botón limpia la query (`router.replace(pathname)`), que es lo
 *    que hace que no vuelva al repintar ni al recargar.
 *  - Y ESO MISMO TRAE EL SALDO FRESCO: la página se renderiza por petición, así que volver a
 *    `/boosts` sin el parámetro vuelve al servidor. No hace falta un `refresh()` aparte.
 *  - EL BOTÓN NO PUEDE COLGARSE: el pendiente es el de la transición, no un `useState` propio.
 *  - "PAGO RECIBIDO" NO AFIRMA EL ABONO, y el copy sigue sin cifras.
 *  - CANCELAR no es un error, y también se puede quitar de la URL.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh, push: mocks.push }),
  usePathname: () => "/boosts",
}));

import { AvisoCompra } from "@/app/(app)/(shell)/boosts/aviso-compra";

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.refresh.mockReset();
  mocks.push.mockReset();
});
afterEach(cleanup);

const boton = () => screen.getByRole("button");

describe("vuelta con pago cobrado", () => {
  it("lo dice, y lo dice como estado para quien usa lector de pantalla", () => {
    render(<AvisoCompra estado="ok" />);
    expect(screen.getByRole("status").textContent).toContain("Pago recibido");
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
});

describe("el aviso es de un solo uso", () => {
  it("«Actualizar» LIMPIA la query: navega al pathname, sin parámetros", () => {
    // Es lo único que hace que el aviso no vuelva al recargar. Con `refresh()`, `?compra=ok` se
    // quedaba en la dirección y el aviso reaparecía — incluso con los boosts ya acreditados.
    render(<AvisoCompra estado="ok" />);
    fireEvent.click(boton());

    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace.mock.calls[0]?.[0]).toBe("/boosts");
    expect(String(mocks.replace.mock.calls[0]?.[0])).not.toContain("?");
  });

  it("el destino sale de `usePathname`, no escrito a mano", () => {
    // Si la pantalla cambia de sitio, el botón tiene que llevar a donde está.
    render(<AvisoCompra estado="ok" />);
    fireEvent.click(boton());
    expect(mocks.replace.mock.calls[0]?.[0]).toBe("/boosts");
  });

  it("y no sube al principio de la página: es la misma pantalla sin el parámetro", () => {
    render(<AvisoCompra estado="ok" />);
    fireEvent.click(boton());
    expect(mocks.replace.mock.calls[0]?.[1]).toMatchObject({ scroll: false });
  });

  it("NO usa `router.refresh()`: no quitaría el parámetro ni desmontaría nada", () => {
    render(<AvisoCompra estado="ok" />);
    fireEvent.click(boton());
    expect(mocks.refresh, "vuelve el refresh que dejaba el aviso pegado").not.toHaveBeenCalled();
  });

  it("y no empuja una entrada nueva al historial: volver atrás no reabre el aviso", () => {
    // Con `push`, el botón "atrás" del navegador devolvería a `?compra=ok` y el aviso volvería.
    render(<AvisoCompra estado="ok" />);
    fireEvent.click(boton());
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("el botón no puede quedarse colgado", () => {
  it("en reposo está activo y dice qué hace", () => {
    render(<AvisoCompra estado="ok" />);
    expect(boton()).toHaveProperty("disabled", false);
    expect(boton().textContent).toBe("Actualizar");
  });

  it("tras pulsar sigue utilizable: el pendiente es el de la transición, no un estado nuestro", () => {
    // EL BUG QUE ESTO FIJA: antes se ponía `actualizando = true` y nadie lo volvía a bajar, porque
    // `refresh()` no remonta. Con `useTransition`, fuera de una navegación real no hay pendiente
    // que se quede puesto — y en el navegador baja solo cuando la navegación termina.
    render(<AvisoCompra estado="ok" />);
    fireEvent.click(boton());

    expect(boton(), "el botón se ha quedado colgado").toHaveProperty("disabled", false);
    expect(boton().textContent).toBe("Actualizar");
  });

  it("y se puede volver a pulsar", () => {
    render(<AvisoCompra estado="ok" />);
    fireEvent.click(boton());
    fireEvent.click(boton());
    expect(mocks.replace).toHaveBeenCalledTimes(2);
  });
});

describe("vuelta sin pagar", () => {
  it("dice que no se ha cobrado nada, en tono neutro", () => {
    render(<AvisoCompra estado="cancelada" />);
    expect(screen.getByText(/No se te ha cobrado nada/)).toBeTruthy();
  });

  it("no es un error: no se anuncia como alerta", () => {
    // Quien cierra el formulario de pago cambió de idea. Gritarle es decirle que rompió algo.
    render(<AvisoCompra estado="cancelada" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("también se puede cerrar, y también limpiando la URL", () => {
    // Si no, se queda pegado a `?compra=cancelada` igual que el otro: reaparece al recargar.
    render(<AvisoCompra estado="cancelada" />);
    expect(boton().textContent).toBe("Cerrar");

    fireEvent.click(boton());
    expect(mocks.replace).toHaveBeenCalledWith("/boosts", { scroll: false });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
