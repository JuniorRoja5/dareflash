/**
 * LAS FECHAS DE UN RETO SE DEVUELVEN EN LA MISMA ZONA EN QUE SE TECLEAN.
 *
 * ┌─ EL FALLO QUE CIERRA ESTE TEST ─────────────────────────────────────────────────────────────┐
 * │ El formulario captura apertura y cierre con un `<input type="datetime-local">`, que es hora  │
 * │ del NAVEGADOR. El panel se las devolvía con `timeZone: "UTC"`. Para un admin en Madrid eso   │
 * │ son 1-2 h de diferencia — y un DÍA entero cuando el cierre cae de madrugada: tecleas "cierra │
 * │ el 23 a la 01:00" y el panel responde "22 oct". Nunca podías confirmar lo que habías puesto, │
 * │ y de ahí salía el error de fechas que dejaba el reto muerto al publicarlo.                    │
 * │                                                                                               │
 * │ No es que UTC estuviera mal en general: está en diecisiete sitios del panel y en casi todos  │
 * │ es correcto ("esto PASÓ el día X"). Lo que no puede ser es que la ENTRADA y la SALIDA del     │
 * │ mismo campo hablen idiomas distintos.                                                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Se prueba con una zona FIJA (`TZ=America/Bogota`, UTC-5, sin horario de verano) para que el caso
 * diga lo mismo en el portátil de cualquiera y en CI. Con la zona del que ejecuta, este test pasaría
 * o fallaría según dónde estuviera sentado — que es exactamente el tipo de test que no sirve.
 */
import { render, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FechaLocal } from "@/app/panel/fecha-local";

const TZ_ORIGINAL = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/Bogota"; // UTC-5 todo el año
});
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

/** Medianoche y cuarto UTC del 23: en UTC-5 eso es el día ANTERIOR por la tarde-noche. */
const CRUZA_EL_DIA = new Date("2026-10-23T00:15:00Z");

describe("`FechaLocal` pinta la hora del navegador, no UTC", () => {
  it("una fecha que cruza el día NO se queda en el día de UTC", async () => {
    const { container } = render(<FechaLocal fecha={CRUZA_EL_DIA} />);

    // Tras montar sustituye el texto del servidor por el local. Lo que se afirma es el DÍA: en
    // UTC-5, las 00:15 del 23 en UTC son las 19:15 del 22.
    await waitFor(() => {
      expect(container.textContent).toContain("22");
    });
    expect(container.textContent, "sigue pintando el día de UTC").not.toMatch(/\b23\b/);
  });

  it("y la HORA es la local, no la de UTC", async () => {
    const { container } = render(<FechaLocal fecha={CRUZA_EL_DIA} />);
    await waitFor(() => {
      expect(container.textContent).toContain("19:15");
    });
    expect(container.textContent, "pintó la hora UTC").not.toContain("0:15");
  });

  it("lleva la etiqueta que dice en qué zona está (si no, cambia una ambigüedad por otra)", async () => {
    // El panel tiene fechas en UTC al lado de estas. Sin decir cuál es cuál, pasar a local
    // resolvería un problema y crearía otro.
    const { container } = render(<FechaLocal fecha={CRUZA_EL_DIA} />);
    await waitFor(() => {
      expect(container.textContent).toContain("tu hora");
    });
  });

  it("y el instante exacto queda en el `title`, sin ambigüedad posible", async () => {
    const { container } = render(<FechaLocal fecha={CRUZA_EL_DIA} />);
    expect(container.querySelector("span")?.getAttribute("title")).toBe("2026-10-23T00:15:00.000Z");
  });

  it("sin hora (la columna apretada) sigue dando el día LOCAL", async () => {
    const { container } = render(
      <FechaLocal fecha={CRUZA_EL_DIA} conHora={false} etiqueta={false} />,
    );
    await waitFor(() => {
      expect(container.textContent).toContain("22");
    });
    expect(container.textContent).not.toContain(":");
  });
});

/**
 * EL VIAJE COMPLETO: lo que el formulario manda y lo que el panel devuelve tienen que ser el mismo
 * instante Y el mismo texto. Es la propiedad de verdad; los casos de arriba miran una mitad.
 */
describe("ida y vuelta: lo que tecleo es lo que veo", () => {
  /** La conversión del formulario, copiada tal cual (`aIsoUtc` es local -> ISO UTC). */
  const comoElFormulario = (valorLocal: string): string => new Date(valorLocal).toISOString();

  it("tecleo «2026-10-23T01:00» y el panel me devuelve el 23 a la 01:00", async () => {
    const tecleado = "2026-10-23T01:00";
    const guardado = new Date(comoElFormulario(tecleado));

    const { container } = render(<FechaLocal fecha={guardado} etiqueta={false} />);

    // `es-ES` con `timeStyle: "short"` no rellena la hora con cero: es "1:00", no "01:00".
    await waitFor(() => {
      expect(container.textContent).toContain("1:00");
    });
    expect(container.textContent, "el día no es el que tecleé").toContain("23");
    // Y NO es la hora de UTC, que para ese mismo instante serían las 6:00.
    expect(container.textContent, "pintó la hora UTC").not.toContain("6:00");
  });

  it("y en UTC ese mismo instante sería OTRO día: por eso el test no es trivial", () => {
    // Si alguien "simplifica" `FechaLocal` volviendo a `timeZone: "UTC"`, este es el valor que
    // vería el admin en vez del suyo. Clavado para que el de arriba no pueda pasar por casualidad.
    const guardado = new Date(comoElFormulario("2026-10-23T01:00"));
    const enUtc = guardado.toLocaleString("es-ES", {
      timeZone: "UTC",
      dateStyle: "medium",
      timeStyle: "short",
    });
    expect(enUtc).toContain("6:00"); // la 1:00 en UTC-5 son las 6:00 UTC
  });
});
