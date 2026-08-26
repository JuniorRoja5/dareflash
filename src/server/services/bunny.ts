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
/** API de CUENTA de Bunny (purga de CDN). Distinta de la de Stream, y con clave propia. */
const PURGE_BASE = "https://api.bunny.net";
/** Endpoint TUS de Bunny (el mismo para toda la cuenta; el objeto lo identifica VideoId). */
export const ENDPOINT_TUS = `${API_BASE}/tusupload`;

/** Config que el servicio necesita de Bunny. Se pasa EXPLICITA (no lee `env` aqui): el servicio es
 *  testeable sin entorno y la lectura de `env` vive en el borde (la route). La apiKey solo servidor. */
export interface ConfigBunny {
  libraryId: string;
  apiKey: string;
}

/**
 * El objeto de video NO existe en Bunny (getVideo devolvio 404). Es un error TIPADO a proposito: la
 * reconciliacion lo distingue de un fallo de RED (404 = nunca llegaron bytes -> subida incompleta;
 * error de red = transitorio -> se reintenta). El confirm lo captura como cualquier error (deja
 * PENDING), asi que esto NO cambia su comportamiento.
 */
export class BunnyNotFoundError extends Error {
  constructor(videoId: string) {
    super(`Bunny getVideo: 404 (videoId ${videoId} no existe)`);
    this.name = "BunnyNotFoundError";
  }
}

/**
 * Interfaz INYECTABLE de las llamadas HTTP a Bunny. En tests se sustituye por un doble: ningun test
 * toca Bunny de verdad. La reconciliacion (rama siguiente) reutilizara este cliente (+ list/delete).
 */
