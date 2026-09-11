/**
 * EL CONMUTADOR DE /ranking: etiquetas FIJAS de fuente única, el título del reto DENTRO de su vista, y
 * la vista del reto solo si su top tiene a alguien. Render real (jsdom).
 *
 * Antes el segundo botón llevaba el título crudo del último reto cerrado: una pestaña de ancho
 * variable que enseñaba títulos largos y de prueba, y que podía llevar a "Ese reto cerró sin
 * participaciones publicadas" (una pestaña muerta).
 *
 * Para romperlo a propósito: volver a poner `datos.reto.titulo` como etiqueta del botón (rojo), o
 * pintar el conmutador con un top vacío (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  cabeceraReto,
  type DatosRanking,
  ETIQUETAS_VISTA,
  RankingVistas,
} from "@/app/(app)/(shell)/ranking/ranking-vistas";

const TITULO_LARGO = "50 abdominales en un minuto sin parar y sin apoyar las rodillas (prueba)";

function datos(reto: DatosRanking["reto"]): DatosRanking {
  return {
    mensual: [{ userId: "u1", username: "lucia", displayName: null, victorias: 2, puntos: 80 }],
    cursorInicial: null,
    reto,
    yo: null,
  };
}

const conTop = (titulo = TITULO_LARGO): DatosRanking["reto"] => ({
  titulo,
  codigo: "ABC234",
  top: [{ submissionId: "s1", userId: "u2", username: "mario", votos: 7, puesto: 1 }],
});

const conmutador = () => screen.queryByRole("group", { name: "Vista de la clasificación" });

describe("con un reto cerrado con top", () => {
  it("la pestaña dice 'Último reto' (fija) y NO lleva el título", () => {
    render(<RankingVistas datos={datos(conTop())} />);
    const grupo = conmutador();
    expect(grupo).not.toBeNull();
    const botones = within(grupo!)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(botones).toEqual([ETIQUETAS_VISTA.mensual, ETIQUETAS_VISTA.reto]);
    expect(grupo!.textContent).not.toContain(TITULO_LARGO);
  });

  it("el título REAL sale como cabecera DENTRO de la vista del reto", () => {
    render(<RankingVistas datos={datos(conTop())} />);
    // Antes de abrir la vista del reto, el título no está en la página.
    expect(screen.queryByText(cabeceraReto(TITULO_LARGO))).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: ETIQUETAS_VISTA.reto }));

    const cabecera = screen.getByRole("heading", { level: 2 });
    expect(cabecera.textContent).toBe(cabeceraReto(TITULO_LARGO));
    // Y la pestaña sigue sin él: la cabecera es el único sitio.
    expect(conmutador()!.textContent).not.toContain(TITULO_LARGO);
    expect(screen.getByText("@mario")).toBeDefined();
  });

  it("la etiqueta no depende del título: igual con uno corto que con uno larguísimo", () => {
    const { unmount } = render(<RankingVistas datos={datos(conTop("A"))} />);
    const corto = conmutador()!.textContent;
    unmount();
    render(<RankingVistas datos={datos(conTop(TITULO_LARGO))} />);
    expect(conmutador()!.textContent).toBe(corto);
  });
});

describe("sin reto con participaciones", () => {
  it("sin reto: no hay conmutador, solo 'Este mes'", () => {
    render(<RankingVistas datos={datos(null)} />);
    expect(conmutador()).toBeNull();
    expect(screen.getAllByText("@lucia").length).toBeGreaterThan(0);
    expect(screen.queryByText(/cerró sin participaciones publicadas/)).toBeNull();
  });

  it("aunque llegara un reto con top VACÍO, no se ofrece pestaña (ni se pinta el aviso muerto)", () => {
    render(<RankingVistas datos={datos({ titulo: "Vacío", codigo: "X", top: [] })} />);
    expect(conmutador()).toBeNull();
    expect(screen.queryByText(/cerró sin participaciones publicadas/)).toBeNull();
    expect(screen.queryByText(/Vacío/)).toBeNull();
  });
});

describe("fuente única de las etiquetas (estructural)", () => {
  it('"Este mes" y "Último reto" se escriben UNA vez en /ranking, en la constante', () => {
    const dir = path.resolve(__dirname, "..", "..", "src", "app", "(app)", "(shell)", "ranking");
    const codigo = ["ranking-vistas.tsx", "page.tsx", "podio-ranking.tsx"]
      .map((f) => readFileSync(path.join(dir, f), "utf8"))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const etiqueta of [ETIQUETAS_VISTA.mensual, ETIQUETAS_VISTA.reto]) {
      expect(codigo.split(`"${etiqueta}"`).length - 1, etiqueta).toBe(1);
    }
  });
});
