/**
 * DÓNDE ESTÁ QUIEN MIRA, y QUÉ CIUDADES CAEN EN UN RADIO — Fase 9 · P5 (§4.4 y §4.6 del plan).
 *
 * LA CIUDAD SE CASA POR COORDENADAS, no por nombre. DB-IP Lite City no trae el geonameId, y el nombre
 * que trae está en inglés («Seville», «Cologne»): casarlo con el catálogo por texto fallaría en silencio
 * justo en las ciudades con exónimo. Las coordenadas sí casan: la ciudad del catálogo MÁS CERCANA, del
 * mismo país y a menos de `GEOIP_CIUDAD_MAX_KM`. Más lejos, se sabe el país y nada más —mejor que
 * inventar una ciudad—.
 *
 * DÓNDE SE RESUELVE, Y CUÁNTAS VECES: con sesión, una vez al crearla (se guarda en la fila de `Session`);
 * de invitado, memoizado por IP HASHEADA en Redis con TTL corto (o en memoria si no hay Redis). Nunca por
 * petición contra la base de datos, y nunca en una cookie que el cliente pueda editar.
 */
import "server-only";

import { GEOIP_CIUDAD_MAX_KM, GEOIP_MEMO_ANONIMO_S, RADIO_PUBLICIDAD_KM } from "@/config/constants";
import {
  type Punto,
  UBICACION_DESCONOCIDA,
  type Ubicacion,
  cajaDeRadio,
  distanciaKm,
} from "@/lib/geo";
import type { Db } from "@/server/db/types";

import type { LectorIp } from "./lector-ip";

interface FilaCiudad {
  id: number;
  nombre: string;
  nombreAscii: string;
  estadoCodigo: string | null;
  latitud: number;
  longitud: number;
}

/** Para comparar nombres sin acentos ni caja («Medellín» = «medellin»). */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Las ciudades del catálogo dentro de la caja de un radio (el recorte indexado, antes de la haversine). */
function ciudadesEnCaja(db: Db, centro: Punto, km: number, paisIso?: string) {
  const c = cajaDeRadio(centro, km);
  return db.ciudad.findMany({
    where: {
      latitud: { gte: c.latMin, lte: c.latMax },
      longitud: { gte: c.lonMin, lte: c.lonMax },
      ...(paisIso ? { paisIso } : {}),
    },
    select: {
      id: true,
      nombre: true,
      nombreAscii: true,
      estadoCodigo: true,
      latitud: true,
      longitud: true,
    },
  });
}

/**
 * LA CIUDAD DEL CATÁLOGO PARA UNAS COORDENADAS DE IP: del mismo país y dentro de `maxKm`.
 *
 * PRIMERO LA QUE SE LLAMA COMO DICE EL FICHERO, después la más cercana. Medido con el fichero real: una
 * IP de Madrid caía en «Chamartín» (un distrito que GeoNames lista aparte) y una de Medellín en
 * «Itagüí» (el municipio vecino), porque las coordenadas de DB-IP apuntan a un barrio y el barrio queda
 * más cerca del centro del distrito que del de la ciudad. Con solo «la más cercana», el aforo de Madrid
 * se repartiría entre sus distritos. Si el nombre no casa (un exónimo: «Seville»), se queda la más
 * cercana: sigue dentro del radio de cualquier campaña de esa ciudad.
 */
export async function ciudadDeIp(
  db: Db,
  paisIso: string,
  punto: Punto,
  nombre: string | null = null,
  maxKm: number = GEOIP_CIUDAD_MAX_KM,
): Promise<FilaCiudad | null> {
  const buscado = nombre ? plano(nombre) : null;
  let cercana: FilaCiudad | null = null;
  let cercanaKm = Number.POSITIVE_INFINITY;
  let porNombre: FilaCiudad | null = null;
  let porNombreKm = Number.POSITIVE_INFINITY;
  for (const c of await ciudadesEnCaja(db, punto, maxKm, paisIso)) {
    const d = distanciaKm(punto, c);
    if (d > maxKm) continue;
    if (d < cercanaKm) {
      cercana = c;
      cercanaKm = d;
    }
    if (
      buscado &&
      (plano(c.nombre) === buscado || plano(c.nombreAscii) === buscado) &&
      d < porNombreKm
    ) {
      porNombre = c;
      porNombreKm = d;
    }
  }
  return porNombre ?? cercana;
}

/**
 * Resuelve una IP a una ubicación. NUNCA LANZA: sin fichero, con una IP privada, o si algo falla al
 * consultar el catálogo, devuelve lo que sepa (el país, o nada).
 *
 * `esperar`: si el fichero se está cargando (arranque o actualización), esperar a que termine. Se usa al
 * crear una sesión —pasa una vez y queda guardado— y NO en el feed de un invitado, que no debe esperar.
 */
