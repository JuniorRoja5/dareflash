/**
 * LA PUBLICIDAD, PURA (Fase 9 · P6): precio, zonas, calendario, estado visible, la CASCADA de cada
 * espacio y la estimación de cuánta gente le toca a una campaña. Sin servidor ni base de datos: todo lo
 * que decide algo se prueba aquí con números escritos.
 *
 * ┌─ LA CASCADA VIVE AQUÍ, Y NO EN EL REPARTO, A PROPÓSITO ─────────────────────────────────────────┐
 * │ La estimación que se enseña antes de pagar (§3.5 bis) tiene que salir del MISMO código que     │
 * │ reparte: se le pregunta al repartidor «de estas personas, cuántas me habrían tocado». Por eso  │
 * │ `elegiblesEnHueco` es la pieza que decide qué campañas entran en un hueco, y P7 la usará para  │
 * │ servir. Si el reparto tuviera su propia copia de la cascada, la estimación prometería lo que   │
 * │ calcula una y entregaría lo que calcula la otra.                                                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import {
  type AlcancePublicidad,
  CREDITOS_POR_DIA,
  type EspacioPublicidad,
  type EstadoPublicidad,
  type EstadoVisiblePublicidad,
} from "@/config/constants";

import { espacioDeAlcance } from "./empresa";
import type { Ubicacion } from "./geo";

const DIA_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------------
// Precio
// ---------------------------------------------------------------------------------------------------

/**
 * LA TARIFA DE HOY para un alcance: créditos por día. Para PAÍS, por país y con TOPE en Global (comprar
 * diez países no puede costar más que el mundo entero). Lee la tabla en cada llamada, así que una
 * campaña YA ACTIVA no debe pasar nunca por aquí: lleva su tarifa congelada.
 */
export function tarifaPorDia(alcance: AlcancePublicidad, paises = 1): number {
  if (alcance !== "PAIS") return CREDITOS_POR_DIA[alcance];
  return Math.min(CREDITOS_POR_DIA.PAIS * Math.max(1, paises), CREDITOS_POR_DIA.GLOBAL);
}

/** Lo que cuesta el calendario entero. Es la cifra contra la que se comprueba el saldo al activar. */
export function costeTotal(creditosPorDia: number, dias: number): number {
  return creditosPorDia * dias;
}

// ---------------------------------------------------------------------------------------------------
// Zonas
// ---------------------------------------------------------------------------------------------------

/** El alcance de una campaña, ya desplegado. */
export interface AlcanceDeCampana {
  alcance: AlcancePublicidad;
  ciudadId: number | null;
  estadoCodigo: string | null;
  /** Solo PAÍS: uno o varios. */
  paises: readonly string[];
}

/**
 * LAS ZONAS QUE OCUPA UNA CAMPAÑA, como clave de `ZonaOcupacion`. Una por país en PAÍS; una en el resto.
 *
 * LA OCUPACIÓN ES DE LA ZONA COMPRADA, no de cada ciudad del radio (§4.6): si se ocupara una plaza en
 * cada ciudad a 100 km —decenas en una zona densa—, una campaña se quedaría fuera porque un pueblo
 * vecino está lleno. Ordenadas: todas las transacciones ocupan en el MISMO orden, que es lo que evita
 * que dos se esperen en cruz.
 */
export function zonasDeCampana(c: AlcanceDeCampana): string[] {
  switch (c.alcance) {
    case "CIUDAD":
      return [`CIUDAD:${c.ciudadId}`];
    case "ESTADO":
      return [`ESTADO:${c.estadoCodigo}`];
    case "PAIS":
      return [...new Set(c.paises)].sort().map((p) => `PAIS:${p}`);
    case "GLOBAL":
      return ["GLOBAL:*"];
  }
}

// ---------------------------------------------------------------------------------------------------
// Calendario (días UTC, como el aforo y el resto del producto)
// ---------------------------------------------------------------------------------------------------