export interface ClienteBunny {
  crearVideo(input: {
    libraryId: string;
    apiKey: string;
    title: string;
  }): Promise<{ guid: string }>;
  /** Estado de transcodificacion (0-8) y duracion en segundos de un video (Get Video de Bunny). */
  getVideo(input: {
    libraryId: string;
    apiKey: string;
    videoId: string;
  }): Promise<{ status: number; length: number }>;
  /**
   * Lista PAGINADA de la biblioteca (List Videos de Bunny). Solo se mapea lo que la limpieza de
   * huerfanos necesita: guid, status y dateUploaded de cada objeto, y el total para paginar.
   */
  listVideos(input: { libraryId: string; apiKey: string; page: number; perPage: number }): Promise<{
    items: { guid: string; status: number; dateUploaded: string }[];
    totalItems: number;
  }>;
  /** Borra un objeto de video de Bunny (Delete Video). IRREVERSIBLE: solo lo llama la limpieza. */
  deleteVideo(input: { libraryId: string; apiKey: string; videoId: string }): Promise<void>;
  /**
   * Fija la MINIATURA de un video (Set Thumbnail de Bunny). Verificado en la doc oficial (ago 2026):
   * POST /library/{libraryId}/videos/{videoId}/thumbnail, cabecera AccessKey, y el fichero como binario
   * en el cuerpo (application/octet-stream). Solo servidor (la API key nunca sale). Bunny sirve la
   * miniatura como thumbnail.jpg, por eso se sube JPEG.
   */
  setThumbnail(input: {
    libraryId: string;
    apiKey: string;
    videoId: string;
    imagen: Buffer;
    contentType: string;
  }): Promise<void>;
  /**
   * PURGA una URL del CDN. Otra API (api.bunny.net, la de CUENTA) y otra clave (`purgeApiKey`,
   * distinta de la API key de Stream). Verificado en la doc oficial (ago 2026):
   * POST https://api.bunny.net/purge?url=<url>&async=false, cabecera AccessKey, 200 = purgada.
   * `async=false` hace que Bunny NO responda hasta haber purgado: cuando el job termina, el borde ya
   * sirve el objeto nuevo (con async=true responderia antes de purgar y el job daria un exito falso).
   */
  purgeUrl(input: { purgeApiKey: string; url: string }): Promise<void>;
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
  async getVideo({ libraryId, apiKey, videoId }) {
    const res = await fetch(`${API_BASE}/library/${libraryId}/videos/${videoId}`, {
      method: "GET",
      headers: { AccessKey: apiKey, Accept: "application/json" },
    });
    // 404 = el objeto no existe (distinto de un error de red): error TIPADO para la reconciliacion.
    if (res.status === 404) throw new BunnyNotFoundError(videoId);
    if (!res.ok) throw new Error(`Bunny getVideo: HTTP ${res.status}`);
    const data: unknown = await res.json();
    const status = (data as { status?: unknown }).status;
    const length = (data as { length?: unknown }).length;
    if (typeof status !== "number") {
      throw new Error("Bunny getVideo: respuesta sin status numerico");
    }
    // `length` (duracion en segundos) solo esta disponible tras transcodificar; antes puede faltar.
    return { status, length: typeof length === "number" ? length : 0 };
  },
  async listVideos({ libraryId, apiKey, page, perPage }) {
    const res = await fetch(
      `${API_BASE}/library/${libraryId}/videos?page=${page}&itemsPerPage=${perPage}`,
      { method: "GET", headers: { AccessKey: apiKey, Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`Bunny listVideos: HTTP ${res.status}`);
    const data: unknown = await res.json();
    // Nombres de campo segun la respuesta "List Videos" de Bunny (totalItems, items[].{guid,status,
    // dateUploaded}). Mapeo DEFENSIVO: un campo ausente/mal tipado no revienta el barrido.
    const d = data as { totalItems?: unknown; items?: unknown };
    const totalItems = typeof d.totalItems === "number" ? d.totalItems : 0;
    const items = (Array.isArray(d.items) ? d.items : []).map((it) => {
      const o = it as { guid?: unknown; status?: unknown; dateUploaded?: unknown };
      return {
        guid: typeof o.guid === "string" ? o.guid : "",
        status: typeof o.status === "number" ? o.status : -1,
        dateUploaded: typeof o.dateUploaded === "string" ? o.dateUploaded : "",
      };
    });
    return { items, totalItems };
  },
  async deleteVideo({ libraryId, apiKey, videoId }) {
    const res = await fetch(`${API_BASE}/library/${libraryId}/videos/${videoId}`, {
      method: "DELETE",
      headers: { AccessKey: apiKey, Accept: "application/json" },
    });
    // 404 = el objeto ya no existe: DELETE es IDEMPOTENTE, el estado deseado (ausente) YA se cumple
    // -> EXITO, no error. Asi el borrado por la cola y el barrido de huerfanos no fallan por un objeto
    // que se borro entre medias. Cualquier otro !ok (red/HTTP) SI es error -> reintento arriba.
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`Bunny deleteVideo: HTTP ${res.status}`);
  },
  async setThumbnail({ libraryId, apiKey, videoId, imagen, contentType }) {
    const res = await fetch(`${API_BASE}/library/${libraryId}/videos/${videoId}/thumbnail`, {
      method: "POST",
      headers: { AccessKey: apiKey, "Content-Type": contentType, Accept: "application/json" },
      body: new Uint8Array(imagen),
    });
    if (!res.ok) throw new Error(`Bunny setThumbnail: HTTP ${res.status}`);
  },
  async purgeUrl({ purgeApiKey, url }) {
    const endpoint = `${PURGE_BASE}/purge?url=${encodeURIComponent(url)}&async=false`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { AccessKey: purgeApiKey, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Bunny purgeUrl: HTTP ${res.status}`);
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
 * Fija la miniatura del video en Bunny. Envoltorio del cliente inyectable: la ruta procesa el fichero
 * con el pipeline compartido (JPEG, modo "contener") y llama aquí. La API key sale de la config (env en
 * el borde), jamás del cliente. Un fallo se propaga para que la ruta lo trate (no aborta el video).
 */
export async function establecerMiniatura(
  cliente: ClienteBunny,
  config: ConfigBunny,
  videoGuid: string,
  imagen: Buffer,
  contentType: string,
): Promise<void> {
  await cliente.setThumbnail({
    libraryId: config.libraryId,
    apiKey: config.apiKey,
    videoId: videoGuid,
    imagen,
    contentType,
  });
}

/**
 * URL (SIN FIRMAR) del objeto de miniatura de un video en el CDN. Es la CLAVE DE CACHE del borde, y
 * por eso es lo que se purga: la clave NO incluye la query string (ver `purgarMiniatura`), asi que la
 * URL pelada identifica al mismo objeto que sirve la URL firmada del poster.
 */
export function urlMiniatura(hostname: string, videoGuid: string): string {
  return `https://${hostname}/${videoGuid}/thumbnail.jpg`;
}

/**
 * PURGA en el CDN la miniatura de un video. Se llama DESPUES de fijar una miniatura personalizada.
 *
 * POR QUE HACE FALTA (el fallo real que arregla): la miniatura personalizada se veia en el panel de
 * Bunny pero NO en DareFlash. Bunny Stream sirve SIEMPRE la miniatura en la misma ruta,
 * `/{guid}/thumbnail.jpg`; la AUTOMATICA ya se habia cacheado en el borde antes de que el usuario
 * subiera la suya, y el borde no vuelve a preguntar al origen hasta que caduque. El objeto cambio en
 * origen, la URL no: sin purga, se sigue sirviendo la vieja.
 *
 * POR QUE NO SE ARREGLA CON UN `?v=` (comprobado en la doc, no de memoria):
 *   1. En una pull-zone de Bunny la query string NO forma parte de la clave de cache por defecto
 *      (es lo que permite que la reproduccion funcione: el `token`/`expires` del poster firmado
 *      CAMBIAN en cada peticion y aun asi hay acierto de cache). Un `?v=` seria ignorado igual.
 *   2. Peor: Bunny incluye por defecto los parametros de la query EN LA FIRMA del token. Anadir un
 *      `v=` sin meterlo en el hash convertiria en 403 el poster de TODOS los videos. El cache-bust
 *      no solo no arreglaria nada: romperia lo que hoy funciona.
 *
 * Requiere la clave de la API de CUENTA (`BUNNY_PURGE_API_KEY`). Idempotente: purgar una URL ya
 * purgada es un no-op correcto, por eso el job puede reintentarse sin cuidado.
 */
export async function purgarMiniatura(
  cliente: ClienteBunny,
  purgeApiKey: string,
  hostname: string,
  videoGuid: string,
): Promise<void> {
  await cliente.purgeUrl({ purgeApiKey, url: urlMiniatura(hostname, videoGuid) });
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

/**
 * Firma una URL HLS con TOKEN DE DIRECTORIO (URL Token Authentication de Bunny) para `/{videoId}/`
 * ENTERO: cubre la playlist Y los segmentos. hls.js pide los .ts/.m4s por su cuenta y todos cuelgan
 * de esa carpeta; si se firmara SOLO la playlist, los segmentos darian 403.
 *
 * Algoritmo oficial de Bunny (SHA256 de clave + ruta-del-directorio + expiracion + parametros; base64
 * url-safe con +→- /→_ y sin '='; `token_path` del directorio en el hash -valor crudo- y en la query
 * -url-encoded-). Se sigue la doc AL PIE DE LA LETRA y se VERIFICA reproduciendo una URL real, no de
 * memoria: https://support.bunny.net/hc/en-us/articles/360016055099
 *
 * La `claveToken` es la de TOKEN AUTHENTICATION de la pull-zone, DISTINTA de la API key (firmar con la
 * API key da 403). `ahoraMs` es inyectable (tests / vectores conocidos).
 */
export function firmarUrlHls(input: {
  hostname: string;
  videoId: string;
  claveToken: string;
  expiraEnSeg: number;
  ahoraMs?: number;
}): { src: string; poster: string } {
  const expires = Math.floor((input.ahoraMs ?? Date.now()) / 1000) + input.expiraEnSeg;
  const tokenPath = `/${input.videoId}/`;
  // Unico parametro extra: token_path. En el HASH va su valor CRUDO; en la URL, url-encoded.
  const parameterData = `token_path=${tokenPath}`;
  const token = createHash("sha256")
    .update(`${input.claveToken}${tokenPath}${expires}${parameterData}`)
    .digest("base64")
    .replace(/\n/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const query = `?token=${token}&token_path=${encodeURIComponent(tokenPath)}&expires=${expires}`;
  const base = `https://${input.hostname}/${input.videoId}`;
  return { src: `${base}/playlist.m3u8${query}`, poster: `${base}/thumbnail.jpg${query}` };
}

/**
 * GUARDARRAIL de reproduccion (PURO, testeable): SOLO un Video PUBLISHED es reproducible. Cualquier
 * otro estado (PENDING/FAILED/REJECTED/REMOVED) o la ausencia de fila -> `null` (el endpoint responde
 * 404, sin URL). Un video no publicado JAMAS es reproducible.
 */
export function reproduccionFirmada(
  video: { bunnyVideoId: string; status: string } | null,
  cfg: { hostname: string; claveToken: string; expiraEnSeg: number; ahoraMs?: number },
): { src: string; poster: string } | null {
  if (!video || video.status !== "PUBLISHED") return null;
  return firmarUrlHls({
    hostname: cfg.hostname,
    videoId: video.bunnyVideoId,
    claveToken: cfg.claveToken,
    expiraEnSeg: cfg.expiraEnSeg,
    ahoraMs: cfg.ahoraMs,
  });
}
