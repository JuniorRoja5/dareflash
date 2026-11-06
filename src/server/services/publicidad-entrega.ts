/**
 * LA ENTREGA DE LA PUBLICIDAD (Fase 9 · P7): qué pieza sale en cada hueco del feed y de la portada.
 *
 * ┌─ LA DECISIÓN ES DE `lib/publicidad`, Y AQUÍ SOLO SE ALIMENTA ───────────────────────────────────┐
 * │ La cascada (`elegiblesEnHueco`) es la MISMA que usa la estimación que la empresa vio antes de    │
 * │ pagar, y la rotación (`elegirConRotacion`) es pura y está simulada en los tests. Este módulo     │
 * │ pone lo que necesita la decisión —las campañas de hoy, dónde está quien mira, el contador del    │
 * │ día, lo que acaba de ver— y devuelve el DTO de entrega. Si la regla viviera aquí, la estimación  │
 * │ prometería una cosa y el feed haría otra.                                                         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ EL DTO DE ENTREGA ES MÍNIMO Y CERRADO ─────────────────────────────────────────────────────────┐
 * │ Lo pide cualquiera, anónimo, así que su defensa es lo que devuelve: imagen, texto, enlace y la   │
 * │ etiqueta. Ni la empresa, ni el calendario, ni la tarifa, ni el saldo. Un test exige IGUALDAD     │
 * │ exacta de claves: el hueco típico no es una consulta sin filtro, es un select que creció.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NUNCA LANZA hacia el feed: sin Redis la rotación pasa a ser al azar entre las elegibles (aproximada,
 * y da igual para el dinero: el cobro no sale de aquí) y no hay tope de frecuencia ni anuncio de la casa
 * en el feed; con la base de datos caída, el hueco se queda vacío. La publicidad no puede tumbar el feed.
 *
 * NO SE COBRA NI SE CUENTA AQUÍ: el consumo diario es P9 y las métricas (impresiones, clics) son P10.
 */
import "server-only";

import {
  ANUNCIO_CASA,
  ANUNCIO_CASA_DESTINO,
  type AlcancePublicidad,
  ETIQUETA_PIEZA_CAMPANA,
  ETIQUETA_PIEZA_CASA,
  type EspacioPublicidad,
  PUBLICIDAD_CACHE_HOY_MS,
  PUBLICIDAD_CADA_N_ITEMS,
  PUBLICIDAD_CASA_FEED_TTL_S,
  PUBLICIDAD_RECIENTES_TTL_S,
  PUBLICIDAD_TOPE_FRECUENCIA,
} from "@/config/constants";
import { type Ubicacion, UBICACION_DESCONOCIDA } from "@/lib/geo";
import {
  type CampanaEnReparto,
  claveDia,
  claveRotacion,
  diaDe,
  elegiblesEnHueco,
  elegirConRotacion,
  espacioDelHueco,
  huecosEnTramo,
} from "@/lib/publicidad";
import type { Db } from "@/server/db/types";

// ---------------------------------------------------------------------------------------------------
// El DTO de entrega
// ---------------------------------------------------------------------------------------------------

/** LO ÚNICO QUE SALE HACIA QUIEN MIRA. Un test fija estas claves exactas. */
export interface PiezaEntregada {
  tipo: "campana" | "casa";
  id: string;
  /** «Publicidad» (un tercero) o «De DareFlash» (la casa). Siempre visible. */
  etiqueta: string;
  imagen: string | null;
  titulo: string | null;
  texto: string;
  cta: string;
  enlace: string;
  /** Si el enlace sale de DareFlash (pestaña nueva, `rel="sponsored noopener"`). */
  externo: boolean;
}

/**
 * EL ENLACE DE UNA CAMPAÑA, en UN SOLO SITIO para el feed y la portada. Hoy va directo a su destino;
 * P10 lo cambia por el redirector `/ir/{id}` que cuenta el clic, y solo tiene que tocar esta función.
 */
export function enlaceDeCampana(c: { id: string; destinoUrl: string }): string {
  return c.destinoUrl;
}

/** El texto del botón de una campaña (el destino es suyo: no se sabe qué hay al otro lado). */
const CTA_CAMPANA = "Visitar";

interface CampanaEntrega extends CampanaEnReparto {
  imagen: string;
  texto: string;
  destinoUrl: string;
}

function piezaDeCampana(c: CampanaEntrega): PiezaEntregada {
  return {
    tipo: "campana",
    id: c.id,
    etiqueta: ETIQUETA_PIEZA_CAMPANA,
    imagen: c.imagen,
    titulo: null,
    texto: c.texto,
    cta: CTA_CAMPANA,
    enlace: enlaceDeCampana(c),
    externo: true,
  };
}

