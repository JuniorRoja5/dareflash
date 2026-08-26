/**
 * PURGA DEL CDN tras fijar una miniatura personalizada. Cubre el fallo REAL que arregla: la miniatura
 * se veía en el panel de Bunny pero NO en DareFlash, porque el borde seguía sirviendo la automática
 * que cacheó antes (Bunny sirve siempre la miniatura en la MISMA ruta, `/{guid}/thumbnail.jpg`).
 *
 * Con dientes:
 *  - se purga la URL EXACTA del objeto (la pelada, que es la clave de caché), no una firmada.
 *  - el cliente real llama a la API de CUENTA con `async=false` y la clave en `AccessKey`.
 *  - sin `BUNNY_PURGE_API_KEY` el job NO revienta la cola (una variable ausente no se arregla
 *    reintentando) pero TAMPOCO finge que purgó.
 *  - REGRESIÓN de firma: el póster NO puede llevar parámetros extra (un cache-bust `?v=` sería
 *    ignorado por la caché Y rompería el token → 403 en TODOS los vídeos).
 */
import { describe, expect, it, vi } from "vitest";

import type { JobModel } from "../src/generated/prisma/models";
import { construirRegistro } from "../src/server/jobs/registry";
import type { ClienteBunny } from "../src/server/services/bunny";
import {
  clienteBunnyReal,
  firmarUrlHls,
  purgarMiniatura,
  urlMiniatura,
} from "../src/server/services/bunny";

const CDN = "mi-zona.b-cdn.net";
const GUID = "guid-abc-123";

function clienteFake(over: Partial<ClienteBunny> = {}): ClienteBunny {
  return {
    crearVideo: vi.fn(),
    getVideo: vi.fn(),
    listVideos: vi.fn(),
    deleteVideo: vi.fn(),
    setThumbnail: vi.fn().mockResolvedValue(undefined),
    purgeUrl: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

/** Job mínimo con el payload que espera el handler (el runner pasa la fila entera). */
function jobPurga(payload: unknown): JobModel {
  return { payload } as unknown as JobModel;
}

describe("urlMiniatura / purgarMiniatura", () => {
  it("purga la URL PELADA del objeto (la clave de caché), sin token ni query", async () => {
    const purgeUrl = vi.fn().mockResolvedValue(undefined);
    const cliente = clienteFake({ purgeUrl });

    await purgarMiniatura(cliente, "CLAVE-DE-CUENTA", CDN, GUID);

    expect(purgeUrl).toHaveBeenCalledWith({
      purgeApiKey: "CLAVE-DE-CUENTA",
      url: `https://${CDN}/${GUID}/thumbnail.jpg`,
    });
    // Si se purgara la URL FIRMADA, la clave de caché no coincidiría y la purga no serviría de nada.
    expect(urlMiniatura(CDN, GUID)).not.toContain("?");
  });

  it("propaga el fallo de Bunny (el job debe poder reintentarlo, no tragárselo)", async () => {
    const cliente = clienteFake({ purgeUrl: vi.fn().mockRejectedValue(new Error("HTTP 503")) });
    await expect(purgarMiniatura(cliente, "K", CDN, GUID)).rejects.toThrow("HTTP 503");
  });
});

describe("clienteBunnyReal.purgeUrl", () => {
  it("llama a la API de CUENTA con async=false y la clave en AccessKey", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    try {
      await clienteBunnyReal.purgeUrl({
        purgeApiKey: "CLAVE",
        url: `https://${CDN}/${GUID}/thumbnail.jpg`,
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const u = new URL(url);
      expect(u.origin).toBe("https://api.bunny.net"); // API de CUENTA, no la de Stream
      expect(u.pathname).toBe("/purge");
      expect(u.searchParams.get("url")).toBe(`https://${CDN}/${GUID}/thumbnail.jpg`);
      // async=false: Bunny no responde hasta haber purgado. Con true, el job daría un éxito falso.
      expect(u.searchParams.get("async")).toBe("false");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["AccessKey"]).toBe("CLAVE");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("un HTTP no-ok LANZA (para que el runner reintente con backoff)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));
    try {
      await expect(
        clienteBunnyReal.purgeUrl({ purgeApiKey: "MALA", url: "https://x/y.jpg" }),
      ).rejects.toThrow(/401/);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("job BUNNY_PURGE_THUMBNAIL", () => {
  function registro(
    purgeApiKey: string | undefined,
    purgeUrl = vi.fn().mockResolvedValue(undefined),
  ) {
    return {
      registro: construirRegistro({
        emailAdapter: { name: "inerte", async send() {} },
        bunny: {
          cliente: clienteFake({ purgeUrl }),
          config: { libraryId: "lib", apiKey: "key" },
          cdnHostname: CDN,
          purgeApiKey,
        },
      }),
      purgeUrl,
    };
  }

  it("está registrado como REQUEUE (purgar dos veces es un no-op correcto)", () => {
    expect(registro("K").registro["BUNNY_PURGE_THUMBNAIL"]?.reaper).toBe("REQUEUE");
  });

  it("purga el thumbnail del GUID del payload", async () => {
    const { registro: reg, purgeUrl } = registro("CLAVE");
    await reg["BUNNY_PURGE_THUMBNAIL"]?.handler(jobPurga({ bunnyVideoId: GUID }));

    expect(purgeUrl).toHaveBeenCalledWith({
      purgeApiKey: "CLAVE",
      url: `https://${CDN}/${GUID}/thumbnail.jpg`,
    });
  });

  it("SIN clave de purga: no llama a Bunny y NO lanza (una variable ausente no se arregla reintentando)", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { registro: reg, purgeUrl } = registro(undefined);
    try {
      await expect(
        reg["BUNNY_PURGE_THUMBNAIL"]?.handler(jobPurga({ bunnyVideoId: GUID })),
      ).resolves.toBeUndefined();
      expect(purgeUrl).not.toHaveBeenCalled();
      // Degrada, pero LO DICE: si no avisara, nadie sabría por qué no se refrescan las miniaturas.
      expect(aviso).toHaveBeenCalledWith(expect.stringContaining("BUNNY_PURGE_API_KEY"));
    } finally {
      aviso.mockRestore();
    }
  });

  it("un payload sin GUID LANZA (no se purga a ciegas)", async () => {
    const { registro: reg } = registro("CLAVE");
    await expect(reg["BUNNY_PURGE_THUMBNAIL"]?.handler(jobPurga({}))).rejects.toThrow();
  });
});

describe("regresión: el póster firmado NO admite parámetros extra", () => {
  it("la query del póster es exactamente token + token_path + expires", () => {
    const { poster } = firmarUrlHls({
      hostname: CDN,
      videoId: GUID,
      claveToken: "clave-de-token",
      expiraEnSeg: 3600,
      ahoraMs: 1_700_000_000_000,
    });
    const parametros = [...new URL(poster).searchParams.keys()].sort();

    // Bunny mete los parámetros de la query EN LA FIRMA. Añadir un cache-bust `?v=` sin incluirlo en
    // el hash convertiría el póster de TODOS los vídeos en un 403; y como la pull-zone IGNORA la query
    // al construir la clave de caché, tampoco refrescaría nada. Por eso el arreglo es PURGAR.
    expect(parametros).toEqual(["expires", "token", "token_path"]);
  });
});
