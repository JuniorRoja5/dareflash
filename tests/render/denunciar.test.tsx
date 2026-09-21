/**
 * EL BOTÓN DE DENUNCIAR — render real. Lo que se fija:
 *  - sobre lo PROPIO no existe (ni botón);
 *  - un invitado ve la puerta de entrar, no un formulario que la API va a rechazar;
 *  - sin el correo verificado se dice el motivo, y no se llama a la API;
 *  - los motivos son los del catálogo (uno solo, compartido con el servidor);
 *  - la confirmación es el COPY DEL SERVIDOR, y "ya nos habías avisado" se pinta como confirmación,
 *    nunca como error.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/cliente-http", async (orig) => ({
  ...(await orig<typeof import("@/lib/cliente-http")>()),
  postJsonCsrf: mocks.post,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/feed" }));

import { MOTIVOS_DENUNCIA, MSG_DENUNCIA_SIN_VERIFICAR } from "@/config/constants";
import { Denunciar } from "@/components/ui/denunciar";

const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, code: "", data });

function montar(props: Partial<Parameters<typeof Denunciar>[0]> = {}) {
  return render(
    <Denunciar
      targetType="COMMENT"
      targetId="c1"
      haySesion
      emailVerificado
      esMio={false}
      {...props}
    />,
  );
}
const abrir = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Denunciar" }));
};

beforeEach(() => {
  mocks.post.mockReset();
});

describe("cuándo se ofrece", () => {
  it("sobre lo PROPIO no se pinta nada", () => {
    const { container } = montar({ esMio: true });
    expect(container.innerHTML).toBe("");
  });

  it("un INVITADO ve la puerta de entrar, que vuelve aquí; no se llama a la API", () => {
    montar({ haySesion: false, emailVerificado: false });
    abrir();

    expect(screen.getByText("Inicia sesión para denunciar.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Iniciar sesión" }).getAttribute("href")).toBe(
      "/entrar?siguiente=%2Ffeed",
    );
    expect(screen.queryByText(MOTIVOS_DENUNCIA[0]!.texto)).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("con sesión pero SIN verificar el correo, se dice el motivo y no se llama a la API", () => {
    montar({ emailVerificado: false });
    abrir();

    expect(screen.getByText(MSG_DENUNCIA_SIN_VERIFICAR)).toBeDefined();
    expect(screen.queryByText(MOTIVOS_DENUNCIA[0]!.texto)).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});

describe("denunciar", () => {
  it("ofrece EXACTAMENTE los motivos del catálogo", () => {
    montar();
    abrir();

    for (const m of MOTIVOS_DENUNCIA) expect(screen.getByText(m.texto)).toBeDefined();
    expect(screen.getAllByRole("listitem")).toHaveLength(MOTIVOS_DENUNCIA.length);
  });

  it("manda el motivo elegido con su objeto, y pinta la confirmación del SERVIDOR", async () => {
    montar({ targetType: "VIDEO", targetId: "vid-9" });
    abrir();
    mocks.post.mockResolvedValueOnce(ok({ mensaje: "Gracias por avisar. Lo revisaremos." }, 201));

    await act(async () => {
      fireEvent.click(screen.getByText("Acoso o incitación al odio"));
    });

    expect(mocks.post).toHaveBeenCalledWith("/api/denuncias", {
      targetType: "VIDEO",
      targetId: "vid-9",
      reason: "ACOSO",
    });
    expect(screen.getByRole("status").textContent).toContain("Gracias por avisar.");
    // Y ya no ofrece volver a elegir motivo en el mismo diálogo.
    expect(screen.queryByText("Spam o engaño")).toBeNull();
  });

  it("'ya nos habías avisado' es una CONFIRMACIÓN, no un error", async () => {
    montar();
    abrir();
    mocks.post.mockResolvedValueOnce(ok({ mensaje: "Ya nos habías avisado de esto. Gracias." }));

    await act(async () => {
      fireEvent.click(screen.getByText("Spam o engaño"));
    });

    expect(screen.getByRole("status").textContent).toContain("Ya nos habías avisado");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("si el servidor lo rechaza, lo dice como aviso y no finge que se envió", async () => {
    montar();
    abrir();
    mocks.post.mockResolvedValueOnce(
      ok({ error: { code: "NOT_FOUND", message: "Este contenido ya no está disponible." } }, 404),
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Spam o engaño"));
    });

    expect(screen.getByRole("alert").textContent).toContain("ya no está disponible");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
