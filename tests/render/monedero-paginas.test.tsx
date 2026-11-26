/**
 * LAS DOS LISTAS DEL MONEDERO PASAN DE PÁGINA CADA UNA POR SU CUENTA (PU1).
 *
 * /wallet enseña «Tus solicitudes» y «Últimos movimientos», las dos por keyset con `PasosKeyset`, de
 * 10 en 10, REEMPLAZANDO la página (nada de «Ver más» que acumule). Lo que se fija:
 *  - cada servicio recibe el cursor de SU parámetro (`solicitudes=`, `movimientos=`), nunca el de la
 *    otra lista ni el genérico `cursor=`, y pide 10 filas;
 *  - los enlaces de una lista llevan la posición de la otra TAL CUAL (cursor y pila): pasar de página
 *    en los movimientos deja las solicitudes donde estaban, y al revés;
 *  - «Anterior» está en una página posterior aunque se haya quedado vacía;
 *  - las cifras del hero siguen saliendo de su consulta sobre todo el historial, no de la página.
 *
 * Para romperlo: no pasar `conservarParaMovimientos` al `filtro` de los movimientos (rojo), leer
 * los dos cursores del mismo parámetro (rojo), o dar a las dos listas las mismas claves (rojo).
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

const H = vi.hoisted(() => ({
  llamadasRetiradas: [] as unknown[],
  llamadasMovimientos: [] as unknown[],
  historial: { items: [] as unknown[], nextCursor: null as string | null },
  movimientos: { items: [] as unknown[], nextCursor: null as string | null },
  porEstado: [] as unknown[],
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/wallet",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/server/auth/solo-participante", () => ({ apartarCuentaEmpresa: async () => {} }));
vi.mock("@/server/auth/rbac", () => ({
  requireVerifiedUser: async () => ({ userId: "u1" }),
  AuthError: class extends Error {},
}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    user: { findUniqueOrThrow: async () => ({ walletBalanceCents: 0 }) },
    withdrawal: { groupBy: async () => H.porEstado },
  },
}));
vi.mock("@/server/services/retirada", () => ({
  misMovimientosMonedero: async (_db: unknown, _u: unknown, opts: unknown) => {
    H.llamadasMovimientos.push(opts);
    return H.movimientos;
  },
  misRetiradas: async (_db: unknown, _u: unknown, opts: unknown) => {
    H.llamadasRetiradas.push(opts);
    return H.historial;
  },
}));
vi.mock("@/server/services/metodos-pago", () => ({ misMetodosPago: async () => [] }));
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import WalletPage from "@/app/(app)/(shell)/wallet/page";

const T0 = new Date("2026-03-01T10:00:00Z");
const retirada = (id: string) => ({
  id,
  amountCents: 6000,
  currency: "USD",
  status: "PENDING",
  metodo: "BANK",
  pista: "1332",
  createdAt: T0,
  actualizadaEn: null,
  motivoRechazo: null,
});
const mov = (id: string) => ({
  id,
  amountCents: 5000,
  currency: "USD",
  concepto: "PRIZE",
  createdAt: T0,
});

async function pagina(sp: Record<string, string>) {
  const c = render(
    <>{await resolverServidor(await WalletPage({ searchParams: Promise.resolve(sp) }))}</>,
  ).container;
  const enlaces = (seccion: string, rel: "prev" | "next") => {
    const a = c.querySelector<HTMLAnchorElement>(
      `section[aria-labelledby="${seccion}"] nav a[rel="${rel}"]`,
    );
    return a ? new URL(a.getAttribute("href")!, "https://x.test") : null;
  };
  return { c, enlaces };
}

// Las posiciones de partida: las dos listas en su página TRES (cursor + una página en la pila).
const SP = {
  solicitudes: "1767225600000.s3",
  solicitudes_pila: "1767225600000.s2",
  movimientos: "1767225600000.m3",
  movimientos_pila: "1767225600000.m2",
};

beforeEach(() => {
  H.llamadasRetiradas = [];
  H.llamadasMovimientos = [];
  H.historial = { items: [retirada("w1")], nextCursor: "1767225600000.s4" };
  H.movimientos = { items: [mov("mv1")], nextCursor: "1767225600000.m4" };
  H.porEstado = [];
});

describe("cada servicio recibe SU cursor y 10 filas", () => {
  it("solicitudes= va a misRetiradas y movimientos= a misMovimientosMonedero", async () => {
    await pagina(SP);
    expect(H.llamadasRetiradas).toEqual([{ cursor: SP.solicitudes, limite: 10 }]);
    expect(H.llamadasMovimientos).toEqual([{ cursor: SP.movimientos, limite: 10 }]);
  });

  it("el `cursor=` genérico no mueve ninguna de las dos", async () => {
    await pagina({ cursor: "1767225600000.zz" });
    expect(H.llamadasRetiradas).toEqual([{ cursor: null, limite: 10 }]);
    expect(H.llamadasMovimientos).toEqual([{ cursor: null, limite: 10 }]);
  });
});

describe("pasar de página en una NO mueve la otra", () => {
  it("los enlaces de los MOVIMIENTOS llevan las solicitudes tal cual", async () => {
    const { enlaces } = await pagina(SP);
    for (const rel of ["prev", "next"] as const) {
      const u = enlaces("movimientos", rel)!;
      expect(u, `falta el «${rel}» de los movimientos`).not.toBeNull();
      expect(u.searchParams.get("solicitudes"), `«${rel}» movió las solicitudes`).toBe(
        SP.solicitudes,
      );
      expect(u.searchParams.get("solicitudes_pila")).toBe(SP.solicitudes_pila);
      expect(u.pathname).toBe("/wallet");
      expect(u.hash).toBe("#movimientos");
    }
    // Y su propia posición sí cambia: hacia delante apila la actual; hacia atrás desapila.
    expect(enlaces("movimientos", "next")!.searchParams.get("movimientos")).toBe(
      "1767225600000.m4",
    );
    expect(enlaces("movimientos", "prev")!.searchParams.get("movimientos")).toBe(
      SP.movimientos_pila,
    );
  });

  it("los enlaces de las SOLICITUDES llevan los movimientos tal cual", async () => {
    const { enlaces } = await pagina(SP);
    for (const rel of ["prev", "next"] as const) {
      const u = enlaces("tus-solicitudes", rel)!;
      expect(u, `falta el «${rel}» de las solicitudes`).not.toBeNull();
      expect(u.searchParams.get("movimientos"), `«${rel}» movió los movimientos`).toBe(
        SP.movimientos,
      );
      expect(u.searchParams.get("movimientos_pila")).toBe(SP.movimientos_pila);
      expect(u.hash).toBe("#tus-solicitudes");
    }
    expect(enlaces("tus-solicitudes", "next")!.searchParams.get("solicitudes")).toBe(
      "1767225600000.s4",
    );
  });

  it("ningún enlace usa el `cursor=` / `pila=` genéricos", async () => {
    const { c } = await pagina(SP);
    for (const a of c.querySelectorAll("nav a[rel]")) {
      expect(a.getAttribute("href")).not.toMatch(/[?&](cursor|pila)=/);
    }
  });

  it("los dos `nav` se llaman distinto", async () => {
    const { c } = await pagina(SP);
    const nombres = [...c.querySelectorAll("nav[aria-label]")].map((n) =>
      n.getAttribute("aria-label"),
    );
    expect(nombres).toContain("Páginas de tus solicitudes");
    expect(nombres).toContain("Páginas de tus movimientos");
  });
});

describe("«Anterior» aunque la página se haya quedado vacía", () => {
  it("las dos listas vacías en una página posterior: su frase y su «Anterior»", async () => {
    H.historial = { items: [], nextCursor: null };
    H.movimientos = { items: [], nextCursor: null };
    const { c, enlaces } = await pagina(SP);
    expect(c.textContent).toContain("No quedan más solicitudes por aquí.");
    expect(c.textContent).toContain("No quedan más movimientos por aquí.");
    expect(enlaces("tus-solicitudes", "prev")).not.toBeNull();
    expect(enlaces("movimientos", "prev")).not.toBeNull();
    expect(enlaces("tus-solicitudes", "next")).toBeNull();
    expect(enlaces("movimientos", "next")).toBeNull();
  });

  it("en la primera página, vacía: la frase de siempre y sin pasos", async () => {
    H.historial = { items: [], nextCursor: null };
    H.movimientos = { items: [], nextCursor: null };
    const { c } = await pagina({});
    expect(c.textContent).toContain("Todavía no has pedido ningún cobro.");
    expect(c.textContent).toContain("Todavía no hay movimientos.");
    expect(c.querySelector("nav a[rel]")).toBeNull();
  });
});

describe("las cifras del hero no salen de la página", () => {
  it("«en curso» y «cobrados» vienen del groupBy de todo el historial", async () => {
    // La página trae UNA solicitud de 60 $; el historial entero, mucho más.
    H.porEstado = [
      { status: "PENDING", _sum: { amountCents: 123_400 } },
      { status: "PAID", _sum: { amountCents: 987_600 } },
    ];
    const { c } = await pagina(SP);
    const hero = c.querySelector('section[aria-labelledby="mi-saldo"]')!.textContent!;
    // Sin atarse al separador de miles de la moneda: lo que importa es la cifra.
    expect(hero).toMatch(/1\D?234/);
    expect(hero).toMatch(/9\D?876/);
  });
});
