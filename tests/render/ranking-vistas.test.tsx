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

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getJson: vi.fn() }));
vi.mock("@/lib/cliente-http", () => ({ getJson: mocks.getJson }));

import {
  cabeceraReto,
  type DatosRanking,
  ETIQUETAS_VISTA,
  RankingVistas,
} from "@/app/(app)/(shell)/ranking/ranking-vistas";

const TITULO_LARGO = "50 abdominales en un minuto sin parar y sin apoyar las rodillas (prueba)";

function datos(reto: DatosRanking["reto"]): DatosRanking {
  return {
    mensual: [
      { userId: "u1", username: "lucia", displayName: null, image: null, victorias: 2, puntos: 80 },
    ],
    cursorInicial: null,
    reto,
    yo: null,
  };
}

const conTop = (titulo = TITULO_LARGO): DatosRanking["reto"] => ({
  titulo,
  codigo: "ABC234",
  top: [{ submissionId: "s1", userId: "u2", username: "mario", image: null, votos: 7, puesto: 1 }],
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

describe("los avatares llegan a TODAS las filas", () => {
  // Tal cual los manda el servicio (y `/api/ranking`): `image`, no otro nombre.
  const fila = (n: number, image: string | null) => ({
    userId: `u${n}`,
    username: `persona${n}`,
    displayName: null,
    image,
    victorias: 10 - n,
    puntos: 40,
  });
  const foto = (n: number) => `/avatars/persona${n}.webp`;
  const srcs = (c: HTMLElement) => [...c.querySelectorAll("img")].map((i) => i.getAttribute("src"));

  it("la lista del mes (del 4º en adelante) pinta la foto de cada uno, o su inicial", () => {
    const { container } = render(
      <RankingVistas
        datos={{
          mensual: [1, 2, 3, 4, 5].map((n) => fila(n, n === 5 ? null : foto(n))),
          cursorInicial: null,
          reto: null,
          yo: null,
        }}
      />,
    );
    const lista = screen.getByLabelText(/Clasificación \(del 4º en adelante\)/);
    expect(srcs(lista)).toEqual([foto(4)]);
    expect(within(lista).getByText("P")).toBeDefined(); // el 5º, sin foto
    // El podio también lleva las suyas (1º-3º, dos veces: escritorio + móvil).
    expect(srcs(container)).toContain(foto(1));
  });

  it("las filas de 'Ver más' (de /api/ranking) también traen la foto", async () => {
    mocks.getJson.mockResolvedValue({
      ok: true,
      status: 200,
      code: "",
      data: { filas: [fila(6, foto(6))], cursor: null },
    });
    render(
      <RankingVistas
        datos={{
          mensual: [1, 2, 3, 4].map((n) => fila(n, null)),
          cursorInicial: "cursor-opaco",
          reto: null,
          yo: null,
        }}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver más" }));
    });
    const lista = screen.getByLabelText(/Clasificación \(del 4º en adelante\)/);
    expect(srcs(lista)).toEqual([foto(6)]);
  });

  it("el top del reto pinta la foto de cada participante", () => {
    render(
      <RankingVistas
        datos={datos({
          titulo: "Reto",
          codigo: "ABC234",
          top: [
            {
              submissionId: "s1",
              userId: "u2",
              username: "mario",
              image: foto(2),
              votos: 7,
              puesto: 1,
            },
            { submissionId: "s2", userId: "u3", username: "ana", image: null, votos: 3, puesto: 2 },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: ETIQUETAS_VISTA.reto }));
    const seccion = screen.getByRole("region", { name: cabeceraReto("Reto") });
    expect(srcs(seccion)).toEqual([foto(2)]);
    expect(within(seccion).getByText("A")).toBeDefined();
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
