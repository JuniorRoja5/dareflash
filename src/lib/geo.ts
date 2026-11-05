/**
 * GEOGRAFÍA PURA (Fase 9 · P5): distancias, el recorte por caja del radio, las zonas de quien mira y la
 * mediana del aforo. Sin servidor ni base de datos: se prueba con distancias conocidas —Valencia–
 * Castellón ≈63 km dentro del radio, Valencia–Alicante ≈134 km fuera—, que es como se ve si alguien
 * confunde grados con radianes.
 */
import { type NivelAforo, ZONA_GLOBAL } from "@/config/constants";

/** Radio medio de la Tierra, en km (el de la fórmula de haversine al uso). */
const RADIO_TIERRA_KM = 6371.0088;

const rad = (grados: number) => (grados * Math.PI) / 180;

export interface Punto {
  latitud: number;
  longitud: number;
}

/** Distancia por la superficie (haversine), en km. */
export function distanciaKm(a: Punto, b: Punto): number {
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Caja {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

/**
 * LA CAJA que contiene el círculo de `km` alrededor de un punto: el recorte barato (dos rangos
 * indexados) que deja la haversine para las pocas filas que quedan. En latitud, un grado son ~111 km
 * en cualquier sitio; en longitud, un grado mide menos cuanto más lejos del ecuador (× cos lat), así
 * que la caja se ensancha con el paralelo.
 *
 * Cerca de un polo la longitud deja de acotar y la caja abarca todas. Cruzar el antimeridiano (±180°)
 * no se parte en dos cajas: la caja se recorta a [-180, 180] y lo del otro lado se pierde. Ninguna
 * ciudad del catálogo de más de 15.000 habitantes vive a menos de 100 km de esa línea salvo en Fiyi y
 * Chukotka, y ahí una campaña de ciudad vería un radio algo menor; no merece la complejidad.
 */
export function cajaDeRadio(centro: Punto, km: number): Caja {
  const dLat = km / 111.32;
  const coseno = Math.cos(rad(centro.latitud));
  const dLon = coseno < 1e-6 ? 180 : Math.min(180, km / (111.32 * coseno));
  return {
    latMin: Math.max(-90, centro.latitud - dLat),
    latMax: Math.min(90, centro.latitud + dLat),
    lonMin: Math.max(-180, centro.longitud - dLon),
    lonMax: Math.min(180, centro.longitud + dLon),
  };
}

/**
 * DÓNDE ESTÁ QUIEN MIRA, ya resuelto: todo opcional porque la IP puede no decir nada (sin fichero, IP
 * privada) o decir solo el país. Nunca la IP: solo el resultado.
 */
export interface Ubicacion {
  paisIso: string | null;
  estadoCodigo: string | null;
  ciudadId: number | null;
}

export const UBICACION_DESCONOCIDA: Ubicacion = {
  paisIso: null,
  estadoCodigo: null,
  ciudadId: null,
};

export interface Zona {
  nivel: NivelAforo;
  zona: string;
}

/**
 * LAS ZONAS EN LAS QUE CUENTA UNA PERSONA para el aforo: la suya en cada nivel que se conozca, y SIEMPRE
 * la global (quien no tiene ubicación también ve publicidad global). Del nivel más concreto al más
 * amplio, que es el orden de la cascada de lo local.
 */
export function zonasDe(u: Ubicacion): Zona[] {
  const zonas: Zona[] = [];
  if (u.ciudadId !== null) zonas.push({ nivel: "CIUDAD", zona: String(u.ciudadId) });
  if (u.estadoCodigo !== null) zonas.push({ nivel: "ESTADO", zona: u.estadoCodigo });
  if (u.paisIso !== null) zonas.push({ nivel: "PAIS", zona: u.paisIso });
  zonas.push({ nivel: "GLOBAL", zona: ZONA_GLOBAL });
  return zonas;
}

/**
 * MEDIANA. `null` si no hay datos —no 0—: «no sabemos» y «no pasó nadie» son cosas distintas, y la
 * estimación sube de nivel con lo primero y no con lo segundo. Con un número par de datos, la media de
 * los dos centrales redondeada a la BAJA: la estimación se enseña con «unas» y nunca de más.
 */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[m]! : Math.floor((v[m - 1]! + v[m]!) / 2);
}