/** EL ANUNCIO DE LA CASA del espacio. A una empresa la lleva a su Publicidad, no al alta. */
export function piezaDeLaCasa(espacio: EspacioPublicidad, esEmpresa: boolean): PiezaEntregada {
  const casa = ANUNCIO_CASA[espacio];
  return {
    tipo: "casa",
    id: `casa-${espacio.toLowerCase()}`,
    etiqueta: ETIQUETA_PIEZA_CASA,
    imagen: null,
    titulo: casa.titulo,
    texto: casa.texto,
    cta: casa.cta,
    enlace: esEmpresa ? ANUNCIO_CASA_DESTINO.empresa : ANUNCIO_CASA_DESTINO.invitado,
    externo: false,
  };
}

// ---------------------------------------------------------------------------------------------------
// Las campañas de hoy (con caché corta por proceso)
// ---------------------------------------------------------------------------------------------------

let cache: { dia: string; hasta: number; campanas: CampanaEntrega[] } | null = null;

/** Solo para los tests: que cada caso lea la base de datos de nuevo. */
export function olvidarCacheDeHoy(): void {
  cache = null;
}

/**
 * LAS CAMPAÑAS QUE SALEN HOY: las que OCUPAN el día de hoy (su calendario es la ocupación), con
 * intención de salir (ACTIVA), con imagen, y de una empresa VERIFICADA (suspender una empresa para sus
 * campañas: es un join más en la consulta más caliente, y es el precio de que la suspensión signifique
 * algo). Una consulta por proceso cada `PUBLICIDAD_CACHE_HOY_MS`: pausar, terminar o suspender tarda eso,
 * como mucho, en notarse en el feed.
 *
 * La consulta entra por el índice `ZonaOcupacion(dia)`: solo lee las filas de hoy.
 */
export async function campanasDeHoy(db: Db, ahora: Date = new Date()): Promise<CampanaEntrega[]> {
  const dia = claveDia(diaDe(ahora));
  if (cache && cache.dia === dia && cache.hasta > ahora.getTime()) return cache.campanas;
  const ocupadas = await db.zonaOcupacion.findMany({
    where: {
      dia: diaDe(ahora),
      publicidad: {
        estado: "ACTIVA",
        imagen: { not: null },
        empresa: { estado: "VERIFICADA" },
      },
    },
    distinct: ["publicidadId"],
    select: { publicidadId: true },
  });
  const ids = ocupadas.map((o) => o.publicidadId);
  const filas = ids.length
    ? await db.publicidad.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          alcance: true,
          estadoCodigo: true,
          imagen: true,
          texto: true,
          destinoUrl: true,
          paises: { select: { paisIso: true } },
          ciudades: { select: { ciudadId: true } },
        },
      })
    : [];
  const campanas: CampanaEntrega[] = filas.map((f) => ({
    id: f.id,
    alcance: f.alcance as AlcancePublicidad,
    estadoCodigo: f.estadoCodigo,
    paises: f.paises.map((p) => p.paisIso),
    ciudades: f.ciudades.map((c) => c.ciudadId),
    imagen: f.imagen as string,
    texto: f.texto,
    destinoUrl: f.destinoUrl,
  }));
  cache = { dia, hasta: ahora.getTime() + PUBLICIDAD_CACHE_HOY_MS, campanas };
  return campanas;
}

// ---------------------------------------------------------------------------------------------------
// La elección de una pieza
// ---------------------------------------------------------------------------------------------------

/** Lo mínimo de Redis que se usa (inyectable en los tests). */
export interface RedisReparto {
  incr(clave: string): Promise<number>;
  expire(clave: string, segundos: number): Promise<unknown>;
  lrange(clave: string, desde: number, hasta: number): Promise<string[]>;
  lpush(clave: string, ...valores: string[]): Promise<unknown>;
  ltrim(clave: string, desde: number, hasta: number): Promise<unknown>;
  set(clave: string, valor: string, ...args: (string | number)[]): Promise<unknown>;
}

/** Quién mira y desde dónde: lo que la elección necesita de la petición. */
export interface Espectador {
  ubicacion: Ubicacion;
  /** Identidad opaca para el tope de frecuencia y la casa: `u:<userId>` o `i:<ip cifrada>`; null si no hay. */
  quien: string | null;
  esEmpresa: boolean;
}

export type Superficie = "feed" | "portada";

/**
 * LA PIEZA DE UN HUECO. Campaña si hay elegibles para quien mira (cascada de su espacio + rotación +
 * tope de frecuencia); si no, el anuncio de la casa en la PORTADA (es un hueco fijo, siempre se rellena)
 * y, en el FEED, como mucho una vez por sesión —verlo cada ocho vídeos sería molesto e inútil para casi
 * todos—; el resto de veces, `null`: el hueco no se rellena.
 */
