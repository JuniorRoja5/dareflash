/**
 * EL REDIRECTOR `/ir/{id}` (Fase 9 · P10): la ruta, con sus dependencias simuladas (la lógica del clic
 * se prueba contra la base en `publicidad-metricas.test.ts`).
 *
 * DIENTES: la IP sale SOLO de X-Real-IP (X-Forwarded-For no cuenta) y llega cifrada al servicio, nunca
 * en claro; un id raro, una campaña que ya no se sirve o un fallo mandan a la portada, nunca a una página
 * de error; y la respuesta no se cachea (cada clic tiene que llegar aquí para contarse).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const clicEnCampana = vi.fn();
vi.mock("@/server/services/publicidad-metricas", () => ({ clicEnCampana }));
vi.mock("@/server/cache/redis", () => ({ getRedis: () => null }));
vi.mock("@/server/http/api", async (original) => ({
  ...(await original<typeof import("../src/server/http/api")>()),
  depsRuta: async () => ({
    env: { APP_URL: "https://dareflash.test", AUTH_SECRET: "x".repeat(48) },
    prisma: {},
  }),
}));

const { GET } = await import("../src/app/ir/[id]/route");

const ID = "cmw54m7r4000b70o42hdqwyx3";
const pedir = (id: string, cabeceras: Record<string, string> = {}) =>
  GET(new Request(`https://dareflash.test/ir/${id}`, { headers: cabeceras }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  clicEnCampana.mockReset();
});

describe("/ir/{id}", () => {
  it("lleva a la web de la campaña, sin caché, con la IP CIFRADA de X-Real-IP", async () => {
    clicEnCampana.mockResolvedValue("https://panaderia.example.com/ofertas");
    const r = await pedir(ID, { "x-real-ip": "203.0.113.7" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://panaderia.example.com/ofertas");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const { publicidadId, ipKey } = clicEnCampana.mock.calls[0]![1];
    expect(publicidadId).toBe(ID);
    expect(ipKey).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(clicEnCampana.mock.calls)).not.toContain("203.0.113.7");
  });

  it("X-Forwarded-For NO es una IP: sin X-Real-IP, el clic no se puede acotar (ipKey null)", async () => {
    clicEnCampana.mockResolvedValue("https://panaderia.example.com/ofertas");
    await pedir(ID, { "x-forwarded-for": "203.0.113.7" });
    expect(clicEnCampana.mock.calls[0]![1].ipKey).toBeNull();
  });

  it("a la portada: un id raro (sin preguntar a la base), una campaña que ya no se sirve, un fallo", async () => {
    let r = await pedir("../../evil.example.com");
    expect(r.headers.get("location")).toBe("https://dareflash.test/");
    expect(clicEnCampana).not.toHaveBeenCalled();

    clicEnCampana.mockResolvedValue(null);
    r = await pedir(ID, { "x-real-ip": "203.0.113.7" });
    expect(r.headers.get("location")).toBe("https://dareflash.test/");

    clicEnCampana.mockRejectedValue(new Error("la base se ha caído"));
    r = await pedir(ID, { "x-real-ip": "203.0.113.7" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://dareflash.test/");
  });
});
