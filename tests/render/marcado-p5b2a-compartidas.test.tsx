/**
 * EL MARCADO DE LAS PIEZAS COMPARTIDAS, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2a).
 *
 * La P5b2a mueve a los diccionarios el texto de las piezas que salen en muchas pantallas —la marca VIP,
 * «Boost», el emblema de nivel, los pasos de una lista paginada, «Cargando…», la pantalla de error, el
 * campo para copiar, el toque, la cuenta atrás— y la promesa es que en castellano NO cambia nada: ni una
 * letra, ni una etiqueta, ni una clase. Este fichero se escribió y se confirmó CONTRA EL CÓDIGO DE ANTES
 * (los snapshots de `__snapshots__/` son ese HTML); después de la extracción tiene que dar idéntico. Cubre
 * los estados que la semilla de las muestras no pinta (el toque enviado o fallido, el copiado, la cuenta
 * atrás con días, los pasos solo hacia atrás…).
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

const mocks = vi.hoisted(() => ({ postJsonCsrf: vi.fn() }));
vi.mock("@/lib/cliente-http", async (original) => ({
  ...(await original<typeof import("../../src/lib/cliente-http")>()),
  postJsonCsrf: mocks.postJsonCsrf,
}));

import { CampoCopiable } from "@/components/ui/campo-copiable";
import { CuentaAtras } from "@/components/ui/cuenta-atras";
import { DarToque } from "@/components/ui/dar-toque";
import { EmblemaDeNivel } from "@/components/ui/emblema-nivel";
import { ErrorPantalla } from "@/components/ui/error-pantalla";
import { PantallaCargando } from "@/components/ui/esqueleto";
import { EmblemaVipGrande, MarcaVip } from "@/components/ui/identidad-usuario";
import { AutorFeed, MarcaBoost } from "@/components/ui/marca-boost";
import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { NIVELES } from "@/lib/niveles";
import { PRIMERA } from "@/lib/paginacion-pila";

async function html(nodo: React.ReactNode): Promise<string> {
  return render(<>{await resolverServidor(nodo)}</>).container.innerHTML;
}

afterEach(() => {
  vi.useRealTimers();
  mocks.postJsonCsrf.mockReset();
});

describe("marcas que salen en todas partes", () => {
  it("la marca VIP, compacta y grande", async () => {
    expect(await html(<MarcaVip />)).toMatchSnapshot();
    expect(await html(<EmblemaVipGrande clase="df-vip-emblema" />)).toMatchSnapshot();
  });

  it("«Boost» y el autor destacado del feed", async () => {
    expect(await html(<MarcaBoost />)).toMatchSnapshot();
    expect(
      await html(
        <AutorFeed
          username="ana"
          displayName="Ana"
          destacado
          esVip
          colorNombre={null}
          claseNombre="a"
          claseHandle="b"
        />,
      ),
    ).toMatchSnapshot();
  });

  it("el emblema de cada nivel que tiene emblema", async () => {
    for (const n of NIVELES.filter((x) => x.emblema)) {
      expect(await html(<EmblemaDeNivel nivel={n} clase="h-6 w-6" />)).toMatchSnapshot(n.clave);
    }
  });
});

describe("pasos de una lista paginada", () => {
  it("solo «Siguiente», los dos, y solo «Anterior»", async () => {
    expect(
      await html(<PasosKeyset base="/x" aqui={PRIMERA} proximoCursor="c1" />),
    ).toMatchSnapshot();
    expect(
      await html(<PasosKeyset base="/x" aqui={{ cursor: "c1", pila: [] }} proximoCursor="c2" />),
    ).toMatchSnapshot();
    expect(
      await html(<PasosKeyset base="/x" aqui={{ cursor: "c1", pila: [] }} proximoCursor={null} />),
    ).toMatchSnapshot();
  });
});

describe("carga y error", () => {
  it("«Cargando…» de una pantalla de carga", async () => {
    expect(await html(<PantallaCargando>{null}</PantallaCargando>)).toMatchSnapshot();
  });

  it("la pantalla de error", async () => {
    expect(
      await html(<ErrorPantalla titulo="No se pudo cargar" retry={() => {}} />),
    ).toMatchSnapshot();
  });
});

describe("la cuenta atrás", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
  });

  it("con días, con horas y a cero", async () => {
    const H = 3_600_000;
    for (const ms of [6 * 24 * H + 4 * H, 2 * H + 41 * 60_000 + 9_000, -1]) {
      const { container, unmount } = render(<CuentaAtras deadlineMs={Date.now() + ms} />);
      await act(async () => {});
      expect(container.innerHTML).toMatchSnapshot(String(ms));
      unmount();
    }
  });
});

describe("copiar un campo", () => {
  it("antes, copiado y cuando el portapapeles falla", async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: escribir },
    });
    const { container, getByRole, unmount } = render(
      <CampoCopiable etiqueta="Tu enlace" valor="https://x.test/r/abc" id="enlace" principal />,
    );
    expect(container.innerHTML).toMatchSnapshot("antes");
    await act(async () => {
      fireEvent.click(getByRole("button"));
    });
    expect(container.innerHTML).toMatchSnapshot("copiado");
    unmount();

    escribir.mockRejectedValue(new Error("no"));
    const otro = render(<CampoCopiable etiqueta="Código" valor="abc" id="codigo" />);
    await act(async () => {
      fireEvent.click(otro.getByRole("button"));
    });
    expect(otro.container.innerHTML).toMatchSnapshot("fallo");
  });
});

describe("dar un toque", () => {
  it("el botón, enviado, rechazado y sin conexión", async () => {
    const pintar = async () => {
      const r = render(<DarToque userId="u1" />);
      return r;
    };
    const a = await pintar();
    expect(a.container.innerHTML).toMatchSnapshot("boton");

    mocks.postJsonCsrf.mockResolvedValue({ ok: true, status: 200, code: "", data: {} });
    await act(async () => {
      fireEvent.click(a.getByRole("button"));
    });
    expect(a.container.innerHTML).toMatchSnapshot("hecho");
    a.unmount();

    mocks.postJsonCsrf.mockResolvedValue({ ok: false, status: 400, code: "X", data: {} });
    const b = await pintar();
    await act(async () => {
      fireEvent.click(b.getByRole("button"));
    });
    expect(b.container.innerHTML).toMatchSnapshot("rechazado");
    b.unmount();

    mocks.postJsonCsrf.mockRejectedValue(new Error("red"));
    const c = await pintar();
    await act(async () => {
      fireEvent.click(c.getByRole("button"));
    });
    expect(c.container.innerHTML).toMatchSnapshot("sin conexión");
  });
});