export async function elegirPieza(
  db: Db,
  entrada: {
    espacio: EspacioPublicidad;
    espectador: Espectador;
    superficie: Superficie;
    redis: RedisReparto | null;
    ahora?: Date;
    /** Solo tests: el número al azar cuando no hay Redis. */
    azar?: () => number;
  },
): Promise<PiezaEntregada | null> {
  const ahora = entrada.ahora ?? new Date();
  const { espacio, espectador, redis } = entrada;
  let campanas: CampanaEntrega[] = [];
  try {
    campanas = await campanasDeHoy(db, ahora);
  } catch {
    campanas = [];
  }
  const elegibles = elegiblesEnHueco(espacio, espectador.ubicacion, campanas);

  if (elegibles.length > 0) {
    let recientes: string[] = [];
    let contador = Math.floor((entrada.azar ?? Math.random)() * 1_000_000);
    const claveVistos = espectador.quien ? `pub:vistos:${espectador.quien}` : null;
    if (redis) {
      try {
        if (claveVistos) {
          recientes = await redis.lrange(claveVistos, 0, PUBLICIDAD_TOPE_FRECUENCIA - 1);
        }
        const claveContador = `pub:rot:${claveDia(diaDe(ahora))}:${claveRotacion(espacio, espectador.ubicacion, elegibles)}`;
        contador = (await redis.incr(claveContador)) - 1;
        // El contador es del DÍA: caduca con él (con margen, para el que llega a medianoche).
        if (contador === 0) await redis.expire(claveContador, 2 * 24 * 60 * 60);
      } catch {
        // Redis caído: rotación al azar y sin tope. Aproximado, nunca un fallo.
        recientes = [];
      }
    }
    const elegida = elegirConRotacion(elegibles, contador, new Set(recientes));
    if (elegida) {
      if (redis && claveVistos) {
        try {
          await redis.lpush(claveVistos, elegida.id);
          await redis.ltrim(claveVistos, 0, PUBLICIDAD_TOPE_FRECUENCIA - 1);
          await redis.expire(claveVistos, PUBLICIDAD_RECIENTES_TTL_S);
        } catch {
          // Sin recuerdo esta vez: el tope de frecuencia es una cortesía, no una garantía.
        }
      }
      return piezaDeCampana(elegida);
    }
  }

  if (entrada.superficie === "portada") return piezaDeLaCasa(espacio, espectador.esEmpresa);
  // FEED: la casa, una vez por sesión. Sin Redis (o sin identidad) no se puede saber si ya la vio,
  // así que no se enseña: mejor un hueco sin rellenar que el mismo cartel cada ocho vídeos.
  if (!redis || !espectador.quien) return null;
  try {
    const nueva = await redis.set(
      `pub:casa:${espectador.quien}`,
      "1",
      "EX",
      PUBLICIDAD_CASA_FEED_TTL_S,
      "NX",
    );
    return nueva === "OK" ? piezaDeLaCasa(espacio, espectador.esEmpresa) : null;
  } catch {
    return null;
  }
}

/**
 * LAS PIEZAS DE UNA PÁGINA DEL FEED: un hueco tras cada `PUBLICIDAD_CADA_N_ITEMS` vídeos contados desde
 * el principio del feed (`desde` = cuántos se habían enseñado antes), con su espacio alterno. Va hueco
 * a hueco y en orden, para que el contador y el tope de frecuencia vean cada elección anterior.
 */
export async function piezasDeUnaPagina(
  db: Db,
  entrada: {
    desde: number;
    videoIds: readonly string[];
    espectador: Espectador;
    redis: RedisReparto | null;
    ahora?: Date;
  },
): Promise<{ despuesDe: string; pieza: PiezaEntregada }[]> {
  const piezas: { despuesDe: string; pieza: PiezaEntregada }[] = [];
  for (const h of huecosEnTramo(entrada.desde, entrada.videoIds.length, PUBLICIDAD_CADA_N_ITEMS)) {
    const pieza = await elegirPieza(db, {
      espacio: espacioDelHueco(h.k),
      espectador: entrada.espectador,
      superficie: "feed",
      redis: entrada.redis,
      ahora: entrada.ahora,
    });
    const videoId = entrada.videoIds[h.despuesDe];
    if (pieza && videoId) piezas.push({ despuesDe: videoId, pieza });
  }
  return piezas;
}

// ---------------------------------------------------------------------------------------------------
// Quién mira (desde la petición)
// ---------------------------------------------------------------------------------------------------

