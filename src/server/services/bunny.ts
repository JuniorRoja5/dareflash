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
  /**
   * Estado de transcodificacion (0-8), duracion en segundos y NOMBRE DEL FICHERO DE MINIATURA de un
   * video (Get Video de Bunny). `thumbnailFileName` es null si Bunny no lo informa; ahi el llamante
   * usa el nombre por defecto (ver NOMBRE_MINIATURA_DEFECTO).
   */
  getVideo(input: {
    libraryId: string;
    apiKey: string;
    videoId: string;
  }): Promise<{ status: number; length: number; thumbnailFileName: string | null }>;
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
   * miniatura en JPEG, por eso se sube JPEG. OJO: NO la guarda como `thumbnail.jpg` —ese es el frame
   * automatico—, sino con un nombre propio que publica en `thumbnailFileName` (ver Video.thumbnailFileName).
   */
  setThumbnail(input: {
    libraryId: string;
    apiKey: string;
    videoId: string;
    imagen: Buffer;
    contentType: string;
  }): Promise<void>;
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
    // Mapeo DEFENSIVO del nombre de miniatura: el campo es NULLABLE en la API de Bunny y puede no
    // venir. Ausente/mal tipado -> null, y el llamante cae al nombre por defecto. Que falte NO es un
    // error: significa "no hay miniatura personalizada", que es el caso normal.
    const thumb = (data as { thumbnailFileName?: unknown }).thumbnailFileName;
    // `length` (duracion en segundos) solo esta disponible tras transcodificar; antes puede faltar.
    return {
      status,
      length: typeof length === "number" ? length : 0,
      thumbnailFileName: typeof thumb === "string" && thumb.length > 0 ? thumb : null,
    };
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
 *
 * ┌─ NO ANADIR PARAMETROS A ESTA QUERY (cache-bust `?v=` y similares) ─────────────────────────────┐
 * │ Se propuso una vez para refrescar miniaturas y NO habria funcionado, por dos motivos, los dos  │
 * │ comprobados en la doc de Bunny:                                                                │
 * │  1. La pull-zone NO mete la query string en la clave de cache. Es lo que permite que la        │
 * │     reproduccion funcione: `token`/`expires` CAMBIAN en cada peticion y aun asi hay acierto de │
 * │     cache. Un `?v=` seria ignorado.                                                            │
 * │  2. Bunny incluye los parametros de la query EN LA FIRMA. Anadir uno sin meterlo en el hash de │
 * │     arriba convertiria en 403 el poster de TODOS los videos.                                   │
 * │ Para servir una miniatura distinta se cambia el FICHERO (`thumbnailFile`), no la query.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
/**
 * Nombre del fichero de miniatura cuando NO hay uno personalizado: el frame que Bunny extrae solo al
 * transcodificar. Es el UNICO sitio donde puede aparecer literal (lo vigila un test): construir la
 * URL del poster con este nombre a mano fue justo el fallo que se arreglo aqui.
 */
export const NOMBRE_MINIATURA_DEFECTO = "thumbnail.jpg";

/**
 * Sanea el nombre de miniatura que viene de la API de BUNNY antes de meterlo en una URL. El valor
 * cruza una frontera de confianza (servicio externo -> ruta que construimos nosotros), asi que se
 * valida en vez de concatenarse a ciegas: solo un nombre de fichero PLANO (sin `/`, sin `..`, sin
 * query). Cualquier cosa rara cae al nombre por defecto en vez de fabricar una URL torcida.
 */
function nombreMiniaturaSeguro(nombre: string | null | undefined): string {
  if (!nombre) return NOMBRE_MINIATURA_DEFECTO;
  return /^[A-Za-z0-9._-]{1,128}$/.test(nombre) && !nombre.includes("..")
    ? nombre
    : NOMBRE_MINIATURA_DEFECTO;
}

export function firmarUrlHls(input: {
  hostname: string;
  videoId: string;
  claveToken: string;
  expiraEnSeg: number;
  ahoraMs?: number;
  /**
   * Nombre del fichero de miniatura EN BUNNY (`Video.thumbnailFileName`). Ausente/null -> el frame
   * automatico. NO afecta a la FIRMA: el token cubre el DIRECTORIO `/{videoId}/` entero, asi que
   * autoriza cualquier fichero de esa carpeta, se llame como se llame.
   */
  thumbnailFile?: string | null;
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
  return {
    src: `${base}/playlist.m3u8${query}`,
    poster: `${base}/${nombreMiniaturaSeguro(input.thumbnailFile)}${query}`,
  };
}

/**
 * GUARDARRAIL de reproduccion (PURO, testeable): SOLO un Video PUBLISHED es reproducible. Cualquier
 * otro estado (PENDING/FAILED/REJECTED/REMOVED) o la ausencia de fila -> `null` (el endpoint responde
 * 404, sin URL). Un video no publicado JAMAS es reproducible.
 */
export function reproduccionFirmada(
  video: { bunnyVideoId: string; status: string; thumbnailFileName?: string | null } | null,
  cfg: { hostname: string; claveToken: string; expiraEnSeg: number; ahoraMs?: number },
): { src: string; poster: string } | null {
  if (!video || video.status !== "PUBLISHED") return null;
  return firmarUrlHls({
    hostname: cfg.hostname,
    videoId: video.bunnyVideoId,
    claveToken: cfg.claveToken,
    expiraEnSeg: cfg.expiraEnSeg,
    ahoraMs: cfg.ahoraMs,
    thumbnailFile: video.thumbnailFileName,
  });
}