export async function resolverUbicacion(
  db: Db,
  ip: string,
  lector: LectorIp,
  opciones: { esperar?: boolean } = {},
): Promise<Ubicacion> {
  try {
    if (opciones.esperar) await lector.listo();
    const r = lector.buscar(ip);
    if (!r) return UBICACION_DESCONOCIDA;
    if (r.latitud === null || r.longitud === null) {
      return { paisIso: r.paisIso, estadoCodigo: null, ciudadId: null };
    }
    const c = await ciudadDeIp(
      db,
      r.paisIso,
      { latitud: r.latitud, longitud: r.longitud },
      r.ciudadNombre ?? null,
    );
    return {
      paisIso: r.paisIso,
      estadoCodigo: c?.estadoCodigo ?? null,
      ciudadId: c?.id ?? null,
    };
  } catch {
    return UBICACION_DESCONOCIDA;
  }
}

/**
 * GUARDA EN LA SESIÓN dónde está quien acaba de entrar. Se llama DESPUÉS de crear la sesión y FUERA del
 * hueco del semáforo de argon2: resolver puede esperar a que el fichero termine de cargar (el primer
 * login tras un despliegue), y eso no puede retener una plaza que limita los logins concurrentes ni
 * retrasar la respuesta. Solo escribe si la sesión aún no tiene ubicación: es una vez por sesión.
 */
export async function ubicarSesion(
  db: Db,
  sessionId: string,
  ip: string,
  lector: LectorIp,
): Promise<void> {
  const u = await resolverUbicacion(db, ip, lector, { esperar: true });
  if (u.paisIso === null) return;
  await db.session.updateMany({
    where: { id: sessionId, geoPais: null },
    data: { geoPais: u.paisIso, geoEstado: u.estadoCodigo, geoCiudadId: u.ciudadId },
  });
}

/**
 * LAS CIUDADES DEL RADIO de una campaña de ciudad (§4.6): se calcula UNA vez, al activar o programar
 * (P6), y se guarda; servir pasa a ser una igualdad indexada. Recorte por caja (dos rangos indexados) y
 * haversine solo sobre las pocas centenas que quedan. Incluye la propia ciudad. Sin filtro de país: un
 * radio de 100 km cruza fronteras igual que la gente.
 */
export async function ciudadesEnRadio(
  db: Db,
  ciudadId: number,
  km: number = RADIO_PUBLICIDAD_KM,
): Promise<number[]> {
  const centro = await db.ciudad.findUnique({
    where: { id: ciudadId },
    select: { latitud: true, longitud: true },
  });
  if (!centro) return [];
  return (await ciudadesEnCaja(db, centro, km))
    .filter((c) => distanciaKm(centro, c) <= km)
    .map((c) => c.id);
}

// ---------------------------------------------------------------------------------------------------
// Invitados: memo por IP hasheada
// ---------------------------------------------------------------------------------------------------

/** Lo mínimo de Redis que se usa aquí (inyectable en los tests). */
export interface RedisMemo {
  get(clave: string): Promise<string | null>;
  set(clave: string, valor: string, modo: "EX", segundos: number): Promise<unknown>;
}

/** Sin Redis, un memo en memoria del proceso, acotado: una IP por invitado no puede crecer sin fin. */
const MEMO_MAX = 5_000;
const memoLocal = new Map<string, { u: Ubicacion; caduca: number }>();

function guardarLocal(clave: string, u: Ubicacion, ahora: number): void {
  if (memoLocal.size >= MEMO_MAX) {
    const primera = memoLocal.keys().next().value;
    if (primera !== undefined) memoLocal.delete(primera);
  }
  memoLocal.set(clave, { u, caduca: ahora + GEOIP_MEMO_ANONIMO_S * 1000 });
}

/**
 * La ubicación de un INVITADO. `ipHash` es la IP ya hasheada con HMAC (la clave del memo: la IP en claro
 * no se guarda en ningún sitio); `ip` solo se usa para consultar el fichero, en memoria.
 */
export async function ubicacionDeInvitado(
  db: Db,
  entrada: { ip: string; ipHash: string },
  deps: { lector: LectorIp; redis: RedisMemo | null; ahora?: number },
): Promise<Ubicacion> {
  const clave = `geo:ip:${entrada.ipHash}`;
  const ahora = deps.ahora ?? Date.now();
  try {
    if (deps.redis) {
      const guardada = await deps.redis.get(clave);
      if (guardada) return JSON.parse(guardada) as Ubicacion;
    } else {
      const l = memoLocal.get(clave);
      if (l && l.caduca > ahora) return l.u;
    }
  } catch {
    // Redis caído: se resuelve sin memo. Peor rendimiento, nunca un fallo.
  }
  const u = await resolverUbicacion(db, entrada.ip, deps.lector);
  // «DESCONOCIDO» NO SE MEMOIZA: suele ser que el fichero aún se está cargando (arranque o
  // actualización), y guardarlo una hora dejaría a ese invitado sin ubicación toda esa hora. Volver a
  // resolverlo cuesta una búsqueda en memoria, sin base de datos (sin país no hay consulta al catálogo).
  if (u.paisIso === null) return u;
  try {
    if (deps.redis) await deps.redis.set(clave, JSON.stringify(u), "EX", GEOIP_MEMO_ANONIMO_S);
    else guardarLocal(clave, u, ahora);
  } catch {
    // Igual: sin memo esta vez.
  }
  return u;
}
