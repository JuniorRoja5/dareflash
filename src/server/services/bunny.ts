/**
 * Servicio de subida a Bunny Stream (server-only).
 *
 * DECISION DE ARQUITECTURA (no rediscutir): el cliente sube el video DIRECTO a Bunny por TUS
 * reanudable con credencial PREFIRMADA de corta duracion. Los BYTES no pasan por nuestro VPS; el
 * servidor SOLO (1) crea el objeto de video en la biblioteca y (2) firma la credencial de subida.
 * La CLAVE DE API de Bunny sale de `env` y NUNCA llega al navegador.
 *
 * Formato de la firma TUS: VERIFICADO en la doc oficial de Bunny
 * (docs.bunny.net/stream/tus-resumable-uploads, ago 2026), NO de memoria:
 *   AuthorizationSignature = sha256_hex(libraryId + apiKey + expirationTime + videoId)
 *   AuthorizationExpire     = UNIX en SEGUNDOS
 *   endpoint TUS            = https://video.bunnycdn.com/tusupload
 * Crear objeto de video: POST https://video.bunnycdn.com/library/{libraryId}/videos
 *   cabecera AccessKey: <apiKey>, cuerpo { title }, respuesta { guid }.
 */
import "server-only";

import { createHash } from "node:crypto";

const API_BASE = "https://video.bunnycdn.com";
/** Endpoint TUS de Bunny (el mismo para toda la cuenta; el objeto lo identifica VideoId). */
export const ENDPOINT_TUS = `${API_BASE}/tusupload`;

/** Config que el servicio necesita de Bunny. Se pasa EXPLICITA (no lee `env` aqui): el servicio es
 *  testeable sin entorno y la lectura de `env` vive en el borde (la route). La apiKey solo servidor. */
export interface ConfigBunny {
  libraryId: string;
  apiKey: string;
}

/**
 * Interfaz INYECTABLE de la llamada HTTP a Bunny. En tests se sustituye por un doble: ningun test
 * toca Bunny de verdad. Solo cubre lo que ESTE paso necesita (crear el objeto de video).
 */
export interface ClienteBunny {
  crearVideo(input: {
    libraryId: string;
    apiKey: string;
    title: string;
  }): Promise<{ guid: string }>;
}

/** Cliente HTTP real de Bunny (fetch). La clave de API va en la cabecera AccessKey, solo servidor. */
export const clienteBunnyReal: ClienteBunny = {
  async crearVideo({ libraryId, apiKey, title }) {
    const res = await fetch(`${API_BASE}/library/${libraryId}/videos`, {
      method: "POST",
      headers: {
        AccessKey: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      // Sin cuerpo ni detalles internos hacia arriba: solo el codigo, para el log del servidor.
      throw new Error(`Bunny createVideo: HTTP ${res.status}`);
    }
    const data: unknown = await res.json();
    const guid = (data as { guid?: unknown }).guid;
    if (typeof guid !== "string" || guid.length === 0) {
      throw new Error("Bunny createVideo: respuesta sin guid");
    }
    return { guid };
  },
};

/**
 * Crea el objeto de video en la biblioteca de Bunny y devuelve su GUID. La clave de API sale de la
 * config (env en el borde), jamas del cliente.
 */
export async function crearObjetoVideo(
  cliente: ClienteBunny,
  config: ConfigBunny,
  title: string,
): Promise<string> {
  const { guid } = await cliente.crearVideo({
    libraryId: config.libraryId,
    apiKey: config.apiKey,
    title,
  });
  return guid;
}

/**
 * Credencial de subida TUS prefirmada. Devuelve SOLO lo que el cliente necesita para el TUS directo
 * a Bunny; NUNCA la clave de API (se usa para firmar, no se emite). `ttlSec` corto (minutos).
 */
export interface CredencialTus {
  libraryId: string;
  videoId: string;
  signature: string;
  /** UNIX en SEGUNDOS cuando caduca la subida (AuthorizationExpire de Bunny). */
  expirationTime: number;
  endpointTus: string;
}

export function credencialSubidaTus(
  config: ConfigBunny,
  videoGuid: string,
  ttlSec: number,
  now?: Date,
): CredencialTus {
  const expirationTime = Math.floor((now ?? new Date()).getTime() / 1000) + ttlSec;
  const signature = createHash("sha256")
    .update(`${config.libraryId}${config.apiKey}${expirationTime}${videoGuid}`)
    .digest("hex");
  return {
    libraryId: config.libraryId,
    videoId: videoGuid,
    signature,
    expirationTime,
    endpointTus: ENDPOINT_TUS,
  };
}
