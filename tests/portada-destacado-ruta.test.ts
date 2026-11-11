/**
 * LA RUTA DEL DESTACADO DE LA PORTADA (Fase 9 · P14): un MODERADOR no puede marcarlo (ni quitarlo); el
 * ADMIN sí. La regla de qué reto se puede destacar y el AuditLog se prueban en `portada.test`.
 *
 * Para romperlo a propósito: quitar el `requireRole("ADMIN")` de la ruta (rojo el del moderador).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  rol: "ADMIN" as "ADMIN" | "MODERATOR",
  marcar: vi.fn(),
  quitar: vi.fn(),
}));

vi.mock("@/server/auth/mutating-route", () => ({
  mutatingRoute:
    (handler: (req: Request, ctx: unknown, rc: unknown) => Promise<Response>) =>
    (req: Request, rc: unknown) =>
      handler(req, { prisma: {} }, rc),
}));
vi.mock("@/server/auth/rbac", () => ({
  requireRole: async (minimo: string) => {
    if (minimo === "ADMIN" && H.rol !== "ADMIN") throw new Error("FORBIDDEN");
    return { userId: "u-admin" };
  },
}));
vi.mock("@/server/services/portada", () => ({
  marcarDestacado: H.marcar,
  quitarDestacado: H.quitar,
}));

const { POST } = await import("../src/app/api/panel/retos/[id]/portada/route");

const pedir = (accion: string) =>
  POST(
    new Request("http://test/api/panel/retos/r1/portada", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accion }),
    }),
    { params: Promise.resolve({ id: "r1" }) },
  );

beforeEach(() => {
  H.rol = "ADMIN";
  H.marcar.mockReset().mockResolvedValue({ estado: "hecho" });
  H.quitar.mockReset().mockResolvedValue({ estado: "hecho" });
});

describe("POST /api/panel/retos/[id]/portada", () => {
  it("un MODERADOR no puede marcarlo ni quitarlo (403), y no se llama al servicio", async () => {
    H.rol = "MODERATOR";
    expect((await pedir("DESTACAR")).status).toBe(403);
    expect((await pedir("QUITAR")).status).toBe(403);
    expect(H.marcar).not.toHaveBeenCalled();
    expect(H.quitar).not.toHaveBeenCalled();
  });

  it("el ADMIN marca con SU id; un reto no abierto se devuelve como 409", async () => {
    expect((await pedir("DESTACAR")).status).toBe(200);
    expect(H.marcar).toHaveBeenCalledWith({}, { challengeId: "r1", adminId: "u-admin" });
    H.marcar.mockResolvedValueOnce({ estado: "rechazado", motivo: "NO_ABIERTO" });
    expect((await pedir("DESTACAR")).status).toBe(409);
    expect((await pedir("OTRA")).status).toBe(400);
  });
});
