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
 *
 * Lleva zod (`AvisoSchema`), así que el cliente NO lo importa: lo que pinta la bandeja y el badge en el
 * navegador (`haceCuanto`, `textoBadge`) vive en `notificaciones-vista` (Fase 11 · P1b).
 */
import { z } from "zod";

import type { es } from "@/textos/es";

import { type VideoFailureReason } from "@/config/constants";
import { VideoFailureReasonSchema } from "@/config/esquemas";

import { enlaceComentario } from "./enlace-comentario";
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
  z.object({
    tipo: z.literal("ANUNCIO"),
    refType: z.literal("ANUNCIO"),
    refId: Id,
    // VACÍO a propósito: el texto vive en `Announcement` y se une por refId al leer. Copiarlo aquí
    // serían miles de copias de lo mismo, una por destinatario.
    datos: z.object({}).strict(),
  }),
  z.object({
    tipo: z.literal("COMENTARIO"),
    refType: z.literal("COMMENT"),
    refId: Id,
    // La FOTO del hecho: QUIÉN comentó (su handle, un identificador, no texto libre) y, si el vídeo es
    // una participación, el reto (para el enlace), como hace VOTO_RECIBIDO. NUNCA el texto del
    // comentario: el aviso es un registro y el comentario puede retirarse; copiarlo aquí lo dejaría
    // vivo en la bandeja. El handle se valida ancho a propósito: un Zod estricto que reventara aquí
    // tumbaría la transacción del comentario entero por su aviso.
    datos: z.object({ autor: z.string().min(1).max(64), reto: RetoFoto.nullable() }).strict(),
  }),
  z.object({
    tipo: z.literal("TOQUE"),
    // Apunta a la PERSONA que lo manda, no a un objeto: no hay nada de por medio.
    refType: z.literal("USER"),
    refId: Id,
    // El handle de quien toca, igual que en COMENTARIO: una FOTO del hecho, no una unión al leer.
    // Es un identificador, no texto libre, así que no hay nada que escapar ni que caduque feo.
    datos: z.object({ autor: z.string().min(1).max(64) }).strict(),
  }),
  z.object({
    tipo: z.literal("CONTENIDO_AUTO_OCULTO"),
    // El ÚNICO aviso con dos refType posibles, porque el umbral esconde las dos cosas. Sigue
    // siendo la mitad de la clave de unicidad, así que un vídeo y un comentario con el mismo id
    // (imposible, pero) tampoco se pisarían.
    refType: z.enum(["VIDEO", "COMMENT"]),
    refId: Id,
    // VACÍO: el aviso dice "hay algo que mirar", y lo que hay que mirar se lee en la cola. Copiar
    // aquí el texto denunciado sería repartir ese contenido por las bandejas del equipo.
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

/**
 * Un anuncio del admin. La clave es el ANUNCIO: cada cuenta lo recibe una vez, por muchas veces que se
 * re-ejecute o se reanude su reparto. Sin texto: se une por refId al leer (ver `Announcement`).
 */
export function avisoAnuncio(announcementId: string): Aviso {
  return { tipo: "ANUNCIO", refType: "ANUNCIO", refId: announcementId, datos: {} };
}

/**
 * Alguien comentó tu vídeo. La clave es el COMENTARIO: cada uno avisa una vez, por mucho que se
 * reintente su transacción. Dos comentarios son dos avisos (al contrario que el voto, que se deduplica
 * por votante: un comentario nuevo SÍ es un hecho nuevo).
 */
export function avisoComentario(input: {
  commentId: string;
  /** Handle de quien comentó. */
  autor: string;
  /** El reto, si el vídeo es una participación; `null` en una subida libre. */
  reto: RetoFoto | null;
}): Aviso {
  return {
    tipo: "COMENTARIO",
    refType: "COMMENT",
    refId: input.commentId,
    datos: { autor: input.autor, reto: input.reto },
  };
}

/**
 * El umbral de denuncias ha escondido algo. VA AL EQUIPO, no al autor.
 *
 * Uno por OBJETO: si el mismo vídeo vuelve a cruzar el umbral tras un descarte, el `@@unique` de
 * Notification hace que el moderador no reciba un segundo aviso idéntico. Es lo correcto — el
 * trabajo pendiente ya está en la cola, y repetir el aviso no añade nada que mirar.
 */
/**
 * ALGUIEN TE HA DADO UN TOQUE. La clave lleva el EMISOR y el DÍA, y las dos partes hacen falta.
 *
 * ┌─ POR QUÉ EL DÍA VA DENTRO DE LA CLAVE ──────────────────────────────────────────────────────┐
 * │ Un toque no cuelga de ningún objeto: no hay un vídeo, ni un voto, ni un reto que lo haga     │
 * │ único. Si la clave fuera solo el emisor, A podría tocar a B UNA VEZ EN LA VIDA y nunca más.  │
 * │ Si no llevara emisor, el primer toque del día bloquearía los de todos los demás.             │
 * │                                                                                              │
 * │ Con (emisor, día) el invariante que sale es exactamente el que se quiere: **A puede tocar a  │
 * │ B como mucho una vez al día**. Y no lo garantiza un `if` que alguien pueda saltarse —ni una  │
 * │ lectura previa, que sería una carrera—: lo garantiza el UNIQUE de la tabla. Dos peticiones a │
 * │ la vez y la segunda no escribe.                                                              │
 * │                                                                                              │
 * │ EL DÍA ES UTC (`RESET_TIMEZONE`), el mismo corte que el límite de Boost y que la racha.      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * El emisor va en la clave para deduplicar Y en `datos` para pintarse. Son dos usos distintos: si
 * se pintara leyéndolo de la clave, cambiar el formato de la clave cambiaría el texto.
 */
export function avisoToque(input: {
  emisorId: string;
  /** Handle de quien da el toque. */
  autor: string;
  /** El día en `AAAA-MM-DD` UTC (`claveDia`). Lo pasa quien emite, para poder fijarlo en un test. */
  dia: string;
}): Aviso {
  return {
    tipo: "TOQUE",
    refType: "USER",
    refId: `${input.emisorId}:${input.dia}`,
    datos: { autor: input.autor },
  };
}

export function avisoContenidoAutoOculto(input: {
  targetType: "VIDEO" | "COMMENT";
  targetId: string;
}): Aviso {
  return {
    tipo: "CONTENIDO_AUTO_OCULTO",
    refType: input.targetType,
    refId: input.targetId,
    datos: {},
  };
}

// ---------------------------------------------------------------------------------------------------
// LO QUE DICE CADA AVISO, como DATO (Fase 11 · P5b4): la clave de su frase en el diccionario y sus
// valores, y adónde lleva. La FRASE la compone `componerAviso` (server/avisos-texto) en el idioma que
// se le pase —el de la página, el de la API o, en la P4, el del destinatario de un push—. Aquí no se
// escribe ni una palabra: antes vivía aquí una tabla ES/EN, de la que solo se leía el castellano.
// ---------------------------------------------------------------------------------------------------

type Avisos = (typeof es)["avisos"];

/** La frase de un aviso: una clave del espacio `avisos`, una de la pantalla de subida, o un texto ya escrito. */
export type FraseAviso =
  | { espacio: "avisos"; clave: keyof Avisos & string; params?: Record<string, string | number> }
  /** Los dos fallos de un vídeo que ya dice la pantalla de subida: una frase, UNA clave. */
  | { espacio: "subida"; clave: "estado_demasiado-largo" | "estado_fallo-codificacion" }
  /** El de un ANUNCIO: lo escribió el equipo, en un idioma, y no hay traducción que inventar. */
  | { texto: string };

export type DatosAviso =
  | { estado: "ok"; frase: FraseAviso; href: string }
  /** Se omite a propósito (un anuncio cuyo texto ya no existe): mejor un hueco que un aviso vacío. */
  | { estado: "omitir" }
  /** La fila no valida (un `tipo` desconocido, `datos` incompletos): la compone el genérico. */
  | { estado: "invalido" };

const enlaceReto = (r: RetoFoto): string => `/retos/${r.codigo}-${r.slug}`;

/** La frase del fallo de un vídeo, por su motivo. */
function fraseFallo(motivo: VideoFailureReason): FraseAviso {
  switch (motivo) {
    case "TOO_LONG":
      return { espacio: "subida", clave: "estado_demasiado-largo" };
    case "TRANSCODE_ERROR":
      return { espacio: "subida", clave: "estado_fallo-codificacion" };
    case "UPLOAD_INCOMPLETE":
      return { espacio: "avisos", clave: "videoFallido_UPLOAD_INCOMPLETE" };
    case "OBJETO_INEXISTENTE":
      return { espacio: "avisos", clave: "videoFallido_OBJETO_INEXISTENTE" };
  }
}

/**
 * Lo que dice un aviso y adónde lleva, a partir de su tipo y su foto. Pura: sin idioma, sin petición.
 *
 * Reglas del copy (brief v2): desde el lado del usuario, voz activa, sin promesas. VIDEO_FALLIDO dice la
 * verdad —no se publicará—. Los premios en DINERO no se nombran: su pago no existe todavía, y "has
 * ganado 50 €" sería una promesa. Los puntos sí, porque se otorgan en el mismo cierre que emite el aviso.
 */
export function datosDeAviso(
  fila: {
    tipo: string;
    refType: string;
    refId: string;
    datos: unknown;
  },
  contexto: ContextoTexto = {},
): DatosAviso {
  const r = AvisoSchema.safeParse(fila);
  if (!r.success) return { estado: "invalido" };
  const a = r.data;
  const ok = (frase: FraseAviso, href: string): DatosAviso => ({ estado: "ok", frase, href });
  switch (a.tipo) {
    case "CONTENIDO_AUTO_OCULTO":
      // DICE LO QUE PASÓ, no lo que hay que concluir: "se ha ocultado" (un contador llegó a
      // tres), nunca "contenido inapropiado" — eso lo decide quien lo mire, que es a lo que se
      // le invita. Lleva a la cola, que es donde se decide.
      return ok({ espacio: "avisos", clave: "contenidoOculto" }, "/panel/moderacion");
    case "VIDEO_LISTO":
      return ok({ espacio: "avisos", clave: "videoListo" }, "/perfil");
    case "VIDEO_FALLIDO":
      return ok(fraseFallo(a.datos.motivo), "/crear");
    case "VOTO_RECIBIDO":
      return ok(
        { espacio: "avisos", clave: "votoRecibido", params: { reto: a.datos.reto.titulo } },
        enlaceReto(a.datos.reto),
      );
    case "GANASTE_RETO":
      return ok(
        {
          espacio: "avisos",
          clave: "ganasteReto",
          params: { reto: a.datos.reto.titulo, n: a.datos.puntos },
        },
        enlaceReto(a.datos.reto),
      );
    case "TOP20":
      return ok(
        {
          espacio: "avisos",
          clave: "top20",
          params: { reto: a.datos.reto.titulo, n: a.datos.puntos },
        },
        enlaceReto(a.datos.reto),
      );
    case "SUBISTE_NIVEL": {
      // El nombre del nivel es de marca (no se traduce): viaja como valor.
      const nivel = NIVELES.find((n) => n.clave === a.refId)!;
      return ok(
        { espacio: "avisos", clave: "subisteNivel", params: { nivel: nivel.nombre } },
        "/perfil",
      );
    }
    case "ANUNCIO": {
      // El texto del admin, UNIDO por refId. Si no llegó (un anuncio que no existe), se omite como
      // cualquier fila que no se sabe pintar: mejor un hueco que un aviso vacío.
      const texto = contexto.anuncios?.get(a.refId);
      if (!texto) return { estado: "omitir" };
      // Un solo texto: el admin escribe en un idioma y no hay traducción que inventar. Lleva a la
      // bandeja, donde se lee entero; no hay (ni se promete) una pantalla propia del anuncio.
      return ok({ texto }, "/notificaciones");
    }
    case "TOQUE":
      // LLEVA AL PERFIL DE QUIEN TOCA, que es lo único que hay que mirar: un toque no tiene
      // contenido detrás. El handle sale de `datos` y no de la clave, aunque la clave también lo
      // lleve: son dos usos distintos (pintar y deduplicar) y atarlos haría que cambiar el formato
      // de uno cambiara el otro.
      return ok(
        { espacio: "avisos", clave: "toque", params: { autor: a.datos.autor } },
        `/u/${a.datos.autor}`,
      );
    case "COMENTARIO": {
      // Sin el texto del comentario (ver el esquema). Lleva AL COMENTARIO: el feed abre por ese vídeo y
      // ancla el comentario. El vídeo no viaja en la fila del aviso —se une por refId al leer, como el
      // texto de los anuncios—, así que si no llegó (comentario retirado, vídeo que ya no se ve) el
      // enlace CAE al de antes: el reto si es una participación, y el perfil si es una subida libre,
      // que es donde está el vídeo mientras no haya página propia.
      const videoId = contexto.comentarios?.get(a.refId);
      const href = videoId
        ? enlaceComentario(videoId, a.refId)
        : a.datos.reto
          ? enlaceReto(a.datos.reto)
          : "/perfil";
      return a.datos.reto
        ? ok(
            {
              espacio: "avisos",
              clave: "comentarioEnReto",
              params: { autor: a.datos.autor, reto: a.datos.reto.titulo },
            },
            href,
          )
        : ok({ espacio: "avisos", clave: "comentario", params: { autor: a.datos.autor } }, href);
    }
  }
}

/** Lo que un aviso necesita de FUERA de su fila para pintarse: hoy, el texto de los anuncios por id. */
export interface ContextoTexto {
  anuncios?: ReadonlyMap<string, string>;
  /** Vídeo de cada COMENTARIO avisado, por id de comentario. Sin él, el aviso de comentario enlaza
   *  como antes (al reto o al perfil): degrada, no rompe. */
  comentarios?: ReadonlyMap<string, string>;
}
