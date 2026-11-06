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

/**
 * EL SALDO EN HUMANO, con lo que ya está comprometido. Una sola frase para todo el portal (lista,
 * formulario, ficha): si cada pantalla lo dijera a su manera, una diría «tienes 90» y otra «te quedan 30»
 * sobre el mismo dinero, y las dos serían verdad a medias.
 */
export function fraseSaldo(
  saldo: number,
  comprometido: number,
  /** «otras» en la ficha y el formulario (se habla de UNA campaña); «todas» en la lista. */
  cuales: "otras" | "todas" = "otras",
): string {
  const s = saldo === 1 ? "crédito" : "créditos";
  if (comprometido <= 0) return `Tienes ${saldo} ${s} de publicidad.`;
  const quedan = Math.max(0, saldo - comprometido);
  const donde = cuales === "otras" ? "tus otras campañas" : "tus campañas activas y programadas";
  return `Tienes ${saldo} ${s} de publicidad; ${comprometido} ya están comprometidos en ${donde}, así que te quedan ${quedan} para nuevas.`;
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
  /** ¿La pausó el UMBRAL de denuncias (`ocultoAutoEn`)? Entonces está EN REVISIÓN, no pausada por ella. */
  ocultaPorDenuncias = false,
): EstadoVisiblePublicidad {
  if (estado === "PAUSADA" && ocultaPorDenuncias) return "EN_REVISION";
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
    // EN REVISIÓN (la pausó el umbral de denuncias): reanudarla sería saltarse la revisión; terminarla,
    // en cambio, es suya y no esquiva nada.
    case "EN_REVISION":
      return ["TERMINAR"];
    case "FINALIZADA":
    case "TERMINADA":
    case "RETIRADA":
      return [];
  }
}

/**
 * LOS DÍAS QUE LE QUEDAN POR DELANTE, los que la ficha enseña como «Le quedan N créditos». En una
 * pausada o en revisión son los que recupera al reanudar; en una cerrada no vuelve ninguno. La RETIRADA
 * es la que importa: sus días se liberaron y no se devuelven, y enseñarle «le quedan 60 créditos» a la
 * empresa le promete algo que no va a pasar (se vio así en la ficha mirándola, no en un test).
 */
export function diasPorDelante(
  estado: EstadoVisiblePublicidad,
  diasContratados: number,
  diasTenidos: number,
): number {
  switch (estado) {
    case "BORRADOR":
      return diasContratados;
    case "FINALIZADA":
    case "TERMINADA":
    case "RETIRADA":
      return 0;
    default:
      return Math.max(0, diasContratados - diasTenidos);
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
// El reparto (§3.1, §3.3, §3.6) — puro, para poder simularlo
// ---------------------------------------------------------------------------------------------------

/**
 * EL ESPACIO DE CADA HUECO: alternan, el 1.º (k = 0) global, el 2.º local… Así cada espacio se lleva la
 * mitad del inventario sea cual sea la demanda del otro, que es lo que hace que «dos espacios separados»
 * signifique algo.
 */
export function espacioDelHueco(k: number): EspacioPublicidad {
  return k % 2 === 0 ? "GLOBAL" : "LOCAL";
}

/**
 * LOS HUECOS QUE CAEN EN UN TRAMO DEL FEED: un hueco después de cada `cadaN` vídeos, contando desde el
 * principio del feed. `desde` es cuántos vídeos se habían enseñado antes de esta página y `cuantos` los
 * de la página. Devuelve el número de hueco (para su espacio) y tras qué vídeo DE LA PÁGINA va.
 */
export function huecosEnTramo(
  desde: number,
  cuantos: number,
  cadaN: number,
): { k: number; despuesDe: number }[] {
  const huecos: { k: number; despuesDe: number }[] = [];
  const inicio = Math.max(0, Math.floor(desde));
  for (let i = inicio; i < inicio + cuantos; i += 1) {
    if ((i + 1) % cadaN === 0) huecos.push({ k: (i + 1) / cadaN - 1, despuesDe: i - inicio });
  }
  return huecos;
}

/**
 * LA CLAVE DEL CONTADOR DE ROTACIÓN: el nivel de la cascada que dio las elegibles, en el sitio de quien
 * mira. Todas las personas de la misma ciudad comparten contador para el hueco local, y por eso «de las
 * 120 vistas locales de Medellín de ayer, 40 fueron de cada una» se puede afirmar, no estimar.
 */
export function claveRotacion(
  espacio: EspacioPublicidad,
  espectador: Ubicacion,
  elegibles: readonly CampanaEnReparto[],
): string {
  const nivel = elegibles[0]?.alcance;
  if (nivel === "CIUDAD") return `${espacio}:CIUDAD:${espectador.ciudadId}`;
  if (nivel === "ESTADO") return `${espacio}:ESTADO:${espectador.estadoCodigo}`;
  if (nivel === "PAIS") return `${espacio}:PAIS:${espectador.paisIso}`;
  return `${espacio}:GLOBAL`;
}

/**
 * ELIGE UNA CAMPAÑA DEL CONJUNTO ELEGIBLE: rotación estable con pesos iguales (todas pagaron lo mismo por
 * ese día), con el contador del DÍA —no de una ventana corta: con menos de una impresión por ventana, el
 * redondeo dominaría y el reparto no convergería nunca—. El conjunto se ordena por id para que el mismo
 * contador dé siempre la misma campaña.
 *
 * TOPE DE FRECUENCIA: se salta lo que esta persona vio en sus últimos huecos (`recientes`), probando la
 * siguiente de la rotación; si todas son recientes, ninguna (`null`: el hueco no repite cartel).
 */
export function elegirConRotacion<C extends { id: string }>(
  elegibles: readonly C[],
  contador: number,
  recientes: ReadonlySet<string> = new Set(),
): C | null {
  if (elegibles.length === 0) return null;
  const orden = [...elegibles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const base = ((contador % orden.length) + orden.length) % orden.length;
  for (let paso = 0; paso < orden.length; paso += 1) {
    const c = orden[(base + paso) % orden.length]!;
    if (!recientes.has(c.id)) return c;
  }
  return null;
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
