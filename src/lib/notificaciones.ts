/**
 * NOTIFICACIONES — la parte PURA: qué avisos existen, con qué datos, con qué clave y qué texto dicen.
 * Sin servidor ni React: la usan los emisores (servicios), la API y la UI.
 *
 * UN AVISO = UN HECHO. Cada constructor de abajo fija la CLAVE del hecho (`refType` + `refId`), que con
 * el destinatario y el tipo forma el UNIQUE de la tabla. Por eso las claves se derivan aquí y en ningún
 * otro sitio: si dos emisores inventaran su propia clave para el mismo hecho, el UNIQUE no los vería
 * como el mismo y el aviso saldría dos veces.
 *
 * `datos` es la FOTO del hecho, validada por tipo: lo justo para pintar el texto sin cruzar tablas.
 */
import { z } from "zod";

import { VideoFailureReasonSchema, type VideoFailureReason } from "@/config/constants";

import { COPY_SUBIDA } from "./estado-subida";
import { NIVELES, type ClaveNivel } from "./niveles";

const Id = z.string().min(1).max(191);

/** Foto del reto en el momento del hecho: para el texto y para el enlace canónico. */
const RetoFoto = z.object({
  titulo: z.string().min(1).max(200),
  codigo: z.string().min(1).max(32),
  slug: z.string().max(200),
});
export type RetoFoto = z.infer<typeof RetoFoto>;

const ClavesNivel = NIVELES.map((n) => n.clave) as [ClaveNivel, ...ClaveNivel[]];

/**
 * Un aviso VÁLIDO, por tipo. Unión DISCRIMINADA: el `refType` y la forma de `datos` van atados al tipo,
 * así que un VOTO_RECIBIDO apuntando a un NIVEL, o un GANASTE_RETO sin reto, no pasan de aquí. Sus tipos
 * deben ser exactamente los de `TipoNotificacionSchema` (lo vigila un test).
 */
export const AvisoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("VIDEO_LISTO"),
    refType: z.literal("VIDEO"),
    refId: Id,
    datos: z.object({}).strict(),
  }),
  z.object({
    tipo: z.literal("VIDEO_FALLIDO"),
    refType: z.literal("VIDEO"),
    refId: Id,
    // TODOS los motivos de fallo, no solo los del sondeo: la reconciliación también cierra en FAILED
    // (UPLOAD_INCOMPLETE) por el mismo `aplicarTransicion`. Si aquí faltara uno, el Zod reventaría DENTRO
    // de la transacción de la transición y tumbaría el barrido entero por un aviso.
    datos: z.object({ motivo: VideoFailureReasonSchema }).strict(),
  }),
  z.object({
    tipo: z.literal("VOTO_RECIBIDO"),
    refType: z.literal("VOTO"),
    refId: Id,
    datos: z.object({ reto: RetoFoto }).strict(),
  }),
  z.object({
    tipo: z.literal("GANASTE_RETO"),
    refType: z.literal("CHALLENGE"),
    refId: Id,
    datos: z.object({ reto: RetoFoto, puntos: z.number().int().positive() }).strict(),
  }),
  z.object({
    tipo: z.literal("TOP20"),
    refType: z.literal("CHALLENGE"),
    refId: Id,
    datos: z.object({ reto: RetoFoto, puntos: z.number().int().positive() }).strict(),
  }),
  z.object({
    tipo: z.literal("SUBISTE_NIVEL"),
    refType: z.literal("NIVEL"),
    refId: z.enum(ClavesNivel),
    datos: z.object({}).strict(),
  }),
]);
export type Aviso = z.infer<typeof AvisoSchema>;

// ---------------------------------------------------------------------------------------------------
// CONSTRUCTORES: la clave de cada hecho, en un solo sitio.
// ---------------------------------------------------------------------------------------------------

/** Tu vídeo terminó de prepararse y ya se ve. Un vídeo, un aviso. */
export function avisoVideoListo(videoId: string): Aviso {
  return { tipo: "VIDEO_LISTO", refType: "VIDEO", refId: videoId, datos: {} };
}

/** Tu vídeo no se pudo publicar. Mismo vídeo que el de arriba: nunca salen los dos (forward-only). */
export function avisoVideoFallido(videoId: string, motivo: VideoFailureReason): Aviso {
  return { tipo: "VIDEO_FALLIDO", refType: "VIDEO", refId: videoId, datos: { motivo } };
}

/**
 * Alguien votó tu participación. La clave es (participación, VOTANTE), no el id de la fila `Vote`:
 * quitar el voto y volver a ponerlo crea una fila NUEVA, y con su id cada vaivén sería un aviso — un
 * votante podría llenarle la bandeja a alguien a base de pulsar. Así, esa persona en esa participación
 * avisa UNA vez, la haga como la haga (votar, mover hasta aquí, irse y volver, quitar y volver).
 *
 * El votante NO se pinta ni sale por la API: la clave lo lleva dentro solo para deduplicar.
 */
export function avisoVotoRecibido(input: {
  submissionId: string;
  votanteId: string;
  reto: RetoFoto;
}): Aviso {
  return {
    tipo: "VOTO_RECIBIDO",
    refType: "VOTO",
    refId: `${input.submissionId}:${input.votanteId}`,
    datos: { reto: input.reto },
  };
}

/** Ganaste un reto. Un reto, un aviso por ganador, por muchas veces que se re-ejecute el cierre. */
export function avisoGanasteReto(input: {
  challengeId: string;
  reto: RetoFoto;
  puntos: number;
}): Aviso {
  return {
    tipo: "GANASTE_RETO",
    refType: "CHALLENGE",
    refId: input.challengeId,
    datos: { reto: input.reto, puntos: input.puntos },
  };
}

