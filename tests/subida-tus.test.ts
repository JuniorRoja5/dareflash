/**
 * Crear · subida TUS (cliente) — logica PURA con dientes. La subida real de bytes a Bunny es
 * verificacion MANUAL (necesita Bunny real + navegador); aqui se ata lo que decide QUE se envia y
 * CUANDO NO se arranca.
 *  - Mapeo credencial -> metadata + las 4 cabeceras de Bunny (orden/nombres exactos).
 *  - El cliente NUNCA arranca la subida sin credencial valida: `opcionesTus` LANZA con una invalida.
 */
import { describe, expect, it } from "vitest";

import {
  credencialValida,
  excedeTope,
  LIMITE_TAMANO_BYTES,
  opcionesTus,
} from "../src/app/(app)/(shell)/crear/subida-tus";

const CRED = {
  libraryId: "12345",
  videoId: "guid-abc",
  signature: "firma-hex",
  expirationTime: 1_700_000_000,
  endpointTus: "https://video.bunnycdn.com/tusupload",
};

describe("opcionesTus: mapeo credencial -> metadata + 4 cabeceras", () => {
  it("cada campo a su cabecera EXACTA + metadata (AuthorizationExpire es texto)", () => {
    const o = opcionesTus(CRED, { filetype: "video/mp4", title: "Mi salto" });
    expect(o.endpoint).toBe(CRED.endpointTus);
    expect(o.metadata).toEqual({ filetype: "video/mp4", title: "Mi salto" });
    expect(o.headers).toEqual({
      AuthorizationSignature: "firma-hex",
      AuthorizationExpire: "1700000000",
      VideoId: "guid-abc",
      LibraryId: "12345",
    });
  });
});

describe("el cliente no arranca la subida sin credencial valida", () => {
  it("una credencial completa es valida", () => {
    expect(credencialValida(CRED)).toBe(true);
  });

  it("le falta o esta mal un campo -> invalida (los dos sentidos)", () => {
    expect(credencialValida({ ...CRED, signature: "" })).toBe(false);
    expect(credencialValida({ ...CRED, videoId: undefined })).toBe(false);
    expect(credencialValida({ ...CRED, expirationTime: "no-numero" })).toBe(false);
    expect(credencialValida(null)).toBe(false);
  });

  it("opcionesTus LANZA con credencial invalida (sin opciones, no hay subida)", () => {
    expect(() =>
      opcionesTus({ ...CRED, signature: "" }, { filetype: "video/mp4", title: "x" }),
    ).toThrow();
    expect(() => opcionesTus(null, { filetype: "video/mp4", title: "x" })).toThrow();
  });
});

describe("excedeTope: guarda de UX de 1 GB (no es control de seguridad)", () => {
  it("igual al tope se permite; por encima no", () => {
    expect(excedeTope(LIMITE_TAMANO_BYTES)).toBe(false);
    expect(excedeTope(LIMITE_TAMANO_BYTES + 1)).toBe(true);
    expect(excedeTope(50 * 1024 * 1024)).toBe(false);
  });
});