/**
 * EL ESPECTADOR DE ESTA PETICIÓN, o `null` si NO DEBE VER PUBLICIDAD (VIP: no ve publicidad, ni en el
 * feed ni en la portada). Con sesión, la ubicación que se guardó al entrar (sale de la misma consulta que
 * valida la sesión); de invitado, la resuelta y memoizada por IP cifrada (la IP solo de X-Real-IP, la
 * fija Caddy). Nunca lanza: si algo falla, quien mira es «desconocido» y solo le toca lo global.
 */
export async function espectadorDeLaPeticion(
  db: Db,
  sesion: { userId: string; esCuentaEmpresa: boolean; ubicacion?: Ubicacion } | null,
  ip: string | null,
): Promise<Espectador | null> {
  try {
    if (sesion) {
      const { esVipActivoDe } = await import("@/server/services/vip");
      if (await esVipActivoDe(db, sesion.userId)) return null;
      return {
        ubicacion: sesion.ubicacion ?? UBICACION_DESCONOCIDA,
        quien: `u:${sesion.userId}`,
        esEmpresa: sesion.esCuentaEmpresa,
      };
    }
    if (!ip) return { ubicacion: UBICACION_DESCONOCIDA, quien: null, esEmpresa: false };
    const { env } = await import("@/config/env");
    const { rateLimitKey } = await import("@/server/http/api");
    const { getRedis } = await import("@/server/cache/redis");
    const { lectorIp } = await import("@/server/geo/lector-ip");
    const { ubicacionDeInvitado } = await import("@/server/geo/ubicacion");
    const ipHash = rateLimitKey(env.AUTH_SECRET, ip);
    const ubicacion = await ubicacionDeInvitado(
      db,
      { ip, ipHash },
      { lector: await lectorIp(), redis: getRedis() },
    );
    return { ubicacion, quien: `i:${ipHash}`, esEmpresa: false };
  } catch {
    return { ubicacion: UBICACION_DESCONOCIDA, quien: null, esEmpresa: false };
  }
}

// ---------------------------------------------------------------------------------------------------
// Las dos puertas: el feed y la portada
// ---------------------------------------------------------------------------------------------------

type SesionDeEntrega = { userId: string; esCuentaEmpresa: boolean; ubicacion?: Ubicacion } | null;

/**
 * LAS PIEZAS DE UNA PÁGINA DEL FEED, desde la petición: quién mira, su Redis, y los huecos de la página.
 * La usan la primera página (el Server Component de /feed) y las siguientes (`/api/feed`): una sola
 * puerta, para que las dos no repartan distinto. NUNCA LANZA: si algo falla, la página sale sin huecos.
 */
export async function piezasDelFeed(
  db: Db,
  entrada: {
    sesion: SesionDeEntrega;
    ip: string | null;
    desde: number;
    videoIds: readonly string[];
    /** Inyectable para los tests. Ausente = el del proceso; `null` = sin Redis. */
    redis?: RedisReparto | null;
  },
): Promise<{ despuesDe: string; pieza: PiezaEntregada }[]> {
  try {
    const espectador = await espectadorDeLaPeticion(db, entrada.sesion, entrada.ip?.trim() || null);
    if (!espectador) return []; // VIP: sin publicidad
    return await piezasDeUnaPagina(db, {
      desde: entrada.desde,
      videoIds: entrada.videoIds,
      espectador,
      redis: await redisDe(entrada.redis),
    });
  } catch {
    return [];
  }
}

/** El Redis inyectado o el del proceso (cuya lectura de `env` ocurre aquí, por petición). */
async function redisDe(inyectado: RedisReparto | null | undefined): Promise<RedisReparto | null> {
  if (inyectado !== undefined) return inyectado;
  const { getRedis } = await import("@/server/cache/redis");
  return getRedis() as RedisReparto | null;
}

/**
 * LA PIEZA DE UN HUECO DE LA PORTADA (Espacio 1 = global, Espacio 2 = local). Siempre se rellena —con
 * una campaña o con la casa— salvo para un VIP (`null`) o si algo falla (`null`: el hueco no se pinta).
 */
export async function piezaDePortada(
  db: Db,
  entrada: {
    sesion: SesionDeEntrega;
    ip: string | null;
    espacio: EspacioPublicidad;
    /** Inyectable para los tests. Ausente = el del proceso; `null` = sin Redis. */
    redis?: RedisReparto | null;
  },
): Promise<PiezaEntregada | null> {
  try {
    const espectador = await espectadorDeLaPeticion(db, entrada.sesion, entrada.ip?.trim() || null);
    if (!espectador) return null;
    return await elegirPieza(db, {
      espacio: entrada.espacio,
      espectador,
      superficie: "portada",
      redis: await redisDe(entrada.redis),
    });
  } catch {
    return null;
  }
}
