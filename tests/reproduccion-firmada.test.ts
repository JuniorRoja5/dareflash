/**
 * URL de reproducción FIRMADA — con DIENTES. `firmarUrlHls` (token de directorio) y el guardarrail
 * `reproduccionFirmada` (solo PUBLISHED) son PUROS. El endpoint se prueba con mocks de BD/env.
 * El vector de firma es fijo (regresión del algoritmo); la firma real contra Bunny la verifica Junior
 * reproduciendo una URL.
 *
 * CONTRATO del endpoint (Rama 3): es PÚBLICO. Un INVITADO puede reproducir un video visible (el feed
 * es público). Ya NO exige sesión.
 *
 * ┌─ LO QUE ESTE FICHERO NO PUEDE PROBAR, Y POR QUÉ IMPORTA DECIRLO ───────────────────────────────┐
 * │ Aquí la BD es un MOCK: el doble devuelve la fila que se le pide, así que el `where` de la       │
 * │ consulta NUNCA se ejecuta. Esa es la razón por la que un agujero real sobrevivió a esta suite   │
 * │ en verde: el endpoint filtraba solo por `status` y dejaba reproducir vídeos que la moderación    │
 * │ había escondido, y estos casos seguían pasando porque el mock nunca aplicó ningún filtro.       │
 * │                                                                                                 │
 * │ Lo que SÍ se fija aquí: que el endpoint no exige sesión, que una fila ausente o no publicada da │
 * │ 404 sin URL, y el vector de firma. QUIÉN entra en la consulta se prueba contra la BASE en       │
 * │ `tests/ocultado-umbral.test.ts` ("desaparece de verdad"), que es el único sitio donde un filtro │
 * │ se puede comprobar de verdad. Si se añade un caso de visibilidad, va allí, no aquí.             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { createHash } from "node:crypto";

import { falso } from "./helpers/valores-falsos";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../src/app/api/videos/[id]/reproduccion/route";
import { firmarUrlHls, reproduccionFirmada } from "../src/server/services/bunny";

// La ruta consume estos módulos por import DINÁMICO en tiempo de llamada; vitest iza los vi.mock por
// encima de los imports, así que las llamadas a GET() ven los dobles. Ya NO se mockea la sesión: el
// endpoint no la consulta (es público).
// `findFirst` (no `findUnique`): la selección la hace `videoReproducible`, que compone el filtro de
// visibilidad —con relaciones y un OR— y por eso no cabe en `findUnique`.
const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/server/db/client", () => ({ prisma: { video: { findFirst: mocks.findFirst } } }));
// La factoría se iza por encima de los imports: el helper se carga dentro, con import dinámico.
vi.mock("@/config/env", async () => {
  const { falso: valorFalso } = await import("./helpers/valores-falsos");
  return {
    env: {
      BUNNY_CDN_HOSTNAME: "cdn.test.b-cdn.net",
      BUNNY_TOKEN_AUTH_KEY: valorFalso("bunny-firma"),
    },
  };
});

const tokenDe = (url: string): string | null => new URL(url).searchParams.get("token");

describe("firmarUrlHls (puro)", () => {
  it("FÓRMULA DE BUNNY: clave+videoId+expiración fijos -> el token que da su fórmula (url-safe)", () => {
    const clave = falso("bunny-vector");
    const { src, poster } = firmarUrlHls({
      hostname: "cdn.ejemplo",
      videoId: "video-abc-123",
      claveToken: clave,
      expiraEnSeg: 7200,
      ahoraMs: 0,
    });
    // LA REFERENCIA, escrita aparte y tal como la documenta Bunny: SHA-256 de clave + ruta + expiración
    // + parámetros, en base64 url-safe sin relleno. Antes era un literal (el resultado de una clave fija),
    // y un literal con la entropía de un hash es justo lo que un escáner de secretos marca. Calculado
    // aquí con su propia expresión, sigue fijando el algoritmo: si `firmarUrlHls` cambia la fórmula, el
    // orden de los campos o la codificación, deja de coincidir.
    const esperado = createHash("sha256")
      .update(`${clave}/video-abc-123/7200token_path=/video-abc-123/`)
      .digest("base64url");
    const cola = `?token=${esperado}&token_path=%2Fvideo-abc-123%2F&expires=7200`;
    expect(src).toBe(`https://cdn.ejemplo/video-abc-123/playlist.m3u8${cola}`);
    expect(poster).toBe(`https://cdn.ejemplo/video-abc-123/thumbnail.jpg${cola}`);
    expect(tokenDe(src)).not.toMatch(/[+/=]/); // base64 URL-SAFE (sin +, /, =)
  });

  it("cambiar la CLAVE cambia el token (la firma depende de la clave)", () => {
    const base = { hostname: "h", videoId: "v", expiraEnSeg: 60, ahoraMs: 0 };
    const a = firmarUrlHls({ ...base, claveToken: falso("clave-A") });
    const b = firmarUrlHls({ ...base, claveToken: falso("clave-B") });
    expect(tokenDe(a.src)).not.toBe(tokenDe(b.src));
  });

  it("token de DIRECTORIO: playlist y póster comparten el MISMO token y token_path del directorio", () => {
    const { src, poster } = firmarUrlHls({
      hostname: "h",
      videoId: "vid9",
      claveToken: falso("k"),
      expiraEnSeg: 60,
      ahoraMs: 0,
    });
    expect(tokenDe(src)).toBe(tokenDe(poster)); // misma firma cubre playlist + segmentos + póster
    expect(new URL(src).searchParams.get("token_path")).toBe("/vid9/");
  });
});

describe("reproduccionFirmada (guardarrail puro)", () => {
  const CFG = { hostname: "cdn.test", claveToken: falso("k"), expiraEnSeg: 7200, ahoraMs: 0 };

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
    mocks.findFirst.mockReset();
  });

  it("INVITADO (sin sesión) + PUBLISHED -> 200: el endpoint NO exige sesión (contrato nuevo)", async () => {
    // DIENTES: si se reintrodujera el gate de sesión, un invitado recibiría 401 y esto caería en rojo.
    mocks.findFirst.mockResolvedValue({ bunnyVideoId: "g", status: "PUBLISHED" });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
  });

  it("INVITADO + PENDING -> 404 SIN URL (guardarrail de estado intacto para invitados)", async () => {
    mocks.findFirst.mockResolvedValue({ bunnyVideoId: "g", status: "PENDING" });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("playlist.m3u8");
  });

  it("Video no-PUBLISHED (cada estado) y sin fila -> 404 SIN URL, aun sin sesión", async () => {
    for (const status of ["PENDING", "FAILED", "REJECTED", "REMOVED"]) {
      mocks.findFirst.mockResolvedValue({ bunnyVideoId: "g", status });
      const res = await GET(req(), ctx);
      expect(res.status).toBe(404);
    }
    mocks.findFirst.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
  });

  it("Video PUBLISHED -> 200 con {src, poster} firmadas", async () => {
    mocks.findFirst.mockResolvedValue({ bunnyVideoId: "g", status: "PUBLISHED" });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { src: string; poster: string };
    expect(body.src).toContain("cdn.test.b-cdn.net/g/playlist.m3u8");
    expect(body.poster).toContain("/g/thumbnail.jpg");
    expect(body.src).toContain("token=");
    expect(body.src).toContain("token_path=");
  });
});
