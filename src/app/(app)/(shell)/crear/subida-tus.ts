/**
 * CREAR · logica PURA de la subida TUS (cliente). Sin React, sin tus-js-client: solo el mapeo y las
 * guardas, para poder atarlos con tests. La subida real de bytes (tus-js-client) vive en el
 * formulario; aqui esta lo que decide QUE se envia y CUANDO NO se arranca.
 */
import { VIDEO_MAX_DURATION_SEC } from "@/config/constants";

/**
 * Tope de tamaño de fichero en CLIENTE = 1 GB. Es una GUARDA DE UX (fallo rapido con mensaje claro
 * si alguien elige un fichero monstruoso), NO un control de seguridad: el control real de tamaño y
 * duracion (<=90 s) vive en SERVIDOR, en la confirmacion (el video aun no esta transcodificado aqui).
 */
export const LIMITE_TAMANO_BYTES = 1024 * 1024 * 1024; // 1 GB

/** ¿El fichero supera el tope de UX? (a nivel de tope, mismo tamaño = permitido). */
export function excedeTope(sizeBytes: number): boolean {
  return sizeBytes > LIMITE_TAMANO_BYTES;
}

/**
 * Tolerancia (segundos) que se suma al limite de duracion en el pre-check de CLIENTE. Absorbe el
 * redondeo de metadata del contenedor (un clip "de 90 s" puede leerse como 90.02) para no rechazar
 * en el navegador un video que el SERVIDOR aceptaria. El servidor manda: aqui solo evitamos subidas
 * obviamente largas.
 */
export const DURACION_TOLERANCIA_SEC = 0.5;

/**
 * Copy HUMANO (sin codigos) cuando el pre-check de cliente rechaza un video por durar de mas. Texto
 * EXACTO del brief; fuente unica para UI y test.
 */
export const MENSAJE_DURACION_EXCEDIDA =
  "Tu video reto supera los 90 segundos. Ajustalo y empieza el reto de nuevo";

/**
 * Decision PURA del pre-check de duracion en CLIENTE: dada la duracion (segundos) leida del <video>,
 * ¿hay que RECHAZAR antes de subir? Es SOLO UX (fallo rapido); la autoridad sigue siendo el SERVIDOR
 * (worker -> FAILED/TOO_LONG). Por eso, si la duracion no es un numero FINITO (Infinity/NaN: formato
 * raro, metadata sin duracion, error de lectura) NO se rechaza: se PERMITE subir y que decida el
 * servidor. Solo se rechaza cuando consta, con margen (VIDEO_MAX_DURATION_SEC + tolerancia), que pasa.
 */
export function duracionExcedeLimite(durationSec: number): boolean {
  if (!Number.isFinite(durationSec)) return false;
  return durationSec > VIDEO_MAX_DURATION_SEC + DURACION_TOLERANCIA_SEC;
}

/** Credencial de subida que emite el servidor (POST /api/videos/upload-credential). */
export interface CredencialSubida {
  libraryId: string;
  videoId: string;
  signature: string;
  expirationTime: number;
  endpointTus: string;
}

/** Guarda estructural: la respuesta del servidor es una credencial completa y usable. */
export function credencialValida(x: unknown): x is CredencialSubida {
  if (typeof x !== "object" || x === null) return false;
  const c = x as Record<string, unknown>;
  return (
    typeof c.libraryId === "string" &&
    c.libraryId.length > 0 &&
    typeof c.videoId === "string" &&
    c.videoId.length > 0 &&
    typeof c.signature === "string" &&
    c.signature.length > 0 &&
    typeof c.expirationTime === "number" &&
    Number.isFinite(c.expirationTime) &&
    typeof c.endpointTus === "string" &&
    c.endpointTus.length > 0
  );
}

/** Opciones para el `tus.Upload`: endpoint + metadata + las 4 cabeceras de Bunny. */
export interface OpcionesTus {
  endpoint: string;
  metadata: { filetype: string; title: string };
  headers: {
    AuthorizationSignature: string;
    AuthorizationExpire: string;
    VideoId: string;
    LibraryId: string;
  };
}

/**
 * Mapea la credencial + metadatos a las opciones del `tus.Upload`. INVARIANTE: el cliente NUNCA
 * arranca la subida sin una credencial valida — si la credencial no lo es, esto LANZA (sin opciones,
 * no hay subida). Las cabeceras se fijan UNA vez desde la credencial obtenida al pulsar Publicar (no
 * hay refresh: con TTL de 2 h no hace falta). `AuthorizationExpire` es texto (UNIX en segundos).
 */
export function opcionesTus(
  credencial: unknown,
  meta: { filetype: string; title: string },
): OpcionesTus {
  if (!credencialValida(credencial)) {
    throw new Error("Credencial de subida invalida: no se arranca la subida.");
  }
  return {
    endpoint: credencial.endpointTus,
    metadata: { filetype: meta.filetype, title: meta.title },
    headers: {
      AuthorizationSignature: credencial.signature,
      AuthorizationExpire: String(credencial.expirationTime),
      VideoId: credencial.videoId,
      LibraryId: credencial.libraryId,
    },
  };
}
