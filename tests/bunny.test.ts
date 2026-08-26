/**
 * Bunny — servicio de credenciales de subida TUS, con DIENTES en los invariantes de seguridad.
 * Nada aqui toca Bunny de verdad (la llamada HTTP va tras una interfaz inyectable) ni usa la clave
 * de API real (se usa un doble).
 *
 * Invariantes (cada uno puede fallar a proposito; ver el resumen para el rojo demostrado):
 *  1. La credencial que se serializa al cliente NUNCA contiene la clave de API.
 *  2. La expiracion es CORTA (el test falla si se alarga a horas).
 *  3. La route crea la fila Video en PENDING, JAMAS en PUBLISHED (estructural sobre la route).
 *  4. La route RECHAZA al anonimo -> lo garantiza `mutatingRoute`, verificado en route-csrf.test.ts
 *     (romperlo -desenvolver mutatingRoute- pone ESE test en rojo; no se duplica aqui).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BUNNY_TUS_CREDENTIAL_TTL_SEC } from "../src/config/constants";
import {
  type ClienteBunny,
  crearObjetoVideo,
  credencialSubidaTus,
  ENDPOINT_TUS,
} from "../src/server/services/bunny";

// Clave de API FALSA y bien distinguible: si se colase en la respuesta, el test la caza.
const CONFIG = { libraryId: "12345", apiKey: "APIKEY_FALSA_DE_PRUEBA_no_real_xyz" };

describe("credencialSubidaTus", () => {
  const now = new Date("2026-08-05T00:00:00.000Z");
  const cred = credencialSubidaTus(CONFIG, "guid-abc", BUNNY_TUS_CREDENTIAL_TTL_SEC, now);

  it("INVARIANTE 1: lo que se envia al cliente NUNCA contiene la clave de API", () => {
    expect(JSON.stringify(cred)).not.toContain(CONFIG.apiKey);
    expect(Object.values(cred)).not.toContain(CONFIG.apiKey);
  });

  it("INVARIANTE 2: la expiracion cubre la subida completa pero esta ACOTADA (1h..6h)", () => {
    // Bunny compara AuthorizationExpire contra el fin de la subida (no la duracion del video) y
    // recomienda >= 1 h. La credencial debe durar MAS que la subida completa; y no ser eterna.
    const nowSec = Math.floor(now.getTime() / 1000);
    const ttl = cred.expirationTime - nowSec;
    expect(ttl).toBe(BUNNY_TUS_CREDENTIAL_TTL_SEC);
    expect(ttl).toBeGreaterThanOrEqual(60 * 60); // suelo 1 h: bajarlo por debajo pone esto en rojo
    expect(ttl).toBeLessThanOrEqual(6 * 60 * 60); // techo 6 h: subirlo por encima pone esto en rojo
  });

  it("firma = sha256_hex(libraryId + apiKey + expirationTime + videoId), orden EXACTO de la doc", () => {
    const esperada = createHash("sha256")
      .update(`${CONFIG.libraryId}${CONFIG.apiKey}${cred.expirationTime}guid-abc`)
      .digest("hex");
    expect(cred.signature).toBe(esperada);
    expect(cred.videoId).toBe("guid-abc");
    expect(cred.libraryId).toBe("12345");
    expect(cred.endpointTus).toBe(ENDPOINT_TUS);
  });
});

describe("crearObjetoVideo", () => {
  it("usa el cliente inyectado y devuelve su guid (ningun test toca Bunny de verdad)", async () => {
    let visto: { libraryId: string; apiKey: string; title: string } | undefined;
    const doble: ClienteBunny = {
      async crearVideo(input) {
        visto = input;
        return { guid: "guid-del-doble" };
      },
      async getVideo() {
        return { status: 0, length: 0 }; // no se usa en este test
      },
      async listVideos() {
        return { items: [], totalItems: 0 }; // no se usa en este test
      },
      async deleteVideo() {
        // no se usa en este test
      },
      async setThumbnail() {
        // no se usa en este test
      },
      async purgeUrl() {
        // no se usa en este test
      },
    };
    const guid = await crearObjetoVideo(doble, CONFIG, "Mi video");
    expect(guid).toBe("guid-del-doble");
    expect(visto).toEqual({ libraryId: "12345", apiKey: CONFIG.apiKey, title: "Mi video" });
  });
});

describe("INVARIANTE 3 (estructural): la route crea Video en PENDING, jamas PUBLISHED", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "app", "api", "videos", "upload-credential", "route.ts"),
    "utf8",
  );

  it("crea la fila Video y NO fija status PUBLISHED (se apoya en el default PENDING del esquema)", () => {
    // `video.create` cubre tanto `prisma.video.create` como `tx.video.create`: la fila se crea ahora
    // DENTRO de una transaccion (atomica con la marca de wake del event-kick), pero sigue en PENDING.
    expect(src).toContain("video.create");
    // No asigna `status: PUBLISHED` (ignora la palabra en comentarios). Escribirlo pone esto en rojo.
    expect(src).not.toMatch(/status\s*:\s*["']?PUBLISHED/);
  });
});
