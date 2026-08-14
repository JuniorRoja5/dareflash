/**
 * URL de reproducción FIRMADA — con DIENTES. `firmarUrlHls` (token de directorio) y el guardarrail
 * `reproduccionFirmada` (solo PUBLISHED) son PUROS. El endpoint se prueba con mocks de BD/env.
 * El vector de firma es fijo (regresión del algoritmo); la firma real contra Bunny la verifica Junior
 * reproduciendo una URL.
 *
 * CONTRATO del endpoint (Rama 3): es PÚBLICO. Un INVITADO puede reproducir un video PUBLISHED (el feed
 * es público). Ya NO exige sesión; lo que se conserva es el guardarrail de ESTADO (no-PUBLISHED -> 404).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../src/app/api/videos/[id]/reproduccion/route";
import { firmarUrlHls, reproduccionFirmada } from "../src/server/services/bunny";

// La ruta consume estos módulos por import DINÁMICO en tiempo de llamada; vitest iza los vi.mock por
// encima de los imports, así que las llamadas a GET() ven los dobles. Ya NO se mockea la sesión: el
// endpoint no la consulta (es público).
const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/server/db/client", () => ({ prisma: { video: { findUnique: mocks.findUnique } } }));
vi.mock("@/config/env", () => ({
  env: { BUNNY_CDN_HOSTNAME: "cdn.test.b-cdn.net", BUNNY_TOKEN_AUTH_KEY: "clave-test-xyz" },
}));

const tokenDe = (url: string): string | null => new URL(url).searchParams.get("token");

describe("firmarUrlHls (puro)", () => {
  it("VECTOR CONOCIDO: clave+videoId+expiración fijos -> token esperado (url-safe)", () => {
    const { src, poster } = firmarUrlHls({
      hostname: "cdn.ejemplo",
      videoId: "video-abc-123",
      claveToken: "clave-de-firma-de-prueba",
      expiraEnSeg: 7200,
      ahoraMs: 0,
    });
    const TOKEN = "Hf1SBQkt8PjjJLdAmdZcfzD_33UT0CaRGTRGBxr7kqs";
    const cola = `?token=${TOKEN}&token_path=%2Fvideo-abc-123%2F&expires=7200`;
    expect(src).toBe(`https://cdn.ejemplo/video-abc-123/playlist.m3u8${cola}`);
    expect(poster).toBe(`https://cdn.ejemplo/video-abc-123/thumbnail.jpg${cola}`);
    expect(TOKEN).not.toMatch(/[+/=]/); // base64 URL-SAFE (sin +, /, =)
  });

  it("cambiar la CLAVE cambia el token (la firma depende de la clave)", () => {
    const base = { hostname: "h", videoId: "v", expiraEnSeg: 60, ahoraMs: 0 };
    const a = firmarUrlHls({ ...base, claveToken: "clave-A" });
    const b = firmarUrlHls({ ...base, claveToken: "clave-B" });
    expect(tokenDe(a.src)).not.toBe(tokenDe(b.src));
  });

  it("token de DIRECTORIO: playlist y póster comparten el MISMO token y token_path del directorio", () => {
    const { src, poster } = firmarUrlHls({
      hostname: "h",
      videoId: "vid9",
      claveToken: "k",
      expiraEnSeg: 60,
      ahoraMs: 0,
    });
    expect(tokenDe(src)).toBe(tokenDe(poster)); // misma firma cubre playlist + segmentos + póster
    expect(new URL(src).searchParams.get("token_path")).toBe("/vid9/");
  });
});

describe("reproduccionFirmada (guardarrail puro)", () => {
  const CFG = { hostname: "cdn.test", claveToken: "k", expiraEnSeg: 7200, ahoraMs: 0 };

  it("SOLO PUBLISHED es reproducible; el resto (y sin fila) -> null (sin URL)", () => {
    for (const status of ["PENDING", "FAILED", "REJECTED", "REMOVED"]) {
      // DIENTES: si se quita el check status==="PUBLISHED", un PENDING devolvería URL -> ROJO.
      expect(reproduccionFirmada({ bunnyVideoId: "g", status }, CFG)).toBeNull();
    }
    expect(reproduccionFirmada(null, CFG)).toBeNull();

    const ok = reproduccionFirmada({ bunnyVideoId: "g", status: "PUBLISHED" }, CFG);
    expect(ok).not.toBeNull();
    expect(ok?.src).toContain("/g/playlist.m3u8");
    expect(ok?.poster).toContain("/g/thumbnail.jpg");
  });
});

describe("GET /api/videos/[id]/reproduccion", () => {
  const req = (): Request => new Request("http://test/api/videos/vid1/reproduccion");
  const ctx = { params: Promise.resolve({ id: "vid1" }) };

  beforeEach(() => {
    mocks.findUnique.mockReset();
  });

  it("INVITADO (sin sesión) + PUBLISHED -> 200: el endpoint NO exige sesión (contrato nuevo)", async () => {
    // DIENTES: si se reintrodujera el gate de sesión, un invitado recibiría 401 y esto caería en rojo.
    mocks.findUnique.mockResolvedValue({ bunnyVideoId: "g", status: "PUBLISHED" });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
  });

  it("INVITADO + PENDING -> 404 SIN URL (guardarrail de estado intacto para invitados)", async () => {
    mocks.findUnique.mockResolvedValue({ bunnyVideoId: "g", status: "PENDING" });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("playlist.m3u8");
  });

  it("Video no-PUBLISHED (cada estado) y sin fila -> 404 SIN URL, aun sin sesión", async () => {
    for (const status of ["PENDING", "FAILED", "REJECTED", "REMOVED"]) {
      mocks.findUnique.mockResolvedValue({ bunnyVideoId: "g", status });
      const res = await GET(req(), ctx);
      expect(res.status).toBe(404);
    }
    mocks.findUnique.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
  });

  it("Video PUBLISHED -> 200 con {src, poster} firmadas", async () => {
    mocks.findUnique.mockResolvedValue({ bunnyVideoId: "g", status: "PUBLISHED" });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { src: string; poster: string };
    expect(body.src).toContain("cdn.test.b-cdn.net/g/playlist.m3u8");
    expect(body.poster).toContain("/g/thumbnail.jpg");
    expect(body.src).toContain("token=");
    expect(body.src).toContain("token_path=");
  });
});
