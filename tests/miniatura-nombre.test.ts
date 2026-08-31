/**
 * MINIATURA: el póster tiene que apuntar al fichero REAL, no a un nombre fijo.
 *
 * El fallo que cubre (visto en producción): Bunny NO guarda la miniatura personalizada como
 * `thumbnail.jpg` —ese es el frame automático que extrae al transcodificar—, sino con un nombre
 * propio (`thumbnail_eaffe862.jpg`) que publica en `thumbnailFileName`. DareFlash pedía
 * `thumbnail.jpg` a pelo, así que el panel de Bunny mostraba la miniatura del usuario y DareFlash
 * el frame automático. Se veía bien en un sitio y mal en el otro, sin ningún error por medio.
 *
 * Estos tests fijan las cuatro cosas que hacen que eso no pueda repetirse.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  clienteBunnyReal,
  firmarUrlHls,
  NOMBRE_MINIATURA_DEFECTO,
  reproduccionFirmada,
} from "../src/server/services/bunny";
import { aplicarTransicion } from "../src/server/services/video-confirmacion";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const CDN = "mi-zona.b-cdn.net";
const GUID = "guid-abc-123";
const FIRMA = { hostname: CDN, videoId: GUID, claveToken: "clave", expiraEnSeg: 3600 } as const;

/** Nombre del fichero que pide una URL de póster (sin la query de la firma). */
function ficheroDelPoster(poster: string): string {
  const u = new URL(poster);
  return u.pathname.split("/").pop() ?? "";
}

describe("el póster apunta al fichero real", () => {
  it("con miniatura personalizada, pide ESE fichero", () => {
    const { poster } = firmarUrlHls({ ...FIRMA, thumbnailFile: "thumbnail_eaffe862.jpg" });
    expect(ficheroDelPoster(poster)).toBe("thumbnail_eaffe862.jpg");
  });

  it("sin miniatura personalizada (null), cae al frame automático", () => {
    expect(ficheroDelPoster(firmarUrlHls({ ...FIRMA, thumbnailFile: null }).poster)).toBe(
      NOMBRE_MINIATURA_DEFECTO,
    );
    expect(ficheroDelPoster(firmarUrlHls(FIRMA).poster)).toBe(NOMBRE_MINIATURA_DEFECTO);
  });

  it("el VÍDEO no cambia: solo cambia la miniatura", () => {
    const a = firmarUrlHls({ ...FIRMA, thumbnailFile: "thumbnail_x.jpg" });
    const b = firmarUrlHls({ ...FIRMA, thumbnailFile: null });
    expect(a.src).toBe(b.src); // la playlist es la misma
    expect(a.poster).not.toBe(b.poster);
  });

  it("`reproduccionFirmada` propaga el nombre guardado en la fila", () => {
    const urls = reproduccionFirmada(
      { bunnyVideoId: GUID, status: "PUBLISHED", thumbnailFileName: "thumbnail_zz.jpg" },
      { hostname: CDN, claveToken: "clave", expiraEnSeg: 3600 },
    );
    expect(ficheroDelPoster(urls!.poster)).toBe("thumbnail_zz.jpg");
  });
});

describe("la firma no depende del nombre del fichero", () => {
  it("el token es IDÉNTICO con y sin miniatura personalizada", () => {
    // El token de Bunny cubre el DIRECTORIO `/{guid}/`, así que autoriza cualquier fichero de esa
    // carpeta. Si alguien "arreglara" la firma metiendo el nombre del fichero en el hash, la
    // miniatura personalizada empezaría a dar 403 — este test lo caza.
    const conNombre = new URL(
      firmarUrlHls({ ...FIRMA, ahoraMs: 0, thumbnailFile: "t_x.jpg" }).poster,
    );
    const sinNombre = new URL(firmarUrlHls({ ...FIRMA, ahoraMs: 0 }).poster);
    expect(conNombre.searchParams.get("token")).toBe(sinNombre.searchParams.get("token"));
    expect(conNombre.searchParams.get("token_path")).toBe(sinNombre.searchParams.get("token_path"));
  });

  it("la query del póster sigue siendo EXACTAMENTE token + token_path + expires", () => {
    // Regresión heredada: se propuso una vez un cache-bust `?v=` para refrescar miniaturas. La
    // pull-zone IGNORA la query al cachear (por eso el token cambiante no rompe la caché) Y Bunny
    // mete los parámetros de la query EN LA FIRMA: un `v=` sin hashear daría 403 en TODOS los vídeos.
    // Para servir otra miniatura se cambia el FICHERO, nunca la query.
    const { poster } = firmarUrlHls({ ...FIRMA, thumbnailFile: "thumbnail_x.jpg" });
    expect([...new URL(poster).searchParams.keys()].sort()).toEqual([
      "expires",
      "token",
      "token_path",
    ]);
  });
});

describe("el nombre viene de fuera: se sanea antes de meterlo en una URL", () => {
  // `thumbnailFileName` lo produce Bunny, no nosotros: cruza una frontera de confianza. Se valida
  // en vez de concatenarse a ciegas.
  it.each([
    ["../../otro/fichero.jpg", "escape de directorio"],
    ["sub/dir/thumb.jpg", "barra"],
    ["thumb.jpg?token=robado", "query inyectada"],
    ["", "vacío"],
    ["a".repeat(200), "absurdamente largo"],
  ])("%s (%s) -> cae al nombre por defecto", (nombre) => {
    const { poster } = firmarUrlHls({ ...FIRMA, thumbnailFile: nombre });
    expect(ficheroDelPoster(poster)).toBe(NOMBRE_MINIATURA_DEFECTO);
    // Y sobre todo: no se sale de la carpeta del vídeo, que es lo que el token autoriza.
    expect(new URL(poster).pathname).toBe(`/${GUID}/${NOMBRE_MINIATURA_DEFECTO}`);
  });
});