/** Quedaste entre los 20 mejores de un reto SIN ganarlo (al ganador le basta su GANASTE_RETO). */
export function avisoTop20(input: { challengeId: string; reto: RetoFoto; puntos: number }): Aviso {
  return {
    tipo: "TOP20",
    refType: "CHALLENGE",
    refId: input.challengeId,
    datos: { reto: input.reto, puntos: input.puntos },
  };
}

/** Subiste a un nivel. La clave es el NIVEL: se llega a cada uno una sola vez. */
export function avisoSubisteNivel(clave: ClaveNivel): Aviso {
  return { tipo: "SUBISTE_NIVEL", refType: "NIVEL", refId: clave, datos: {} };
}

// ---------------------------------------------------------------------------------------------------
// COPY: lo que dice cada aviso, ES y EN, y adónde lleva. Fuente única: la UI no escribe literales.
// ---------------------------------------------------------------------------------------------------

export interface TextoAviso {
  es: string;
  en: string;
  /** Adónde lleva el aviso. Siempre una ruta local. */
  href: string;
}

const enlaceReto = (r: RetoFoto): string => `/retos/${r.codigo}-${r.slug}`;

/**
 * Texto del fallo de un vídeo. Los dos de contenido reutilizan EL MISMO copy que ve quien sube
 * (`COPY_SUBIDA`): el aviso no puede contar una versión distinta de la pantalla de subida.
 */
function textoFallo(motivo: VideoFailureReason): { es: string; en: string } {
  switch (motivo) {
    case "TOO_LONG":
      return COPY_SUBIDA["demasiado-largo"];
    case "TRANSCODE_ERROR":
      return COPY_SUBIDA["fallo-codificacion"];
    case "UPLOAD_INCOMPLETE":
      return {
        es: "Tu vídeo no llegó a subirse entero y no se publicará. Vuelve a subirlo cuando quieras.",
        en: "Your video didn't finish uploading and won't be published. Upload it again whenever you like.",
      };
    case "OBJETO_INEXISTENTE":
      return {
        es: "Tu vídeo ya no está disponible y no se publicará. Puedes volver a subirlo.",
        en: "Your video is no longer available and won't be published. You can upload it again.",
      };
  }
}

/**
 * Texto de un aviso a partir de su tipo y su foto. Si la fila guardada no valida (una fila de otra
 * versión, datos manipulados), devuelve `null` y la bandeja la omite en vez de pintar algo roto.
 *
 * Reglas del copy (brief v2): desde el lado del usuario, voz activa, sin promesas. VIDEO_FALLIDO dice la
 * verdad —no se publicará—. Los premios en DINERO no se nombran: su pago no existe todavía, y "has
 * ganado 50 €" sería una promesa. Los puntos sí, porque se otorgan en el mismo cierre que emite el aviso.
 */
export function textoAviso(fila: {
  tipo: string;
  refType: string;
  refId: string;
  datos: unknown;
}): TextoAviso | null {
  const r = AvisoSchema.safeParse(fila);
  if (!r.success) return null;
  const a = r.data;
  switch (a.tipo) {
    case "VIDEO_LISTO":
      return {
        es: "Tu vídeo ya está publicado y se puede ver.",
        en: "Your video is live and ready to watch.",
        href: "/perfil",
      };
    case "VIDEO_FALLIDO":
      return { ...textoFallo(a.datos.motivo), href: "/crear" };
    case "VOTO_RECIBIDO":
      return {
        es: `Alguien ha votado tu vídeo en «${a.datos.reto.titulo}».`,
        en: `Someone voted for your video in "${a.datos.reto.titulo}".`,
        href: enlaceReto(a.datos.reto),
      };
    case "GANASTE_RETO":
      return {
        es: `Has ganado «${a.datos.reto.titulo}». Sumas ${a.datos.puntos} puntos.`,
        en: `You won "${a.datos.reto.titulo}". You earn ${a.datos.puntos} points.`,
        href: enlaceReto(a.datos.reto),
      };
    case "TOP20":
      return {
        es: `Has quedado entre los 20 mejores de «${a.datos.reto.titulo}». Sumas ${a.datos.puntos} puntos.`,
        en: `You finished in the top 20 of "${a.datos.reto.titulo}". You earn ${a.datos.puntos} points.`,
        href: enlaceReto(a.datos.reto),
      };
    case "SUBISTE_NIVEL": {
      const nivel = NIVELES.find((n) => n.clave === a.refId)!;
      return {
        es: `Has subido a ${nivel.nombre}.`,
        en: `You reached ${nivel.nombre}.`,
        href: "/perfil",
      };
    }
  }
}

/**
 * "Hace cuánto", en castellano y sin librería. Grueso a propósito: en una bandeja importa el orden de
 * magnitud, no el minuto exacto. Más de una semana -> la fecha.
 */
export function haceCuanto(ms: number, ahoraMs: number): string {
  const s = Math.max(0, Math.floor((ahoraMs - ms) / 1000));
  if (s < 60) return "Ahora";
  const min = Math.floor(s / 60);
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Hace ${d} d`;
  return new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

/** Contador del badge: "99+" por encima del tope; `null` si no hay nada que pintar. */
export function textoBadge(noLeidas: number, tope: number): string | null {
  if (noLeidas <= 0) return null;
  return noLeidas > tope ? `${tope}+` : String(noLeidas);
}
