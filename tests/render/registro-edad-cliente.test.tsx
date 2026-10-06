/**
 * EL AVISO DE EDAD AL ESCRIBIR — y que siga siendo SOLO UX.
 *
 * Antes, quien ponía una fecha de menor rellenaba el formulario entero y solo se enteraba al
 * pulsar. Ahora se le dice al elegir la fecha. Lo que este fichero vigila es que ese adelanto no se
 * convierta en otra cosa:
 *
 *  - LA REGLA ES LA DEL SERVIDOR, importada. Si el cliente tuviera su propia aritmética de fechas,
 *    sería un segundo juez; y el que discrepa en silencio siempre es el del cliente.
 *  - NO BLOQUEA EL ENVÍO. El botón sigue habilitado: si este aviso se equivocara, nadie se quedaría
 *    sin poder intentarlo, y el servidor —que es el gate— diría la última palabra.
 *  - NO GRITA MIENTRAS SE ESCRIBE. Una fecha a medias o imposible no dispara nada: el
 *    `<input type="date">` va emitiendo valores incompletos y avisar a cada tecla es ruido.
 *
 * Para romperlo: calcular la edad a mano en el formulario (rojo en el estructural), deshabilitar el
 * botón con el aviso (rojo), o avisar con una fecha a medias (rojo).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EDAD_MIN_USO, MSG_EDAD_MINIMA } from "@/config/constants";

// El formulario lee `useSearchParams` (el `?ref=` del enlace de invitación). En jsdom no hay
// router, así que se le da uno vacío: lo que se prueba aquí es la fecha, no los referidos.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { FormularioRegistro } from "@/app/entrar/formulario-registro";

afterEach(cleanup);

/** `AAAA-MM-DD` de quien cumple EXACTAMENTE `anios` hoy. */
function naceHace(anios: number): string {
  const hoy = new Date();
  const f = new Date(Date.UTC(hoy.getUTCFullYear() - anios, hoy.getUTCMonth(), hoy.getUTCDate()));
  return f.toISOString().slice(0, 10);
}

function escribirFecha(valor: string): HTMLElement {
  const { container } = render(<FormularioRegistro />);
  const campo = container.querySelector<HTMLInputElement>("#registro-nacimiento")!;
  fireEvent.change(campo, { target: { value: valor } });
  return container;
}

describe("avisa al elegir la fecha", () => {
  it("una fecha de menor de edad dispara el aviso", () => {
    escribirFecha(naceHace(EDAD_MIN_USO - 1));
    expect(screen.getByRole("status").textContent).toBe(MSG_EDAD_MINIMA);
  });

  it("y el aviso es el MISMO texto que da el servidor", () => {
    // Si el cliente escribiera su propio mensaje, un día dirían cosas distintas por el mismo motivo.
    escribirFecha(naceHace(10));
    expect(screen.getByRole("status").textContent).toBe(MSG_EDAD_MINIMA);
  });

  it("con la edad mínima EXACTA no avisa de nada", () => {
    escribirFecha(naceHace(EDAD_MIN_USO));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("ni con una edad holgada", () => {
    escribirFecha(naceHace(40));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("no grita mientras se escribe", () => {
  it.each(["", "2", "200", "2001-", "2001-02-30", "9999-01-01"])(
    "con «%s» no dice nada",
    (valor) => {
      // Vacío, a medias, un día que no existe, una fecha futura: nada de esto es "eres menor", y
      // soltar un aviso en cada pulsación sería ruido, no ayuda.
      escribirFecha(valor);
      expect(screen.queryByRole("status")).toBeNull();
    },
  );
});

describe("sigue siendo SOLO UX", () => {
  it("el botón de crear cuenta NO se deshabilita por el aviso", () => {
    const c = escribirFecha(naceHace(10));
    expect(screen.getByRole("status")).not.toBeNull();
    const boton = [...c.querySelectorAll("button")].find((b) => b.textContent?.includes("Crear"))!;
    expect(boton.hasAttribute("disabled"), "el cliente no puede ser el gate").toBe(false);
  });

  it("y el campo apunta al aviso para quien no lo ve", () => {
    const c = escribirFecha(naceHace(10));
    const campo = c.querySelector("#registro-nacimiento")!;
    expect(campo.getAttribute("aria-describedby")).toBe("registro-aviso-edad");
  });

  it("sin aviso, el campo no apunta a nada", () => {
    const c = escribirFecha(naceHace(40));
    expect(c.querySelector("#registro-nacimiento")!.getAttribute("aria-describedby")).toBeNull();
  });
});
