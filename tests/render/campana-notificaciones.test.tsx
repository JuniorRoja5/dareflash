/**
 * La CAMPANA de avisos (escritorio) y el menú del INVITADO, render real (jsdom). Sustituyen a una maqueta
 * —un "3" fijo en la campana, que veía también el invitado, y un avatar con la inicial de "Invitado"—.
 *
 *  - el badge es el número REAL, NEUTRO (nunca lima: la lima es dinero), sin nada nuevo no se pinta, y
 *    pasado el tope dice "99+";
 *  - abrir pide exactamente `NOTIF_DESPLEGABLE` y marca como leídas SOLO las que no lo estaban;
 *  - "Ver todas" aparece cuando hay más de las que caben;
 *  - el invitado ve una silueta genérica, no la inicial de nadie.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NOTIF_DESPLEGABLE } from "@/config/constants";

const mocks = vi.hoisted(() => ({ getJson: vi.fn(), postJsonCsrf: vi.fn() }));

vi.mock("@/lib/cliente-http", () => ({
  getJson: mocks.getJson,
  postJsonCsrf: mocks.postJsonCsrf,
}));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { CampanaNotificaciones } from "@/app/(app)/(shell)/campana-notificaciones";
import { MenuCuenta } from "@/app/(app)/(shell)/menu-cuenta";

beforeEach(() => {
  mocks.getJson.mockReset();
  mocks.postJsonCsrf.mockReset();
});

const campana = () => screen.getByRole("button", { name: /Notificaciones/ });

describe("el badge de la campana", () => {
  it("dice el número real de no-leídas, en NEUTRO", () => {
    render(<CampanaNotificaciones noLeidas={5} />);
    expect(campana().getAttribute("aria-label")).toBe("Notificaciones (5 sin leer)");
    const badge = screen.getByText("5");
    expect(badge.className).toContain("bg-text-dim");
    expect(badge.className).not.toMatch(/money|lime|action/);
  });

  it("sin nada nuevo no pinta número (ni el '3' de la maqueta)", () => {
    const { container } = render(<CampanaNotificaciones noLeidas={0} />);
    expect(campana().getAttribute("aria-label")).toBe("Notificaciones");
    expect(container.textContent).toBe("");
  });

  it("pasado el tope dice 99+", () => {
    render(<CampanaNotificaciones noLeidas={150} />);
    expect(screen.getByText("99+")).toBeDefined();
  });
});

describe("el desplegable", () => {
  const item = (id: string, leida: boolean) => ({
    id,
    texto: `Aviso ${id}`,
    href: "/perfil",
    leida,
    creadaMs: Date.now() - 60_000,
  });

  it("pide exactamente los del desplegable, y marca como leídas SOLO las no leídas", async () => {
    mocks.getJson.mockResolvedValue({
      ok: true,
      status: 200,
      code: "",
      data: {
        items: [item("a", false), item("b", true), item("c", false)],
        nextCursor: null,
        noLeidas: 2,
      },
    });
    mocks.postJsonCsrf.mockResolvedValue({
      ok: true,
      status: 200,
      code: "",
      data: { noLeidas: 0 },
    });

    render(<CampanaNotificaciones noLeidas={2} />);
    fireEvent.click(campana());

    await waitFor(() => expect(screen.getByText("Aviso a")).toBeDefined());
    expect(mocks.getJson).toHaveBeenCalledWith(`/api/notificaciones?limite=${NOTIF_DESPLEGABLE}`);
    await waitFor(() =>
      expect(mocks.postJsonCsrf).toHaveBeenCalledWith("/api/notificaciones/leidas", {
        ids: ["a", "c"],
      }),
    );
    // Sin más páginas no hay "Ver todas".
    expect(screen.queryByText("Ver todas")).toBeNull();
    // El badge baja con lo que devuelve el servidor.
    await waitFor(() => expect(campana().getAttribute("aria-label")).toBe("Notificaciones"));
  });

  it("si hay más de las que caben, 'Ver todas' lleva a /notificaciones", async () => {
    mocks.getJson.mockResolvedValue({
      ok: true,
      status: 200,
      code: "",
      data: { items: [item("a", true)], nextCursor: "x.y", noLeidas: 0 },
    });
    render(<CampanaNotificaciones noLeidas={0} />);
    fireEvent.click(campana());
    const ver = await screen.findByText("Ver todas");
    expect(ver.closest("a")?.getAttribute("href")).toBe("/notificaciones");
    // Todo estaba leído: no se manda nada a marcar.
    expect(mocks.postJsonCsrf).not.toHaveBeenCalled();
  });

  it("vacío = invitación a actuar, no un error", async () => {
    mocks.getJson.mockResolvedValue({
      ok: true,
      status: 200,
      code: "",
      data: { items: [], nextCursor: null, noLeidas: 0 },
    });
    render(<CampanaNotificaciones noLeidas={0} />);
    fireEvent.click(campana());
    expect(await screen.findByText(/Aún no tienes avisos/)).toBeDefined();
  });
});

describe("el menú del INVITADO", () => {
  it("una silueta genérica, sin la inicial de 'Invitado' ni de nadie", () => {
    const { container } = render(<MenuCuenta usuario={null} />);
    const boton = screen.getByRole("button");
    expect(boton.getAttribute("aria-label")).toBe("Acceder");
    // El avatar de antes pintaba una "I": con la silueta, el botón no lleva letras.
    expect(container.textContent?.trim()).toBe("");
  });

  it("con sesión, su avatar (la inicial de SU nombre)", () => {
    render(<MenuCuenta usuario={{ nombre: "Lucía", imagen: null }} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Tu cuenta");
    expect(screen.getByText("L")).toBeDefined();
  });
});
