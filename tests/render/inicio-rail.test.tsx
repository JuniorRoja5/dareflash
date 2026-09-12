/**
 * EL RAIL "Top Ranking" DE LA PORTADA pinta el avatar de verdad.
 *
 * Es el otro sitio (además de /ranking) que usa `FilaPuesto`, y el que ve cualquiera que entra: el
 * servicio le daba la foto y la fila la tiraba. Se renderiza la PÁGINA real (componente de servidor,
 * `await` y al DOM), con el servicio del ranking sustituido y las secciones ajenas al rail apagadas.
 *
 * Para romperlo a propósito: pasar `imagen={null}` en el rail (rojo).
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const FOTO = "/avatars/ganadora.webp";

vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/server/services/ranking", () => ({
  rankingMensual: async () => ({
    filas: [
      {
        userId: "u1",
        username: "ganadora",
        displayName: null,
        image: FOTO,
        victorias: 3,
        puntos: 120,
      },
      {
        userId: "u2",
        username: "segundo",
        displayName: null,
        image: null,
        victorias: 1,
        puntos: 40,
      },
    ],
    cursor: null,
  }),
}));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});
// Lo que no es el rail: fuera, para que el test mire solo lo que prueba.
vi.mock("@/components/ui/fondo-video", () => ({ FondoVideo: () => null }));
vi.mock("@/app/(app)/(shell)/inicio/boost-destacados", () => ({ BoostDestacados: () => null }));
vi.mock("@/app/(app)/(shell)/inicio/hero-destacado", () => ({ HeroDestacado: () => null }));
vi.mock("@/app/(app)/(shell)/inicio/retos-destacados", () => ({ RetosDestacados: () => null }));
vi.mock("@/app/(app)/(shell)/inicio/stats-inicio", () => ({ StatsInicio: () => null }));

import InicioPage from "@/app/(app)/(shell)/inicio/page";

describe("rail Top Ranking de la portada", () => {
  it("pinta la foto de quien la tiene y la inicial de quien no", async () => {
    render(await InicioPage());
    const rail = screen.getByRole("heading", { name: "Top Ranking" }).closest("aside")!;

    const imgs = [...rail.querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([FOTO]);
    expect(imgs[0]?.getAttribute("loading")).toBe("lazy");
    expect(within(rail).getByText("@segundo")).toBeDefined();
    expect(within(rail).getByText("S")).toBeDefined();
  });
});
