/**
 * establecerMiniatura (envoltorio del cliente Bunny). Con dientes: pasa a `setThumbnail` la config
 * (libraryId + apiKey server-only), el GUID del vídeo y los bytes/contentType tal cual; y propaga el
 * error de Bunny (para que la ruta lo trate como aviso, sin abortar la subida).
 */
import { describe, expect, it, vi } from "vitest";

import type { ClienteBunny } from "../src/server/services/bunny";
import { establecerMiniatura } from "../src/server/services/bunny";

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

describe("establecerMiniatura", () => {
  it("llama a setThumbnail con la config, el GUID y la imagen", async () => {
    const cliente = clienteFake();
    const bytes = Buffer.from([1, 2, 3]);
    await establecerMiniatura(
      cliente,
      { libraryId: "lib1", apiKey: "SECRET" },
      "guid-123",
      bytes,
      "image/jpeg",
    );
    expect(cliente.setThumbnail).toHaveBeenCalledWith({
      libraryId: "lib1",
      apiKey: "SECRET",
      videoId: "guid-123",
      imagen: bytes,
      contentType: "image/jpeg",
    });
  });

  it("propaga el error de Bunny (no lo traga)", async () => {
    const cliente = clienteFake({
      setThumbnail: vi.fn().mockRejectedValue(new Error("Bunny setThumbnail: HTTP 500")),
    });
    await expect(
      establecerMiniatura(
        cliente,
        { libraryId: "l", apiKey: "k" },
        "g",
        Buffer.from([1]),
        "image/jpeg",
      ),
    ).rejects.toThrow(/HTTP 500/);
  });
});
