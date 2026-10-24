/**
 * LO QUE SE LE DICE A LA GENTE DE UN RETO QUE AÚN NO HA ABIERTO.
 *
 * El detalle le ponía "Reto cerrado" y la tarjeta contaba atrás hacia su cierre. Las dos cosas son
 * datos falsos, y los tests de antes no los veían porque miraban la ventana como un sí/no.
 *
 * Para romperlo: volver a `"Reto cerrado"` en el botón (rojo), quitar el `hacia="apertura"` del
 * marcador (rojo: la cuenta se pone en alarma y desaparece el "Abre en"), o quitar la chapa (rojo).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { BotonParticipar } from "@/app/(app)/(shell)/retos/[codigo]/participar";
import { TarjetaReto } from "@/app/(app)/(shell)/retos/tarjeta-reto";
import { Marcador } from "@/components/ui/marcador";
import { tokenCuentaAtras } from "@/components/ui/logic";
import { ETIQUETA_RETO_PROXIMAMENTE } from "@/config/constants";
import type { RetoPublicoVista } from "@/server/services/retos-publico";

afterEach(cleanup);

const DIA = 86_400_000;

const BASE: RetoPublicoVista = {
  publicCode: "abc12345",
  slug: "reto-de-prueba",
  titulo: "Reto de prueba",
  categoria: "fitness",
  premioCents: 50_000,
  startsAtMs: Date.now() - DIA,
  deadlineMs: Date.now() + DIA,
  coverImage: null,
  soloVip: false,
  sponsor: null,
};

const pintar = (over: Partial<RetoPublicoVista> = {}) =>
  render(<TarjetaReto reto={{ ...BASE, ...over }} />).container;

/** Un reto que abre dentro de un día y cierra dentro de siete. */
const FUTURO: Partial<RetoPublicoVista> = {
  startsAtMs: Date.now() + DIA,
  deadlineMs: Date.now() + 7 * DIA,
};

describe("la tarjeta de un reto que aún no ha abierto", () => {
  it("lleva la chapa «Próximamente»", () => {
    const c = pintar(FUTURO);
    expect(c.querySelector("[data-reto-chapa-proximamente]")).toBeTruthy();
    expect(c.textContent).toContain(ETIQUETA_RETO_PROXIMAMENTE);
  });

  it("y dice «Abre en», que es lo que desambigua el número", () => {
    // Sin esa palabra, "1 d 00 h" junto a un premio se lee como el tiempo que queda para
    // participar — exactamente lo contrario de lo que pasa.
    expect(pintar(FUTURO).textContent).toContain("Abre en");
  });

  it("un reto ABIERTO no lleva ni la chapa ni el «Abre en»", () => {
    const c = pintar();
    expect(c.querySelector("[data-reto-chapa-proximamente]")).toBeNull();
    expect(c.textContent).not.toContain("Abre en");
  });

  it("y uno EXCLUSIVO que además es futuro lleva las DOS chapas, sin pisarse", () => {
    const c = pintar({ ...FUTURO, soloVip: true });
    expect(c.querySelector("[data-reto-chapa-proximamente]")).toBeTruthy();
    expect(c.querySelector("[data-reto-chapa-vip]")).toBeTruthy();
  });
});

describe("el botón del detalle", () => {
  const boton = (props: Partial<Parameters<typeof BotonParticipar>[0]> = {}) =>
    render(
      <BotonParticipar
        challengeId="c-1"
        publicCode="abc12345"
        slug="reto-de-prueba"
        autenticado
        activo={false}
        {...props}
      />,
    ).container;

  it("un reto que aún no ha abierto NO dice «Reto cerrado»", () => {
    const c = boton({ fase: "proximamente" });
    expect(c.textContent, "sigue diciendo que está cerrado").not.toContain("Reto cerrado");
    expect(c.textContent).toContain("Aún no ha abierto");
  });

  it("uno que SÍ cerró sigue diciéndolo: lo que cambia es el caso, no el copy de siempre", () => {
    expect(boton({ fase: "cerrado" }).textContent).toContain("Reto cerrado");
  });

  it("y el defecto es «cerrado»: un llamante que no pase la fase no promete una apertura", () => {
    expect(boton().textContent).toContain("Reto cerrado");
  });

  it("los dos están DESHABILITADOS: ni uno ni otro admite participación", () => {
    for (const fase of ["proximamente", "cerrado"] as const) {
      const b = boton({ fase }).querySelector("button");
      expect(b?.hasAttribute("disabled"), fase).toBe(true);
    }
  });
});

describe("la cuenta a la apertura no es una alarma", () => {
  it("por debajo de 24 h sigue en `time`, no en `alarm`", () => {
    // El rojo significa "se te acaba el tiempo para participar". A un reto que abre en tres horas
    // eso le pide prisa por algo que todavía no se puede hacer.
    const tresHoras = 3 * 3_600_000;
    expect(tokenCuentaAtras(tresHoras, "apertura")).toBe("time");
    // Y la cuenta al CIERRE sigue comportándose como siempre: esto no relaja la regla de siempre.
    expect(tokenCuentaAtras(tresHoras, "cierre")).toBe("alarm");
    expect(tokenCuentaAtras(tresHoras)).toBe("alarm");
  });

  it("el marcador antepone «Abre en» solo cuando cuenta a la apertura", () => {
    const abre = render(
      <Marcador cents={1000} deadlineMs={Date.now() + DIA} hacia="apertura" />,
    ).container;
    const cierra = render(<Marcador cents={1000} deadlineMs={Date.now() + DIA} />).container;

    expect(abre.textContent).toContain("Abre en");
    expect(cierra.textContent).not.toContain("Abre en");
  });
});