/** La medianoche UTC del día de un instante. */
export function diaDe(t: Date): Date {
  return new Date(`${t.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function sumarDias(dia: Date, n: number): Date {
  return new Date(dia.getTime() + n * DIA_MS);
}

/** `n` días seguidos desde `inicio` (incluido). */
export function diasSeguidos(inicio: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) => sumarDias(inicio, i));
}

/** `AAAA-MM-DD` de un día. */
export function claveDia(dia: Date): string {
  return dia.toISOString().slice(0, 10);
}

/**
 * EL ESTADO QUE SE ENSEÑA, calculado: la intención guardada más el calendario. El calendario es la
 * OCUPACIÓN (los días que la campaña tiene tomados), no una fecha de fin: pausar y reanudar lo parten
 * en dos tramos, y lo que vale es qué días tiene de verdad.
 */
export function estadoVisiblePublicidad(
  estado: EstadoPublicidad,
  calendario: { ocupaHoy: boolean; ocupaDespues: boolean },
): EstadoVisiblePublicidad {
  if (estado !== "ACTIVA") return estado;
  if (calendario.ocupaHoy) return "ACTIVA";
  if (calendario.ocupaDespues) return "PROGRAMADA";
  return "FINALIZADA";
}

/**
 * Lo que la empresa PUEDE HACER con su campaña en cada estado visible. Fuente única para el servidor y
 * los botones: un botón nunca ofrece una acción que el servidor va a rechazar.
 */
export type AccionPublicidad = "ACTIVAR" | "PAUSAR" | "REANUDAR" | "TERMINAR" | "BORRAR";

export function accionesPublicidad(estado: EstadoVisiblePublicidad): readonly AccionPublicidad[] {
  switch (estado) {
    case "BORRADOR":
      return ["ACTIVAR", "BORRAR"];
    case "PROGRAMADA":
    case "ACTIVA":
      return ["PAUSAR", "TERMINAR"];
    case "PAUSADA":
      return ["REANUDAR", "TERMINAR"];
    case "FINALIZADA":
    case "TERMINADA":
      return [];
  }
}

// ---------------------------------------------------------------------------------------------------
// La cascada de cada espacio (§3.2) — la pieza que reutiliza el reparto (P7)
// ---------------------------------------------------------------------------------------------------

/** Lo que el reparto necesita saber de una campaña para decidir si entra en un hueco. */
export interface CampanaEnReparto {
  id: string;
  alcance: AlcancePublicidad;
  /** CIUDAD: las ciudades a menos de 100 km de la comprada (`PublicidadCiudad`), ella incluida. */
  ciudades: readonly number[];
  estadoCodigo: string | null;
  paises: readonly string[];
}

/**
 * QUÉ CAMPAÑAS SON ELEGIBLES para un hueco de un espacio y un espectador. DOS CASCADAS QUE NO SE
 * CRUZAN, y EXCLUYENTES dentro de cada una:
 *  - LOCAL: campañas de CIUDAD cuyo radio contiene al espectador; si no hay ninguna, las de su ESTADO.
 *  - GLOBAL: campañas de su PAÍS; si no hay ninguna, las GLOBALES.
 * Si tampoco, vacío: el hueco es del anuncio de la casa. Una campaña global NUNCA entra en el hueco
 * local, ni al revés: es lo que protege al anunciante local, y se demuestra por construcción.
 *
 * Mezclar niveles en el mismo sorteo convertiría «compré mi ciudad» en «compré un billete de lotería».
 */
export function elegiblesEnHueco<C extends CampanaEnReparto>(
  espacio: EspacioPublicidad,
  espectador: Ubicacion,
  campanas: readonly C[],
): C[] {
  if (espacio === "LOCAL") {
    const ciudad =
      espectador.ciudadId === null
        ? []
        : campanas.filter(
            (c) => c.alcance === "CIUDAD" && c.ciudades.includes(espectador.ciudadId as number),
          );
    if (ciudad.length > 0) return ciudad;
    return espectador.estadoCodigo === null
      ? []
      : campanas.filter(
          (c) => c.alcance === "ESTADO" && c.estadoCodigo === espectador.estadoCodigo,
        );
  }
  const pais =
    espectador.paisIso === null
      ? []
      : campanas.filter(
          (c) => c.alcance === "PAIS" && c.paises.includes(espectador.paisIso as string),
        );
  if (pais.length > 0) return pais;
  return campanas.filter((c) => c.alcance === "GLOBAL");
}

// ---------------------------------------------------------------------------------------------------
// La estimación (§3.5 bis)
// ---------------------------------------------------------------------------------------------------

/** Un grupo de espectadores que están en el mismo sitio: cuántas personas al día y dónde. */
export interface GrupoEspectadores {
  ubicacion: Ubicacion;
  personas: number;
}

/**
 * CUÁNTAS PERSONAS AL DÍA LE TOCAN A UNA CAMPAÑA, un día concreto: por cada grupo de espectadores, el
 * repartidor decide quién es elegible (`elegiblesEnHueco`) y, con pesos iguales —todas pagaron lo
 * mismo por ese día—, a la campaña le toca su parte. Así la estimación incluye sola lo que a mano se
 * olvida: que en tu ciudad también salen las campañas de ciudades vecinas a menos de 100 km, y que un
 * espectador con campañas de ciudad no ve las de estado.
 *
 * Sin redondear: quien la enseña redondea A LA BAJA, después de sumar.
 */
export function personasQueLeTocan(
  propia: CampanaEnReparto,
  grupos: readonly GrupoEspectadores[],
  otras: readonly CampanaEnReparto[],
): number {
  const espacio = espacioDeAlcance(propia.alcance);
  const todas = [propia, ...otras.filter((o) => o.id !== propia.id)];
  let total = 0;
  for (const g of grupos) {
    if (g.personas <= 0) continue;
    const elegibles = elegiblesEnHueco(espacio, g.ubicacion, todas);
    if (elegibles.some((c) => c.id === propia.id)) total += g.personas / elegibles.length;
  }
  return total;
}

/**
 * LA ESTIMACIÓN DE UN CALENDARIO: el PEOR día de los contratados, redondeado a la baja. El peor y no la
 * media: un día con más competencia es un día que también se paga, y «unas 50 personas al día» tiene
 * que ser verdad todos los días, no de media. Con «unas» delante: una cifra con aspecto de precisión
 * invita a la reclamación.
 *
 * `otrasPorDia` da, para cada día, las campañas que estarían activas ese día (sin la propia).
 */
export function estimacionDelCalendario(
  propia: CampanaEnReparto,
  grupos: readonly GrupoEspectadores[],
  dias: readonly Date[],
  otrasPorDia: (dia: Date) => readonly CampanaEnReparto[],
): number {
  if (dias.length === 0) return 0;
  let peor = Number.POSITIVE_INFINITY;
  for (const d of dias) peor = Math.min(peor, personasQueLeTocan(propia, grupos, otrasPorDia(d)));
  return Math.floor(peor);
}

/**
 * LA CASCADA DE DATOS de cada alcance, para cuando la zona comprada no tiene tráfico medido: se sube un
 * nivel DE SU PROPIO ESPACIO (Ciudad → Estado → País en lo local; País → Global en lo global). Subir de
 * ciudad a global cruzaría los dos espacios y la cifra dejaría de describir lo que se compra.
 */
export function nivelesDeRespaldo(
  alcance: AlcancePublicidad,
): readonly ("ESTADO" | "PAIS" | "GLOBAL")[] {
  switch (alcance) {
    case "CIUDAD":
      return ["ESTADO", "PAIS"];
    case "ESTADO":
      return ["PAIS"];
    case "PAIS":
      return ["GLOBAL"];
    case "GLOBAL":
      return [];
  }
}

// ---------------------------------------------------------------------------------------------------
// El destino del clic
// ---------------------------------------------------------------------------------------------------

/**
 * ¿Es un destino aceptable? Solo `http(s)` absoluto: nada de `javascript:`, `data:` ni rutas relativas.
 * El clic de P7 redirige aquí, así que lo que entra es lo que el redirector mandará.
 */
export function destinoValido(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}
