/**
 * Entradas de vídeo según dispositivo (puro). Con dientes: en MÓVIL se ofrecen "Grabar" (con capture,
 * abre cámara) y "Galería"; en ESCRITORIO una sola entrada honesta "Elegir vídeo" (sin capture: allí
 * "Grabar" engañaría). El capture SOLO lo lleva "Grabar".
 */
import { describe, expect, it } from "vitest";

import { entradasVideo } from "../src/app/(app)/(shell)/crear/entrada-video";

describe("entradasVideo", () => {
  it("móvil (táctil): Grabar (capture) + Galería (sin capture)", () => {
    const e = entradasVideo(true);
    expect(e.map((x) => x.clave)).toEqual(["grabar", "galeria"]);
    expect(e.find((x) => x.clave === "grabar")?.capture).toBe(true);
    expect(e.find((x) => x.clave === "galeria")?.capture).toBe(false);
  });

  it("escritorio: una sola entrada 'Elegir vídeo' sin capture (no engaña con 'Grabar')", () => {
    const e = entradasVideo(false);
    expect(e).toHaveLength(1);
    expect(e[0]!.clave).toBe("elegir");
    expect(e[0]!.capture).toBe(false);
    expect(e.some((x) => x.clave === "grabar")).toBe(false);
  });
});