describe("getVideo trae el nombre desde Bunny", () => {
  async function conRespuesta(cuerpo: unknown) {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    try {
      return await clienteBunnyReal.getVideo({ libraryId: "1", apiKey: "k", videoId: GUID });
    } finally {
      globalThis.fetch = original;
    }
  }

  it("lo mapea cuando Bunny lo informa", async () => {
    const r = await conRespuesta({ status: 4, length: 10, thumbnailFileName: "thumbnail_ab.jpg" });
    expect(r.thumbnailFileName).toBe("thumbnail_ab.jpg");
  });

  it("ausente o mal tipado -> null (no es un error: significa 'sin miniatura propia')", async () => {
    expect((await conRespuesta({ status: 4, length: 10 })).thumbnailFileName).toBeNull();
    expect(
      (await conRespuesta({ status: 4, length: 10, thumbnailFileName: 123 })).thumbnailFileName,
    ).toBeNull();
    expect(
      (await conRespuesta({ status: 4, length: 10, thumbnailFileName: "" })).thumbnailFileName,
    ).toBeNull();
  });
});

describe("se persiste al publicar", () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = createTestPrisma();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function videoPendiente(guid: string): Promise<string> {
    const userId = await crearUsuario(prisma, { username: `u${guid.slice(0, 6)}` });
    const v = await prisma.video.create({
      data: { userId, bunnyVideoId: guid, status: "PENDING" },
      select: { id: true },
    });
    return v.id;
  }

  it("al pasar a PUBLISHED guarda el nombre que reportó Bunny", async () => {
    const id = await videoPendiente("g-pub-1");
    await aplicarTransicion(prisma, id, { destino: "PUBLISHED", durationSec: 10 }, "thumb_aa.jpg");

    const fila = await prisma.video.findUnique({
      where: { id },
      select: { status: true, thumbnailFileName: true },
    });
    expect(fila?.status).toBe("PUBLISHED");
    expect(fila?.thumbnailFileName).toBe("thumb_aa.jpg");
  });

  it("sin nombre (null) NO pisa la columna con un vacío", async () => {
    const id = await videoPendiente("g-pub-2");
    await prisma.video.update({ where: { id }, data: { thumbnailFileName: "thumb_bueno.jpg" } });

    await aplicarTransicion(prisma, id, { destino: "PUBLISHED", durationSec: 10 }, null);

    const fila = await prisma.video.findUnique({
      where: { id },
      select: { thumbnailFileName: true },
    });
    expect(fila?.thumbnailFileName).toBe("thumb_bueno.jpg");
  });
});

/**
 * ESTRUCTURAL — el invariante que pidió la revisión: prohibido volver a fijar el nombre a mano al
 * construir la URL. Un test de comportamiento no lo cubre: alguien podría reintroducir el literal en
 * otro sitio (otra pantalla, otro servicio) y los de arriba seguirían en verde.
 */
describe("prohibido hardcodear el nombre de la miniatura", () => {
  const RAIZ = process.cwd();
  const sinComentarios = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("`thumbnail.jpg` solo existe como la constante por defecto, en bunny.ts", () => {
    const bunny = sinComentarios(
      readFileSync(join(RAIZ, "src", "server", "services", "bunny.ts"), "utf8"),
    );
    const apariciones = bunny.match(/thumbnail\.jpg/g) ?? [];
    // Exactamente una: la de `NOMBRE_MINIATURA_DEFECTO`. Construir la URL del póster con el literal
    // (que es lo que fallaba) añade una segunda y pone esto en rojo.
    expect(apariciones).toHaveLength(1);
    expect(bunny).toMatch(/NOMBRE_MINIATURA_DEFECTO = "thumbnail\.jpg"/);
  });

  it("ningún otro fichero de src/ escribe ese nombre a mano EN CÓDIGO", () => {
    const salida = execSync('git grep -l "thumbnail\\.jpg" -- src || true', {
      cwd: RAIZ,
      encoding: "utf8",
    });
    // Varios ficheros MENCIONAN el nombre en un comentario para explicar el fallo; eso no construye
    // ninguna URL. Lo que no puede volver a existir es el literal en CÓDIGO fuera de bunny.ts.
    const enCodigo = salida
      .split("\n")
      .filter(Boolean)
      .filter((f) => sinComentarios(readFileSync(join(RAIZ, f), "utf8")).includes("thumbnail.jpg"));
    expect(enCodigo).toEqual(["src/server/services/bunny.ts"]);
  });

  it("nadie firma un póster sin pasar el nombre (el 2º argumento es obligatorio)", () => {
    const salida = execSync('git grep -n "firmarReproduccion(" -- src || true', {
      cwd: RAIZ,
      encoding: "utf8",
    });
    const llamadas = salida
      .split("\n")
      .filter((l) => /firmarReproduccion\([^)]/.test(l)) // llamadas con argumentos, no imports
      .filter((l) => !l.includes("reproduccion-servidor.ts")); // la definición
    expect(llamadas.length).toBeGreaterThan(0);
    for (const l of llamadas) expect(l).toMatch(/firmarReproduccion\([^)]+,\s*[^)]+\)/);
  });
});
