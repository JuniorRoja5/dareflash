/**
 * EL LECTOR DEL FICHERO DE IP (DB-IP Lite City, MMDB) — Fase 9 · P5, §4.1 del plan.
 *
 * EN PROCESO, NO EN LA BASE DE DATOS: un viaje a MariaDB por visita en el camino del feed es justo el
 * coste que la fase de rendimiento quitó. El fichero entero vive en memoria (es como funciona MMDB:
 * un árbol de búsqueda sobre un buffer), y por eso lo abre SOLO el proceso `web`; el `worker` solo mira
 * la fecha del fichero para el aviso de caducidad.
 *
 * SE REABRE SIN REINICIAR. Como mucho una vez por minuto (`GEOIP_REVISAR_MS`) mira la fecha del fichero
 * y, si cambió, carga el nuevo EN SEGUNDO PLANO: mientras tanto se sigue respondiendo con el anterior, y
 * cuando el nuevo está listo se cambia de golpe. Nadie lee medio fichero (el guión del host lo sustituye
 * con un `rename` atómico) y ninguna petición espera a que se lean 100 MB.
 *
 * NUNCA LANZA. Sin fichero, con un fichero roto, con una IP privada o mal formada: `null`, que quien
 * llama traduce a «desconocido». La geolocalización mejora la publicidad; no puede tumbar un login.
 */
import "server-only";

import { readFile, stat } from "node:fs/promises";

import { type CityResponse, Reader, validate } from "maxmind";

import { GEOIP_REVISAR_MS } from "@/config/constants";

/** Lo que se lee del fichero. Solo lo que se usa: país, coordenadas y el nombre de la ciudad. */
export interface RegistroIp {
  paisIso: string;
  latitud: number | null;
  longitud: number | null;
  /**
   * El nombre de la ciudad según DB-IP (en inglés), SIN el barrio entre paréntesis: «Medellín (La
   * Aguacatala)» -> «Medellín». Sirve para preferir esa ciudad del catálogo frente a un barrio o un
   * municipio vecino que esté más cerca de las coordenadas (ver `ciudadDeIp`).
   */
  ciudadNombre?: string | null;
}

/**
 * El nombre de ciudad de DB-IP sin el barrio entre paréntesis: «Medellín (La Aguacatala)» -> «Medellín».
 * Pura y exportada para tenerla atada a un test: una versión con las barras invertidas perdidas dejaba
 * el nombre VACÍO y la preferencia por nombre dejaba de funcionar sin que nada fallara.
 */
export function nombreSinBarrio(nombre: string | null | undefined): string | null {
  const limpio = nombre?.replace(/\s*\(.*\)\s*$/, "").trim();
  return limpio ? limpio : null;
}

export interface LectorIp {
  /** El registro de una IP, o `null` si no se sabe. Síncrono: usa el lector que haya ya cargado. */
  buscar(ip: string): RegistroIp | null;
  /** Para los tests y el arranque: espera a que termine la carga en curso, si la hay. */
  listo(): Promise<void>;
}

export function crearLectorIp(opciones: {
  ruta: string;
  ahora?: () => number;
  /** Inyectables para probar sin disco. */
  leerFichero?: (ruta: string) => Promise<Buffer>;
  fechaFichero?: (ruta: string) => Promise<number | null>;
}): LectorIp {
  const ahora = opciones.ahora ?? Date.now;
  const leerFichero = opciones.leerFichero ?? ((r: string) => readFile(r));
  const fechaFichero =
    opciones.fechaFichero ??
    (async (r: string) => {
      try {
        return (await stat(r)).mtimeMs;
      } catch {
        return null;
      }
    });

  let lector: Reader<CityResponse> | null = null;
  let fechaCargada: number | null = null;
  let ultimaRevision = Number.NEGATIVE_INFINITY;
  let enCurso: Promise<void> | null = null;

  async function revisar(): Promise<void> {
    const fecha = await fechaFichero(opciones.ruta);
    // Sin fichero: se suelta el lector (si lo quitaron, que se note) y se responde «desconocido».
    if (fecha === null) {
      lector = null;
      fechaCargada = null;
      return;
    }
    if (fecha === fechaCargada && lector !== null) return;
    try {
      const nuevo = new Reader<CityResponse>(await leerFichero(opciones.ruta));
      lector = nuevo;
      fechaCargada = fecha;
    } catch {
      // Un fichero roto NO sustituye a uno bueno: se queda el anterior (si lo había) y se reintenta en
      // la siguiente revisión. `fechaCargada` no se toca para que se vuelva a intentar.
    }
  }

  function quizaRevisar(): void {
    const t = ahora();
    if (enCurso !== null || t - ultimaRevision < GEOIP_REVISAR_MS) return;
    ultimaRevision = t;
    enCurso = revisar()
      .catch(() => {})
      .finally(() => {
        enCurso = null;
      });
  }

  return {
    buscar(ip: string): RegistroIp | null {
      quizaRevisar();
      if (lector === null || !validate(ip)) return null;
      try {
        const r = lector.get(ip);
        const pais = r?.country?.iso_code;
        if (!pais || !/^[A-Z]{2}$/.test(pais)) return null;
        const lat = r.location?.latitude;
        const lon = r.location?.longitude;
        const ciudad = nombreSinBarrio(r.city?.names?.en);
        return {
          paisIso: pais,
          latitud: typeof lat === "number" ? lat : null,
          longitud: typeof lon === "number" ? lon : null,
          ciudadNombre: ciudad || null,
        };
      } catch {
        return null;
      }
    },
    async listo(): Promise<void> {
      quizaRevisar();
      if (enCurso) await enCurso;
    },
  };
}

let memo: LectorIp | undefined;

/** El lector del proceso, sobre `GEOIP_FICHERO`. Perezoso: `env` se lee al primer uso, nunca al importar. */
export async function lectorIp(): Promise<LectorIp> {
  if (memo) return memo;
  const { env } = await import("@/config/env");
  memo = crearLectorIp({ ruta: env.GEOIP_FICHERO });
  return memo;
}
