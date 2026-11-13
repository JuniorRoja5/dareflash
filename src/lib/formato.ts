/**
 * EL FORMATEADOR ÚNICO (Fase 11 · P1) — puro: lo usan el servidor y el cliente.
 *
 * Toda fecha, hora, importe y número que ve una persona sale de AQUÍ. Es el ÚNICO fichero de `src/`
 * con `Intl.*Format` o `toLocale…` (lo vigila `tests/formato-unico.test.ts`): cuando la app hable
 * inglés y alemán, el idioma se cambia en un sitio, no en ciento y pico.
 *
 * ┌─ IDIOMA Y ZONA SON OBLIGATORIOS, Y LA ZONA NO ES UN STRING CUALQUIERA ──────────────────────────┐
 * │ Un parámetro opcional se olvida y compila: es el fallo que esta fase ya pagó con las frases de   │
 * │ la tarifa. Aquí `idioma` y `zona` no tienen valor por defecto, y `ZonaHoraria` es un tipo MARCADO │
 * │ que solo sale de `zonaHoraria()` (que la valida) o de las constantes de abajo: pasar "UTC" o el   │
 * │ texto de una cookie sin validar no compila.                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LAS VARIANTES SIN ZONA LLEVAN NOMBRE PROPIO, y un censo de dónde se usan:
 *  - `formatearDiaClave`: una CLAVE DE DÍA UTC (un día de campaña, de métricas, de Boost) no es un
 *    instante: es una etiqueta de calendario. El «día 7» de una campaña es el 7 en cualquier zona;
 *    pintarlo en la hora de quien mira lo convertiría en «6» al otro lado del Atlántico.
 *  - `componentesEnZona`: las cifras de un instante en una zona, para CALCULAR (a qué hora local empieza
 *    un día), no para pintar una fecha.
 *
 * LO QUE NO SE MUEVE (Fase 11, invariante 5): los importes siguen en céntimos y con el formato de hoy
 * («$1,250.00»), y el MARCADOR (votos, podio, puestos) sigue agrupando con coma —«1,234»— también en
 * español: es una decisión de la marca desde sus primitivas (`e509a32`), no un descuido de locale.
 *
 * LOS FORMATEADORES SE REUTILIZAN: construir un `Intl.DateTimeFormat` cuesta mucho más que usarlo, y una
 * lista de cien filas construía cien. Se guardan por (locale, opciones).
 */

// ---------------------------------------------------------------------------------------------------
// Idioma y zona
// ---------------------------------------------------------------------------------------------------

/** Los idiomas de la Fase 11. Hoy la app solo habla `es`; los otros dos llegan con su pieza. */
export const IDIOMAS = ["es", "en", "de"] as const;
export type Idioma = (typeof IDIOMAS)[number];

/**
 * EL IDIOMA DEL EQUIPO: el del panel y el de los correos al admin. Con nombre propio y no un «es»
 * suelto: el día que el equipo trabaje en otro, se cambia aquí. No es el de los usuarios (ese sale de
 * la petición, ver `server/formato-peticion`).
 */
export const IDIOMA_DEL_EQUIPO: Idioma = "es";

/**
 * EL IDIOMA DE LO QUE SE ESCRIBE SIN PETICIÓN a un usuario o una empresa (un correo que dispara un job
 * o el admin): no hay cookie ni cabecera que leer. Hoy «es»; cuando la cuenta guarde su idioma, quien
 * escribe el correo lo leerá de ella y este nombre dejará de usarse (el censo dice dónde está).
 */
export const IDIOMA_SIN_PETICION: Idioma = "es";

/** El locale de cada idioma para fechas y números corrientes. */
const LOCALE: Record<Idioma, string> = { es: "es-ES", en: "en-US", de: "de-DE" };
/** El del MARCADOR: agrupa siempre (también las cifras de 4 dígitos). En español, con coma: marca. */
const LOCALE_MARCADOR: Record<Idioma, string> = { es: "en-US", en: "en-US", de: "de-DE" };
/** El de los IMPORTES: «$1,250.00» en español (regla de la casa, fijada por test). */
const LOCALE_IMPORTE: Record<Idioma, string> = { es: "en-US", en: "en-US", de: "de-DE" };

declare const marcaZona: unique symbol;
/** Una zona horaria IANA VALIDADA. Solo se obtiene con `zonaHoraria()` o las constantes de abajo. */
export type ZonaHoraria = string & { readonly [marcaZona]: true };

/** El panel, los correos al admin, y las claves de día: UTC, dicho por su nombre. */
export const ZONA_UTC = "UTC" as ZonaHoraria;
/** Las fechas de negocio que se fijaron en hora de Madrid (fin de Socios Fundadores, avisos al admin). */
export const ZONA_MADRID = "Europe/Madrid" as ZonaHoraria;

/**
 * Valida una zona IANA («Europe/Madrid», «America/Bogota»). `null` si no lo es: un valor de cookie lo
 * escribe el navegador, y un texto raro no puede llegar a `Intl` (que LANZA con una zona desconocida).
 */
export function zonaHoraria(valor: unknown): ZonaHoraria | null {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > 64) return null;
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(valor)) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: valor });
    return valor as ZonaHoraria;
  } catch {
    return null;
  }
}

/**
 * LA ZONA DEL NAVEGADOR, leída en el cliente. Solo para lo que se pinta DESPUÉS de hidratar (ver
 * `FechaLocal` del panel); lo que pinta el servidor usa la cookie (`lib/zona-espectador`).
 */
export function zonaDelNavegador(): ZonaHoraria | null {
  try {
    return zonaHoraria(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

/**
 * La MISMA lectura, como TEXTO de JavaScript, para el script en línea que guarda la zona en la cookie
 * (`lib/zona-espectador`): ese script corre antes que React y no puede importar nada. Vive aquí para
 * que `Intl` siga teniendo un solo sitio.
 */
export const EXPRESION_ZONA_NAVEGADOR = "Intl.DateTimeFormat().resolvedOptions().timeZone";

// ---------------------------------------------------------------------------------------------------
// Caché de formateadores
// ---------------------------------------------------------------------------------------------------

const numeros = new Map<string, Intl.NumberFormat>();
const fechas = new Map<string, Intl.DateTimeFormat>();

function formatoNumero(locale: string, opciones: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const k = `${locale}|${JSON.stringify(opciones)}`;
  let f = numeros.get(k);
  if (!f) {
    f = new Intl.NumberFormat(locale, opciones);
    numeros.set(k, f);
  }
  return f;
}

function formatoFecha(locale: string, opciones: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${locale}|${JSON.stringify(opciones)}`;
  let f = fechas.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opciones);
    fechas.set(k, f);
  }
  return f;
}

// ---------------------------------------------------------------------------------------------------
// Números e importes
// ---------------------------------------------------------------------------------------------------

/** Un número corriente: un saldo de puntos, un recuento («1234», «12.345» en español). */
export function formatearNumero(n: number, idioma: Idioma): string {
  return formatoNumero(LOCALE[idioma]).format(n);
}

/** Con un número FIJO de decimales («12,5»). */
export function formatearDecimal(n: number, idioma: Idioma, decimales: number): string {
  return formatoNumero(LOCALE[idioma], {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}

/** El MARCADOR: votos, podio, puestos, cifras de perfil. Agrupa siempre («1,234»). Ver cabecera. */
export function formatearMarcador(n: number, idioma: Idioma): string {
  return formatoNumero(LOCALE_MARCADOR[idioma]).format(n);
}

/**
 * Un importe en CÉNTIMOS, con su moneda («$1,250.00»). La moneda es un dato del importe (todo es USD
 * hoy, `DEFAULT_CURRENCY`); el idioma, de quien mira.
 */
export function formatearImporte(centimos: number, idioma: Idioma, moneda = "USD"): string {
  return formatoNumero(LOCALE_IMPORTE[idioma], { style: "currency", currency: moneda }).format(
    centimos / 100,
  );
}

/** El importe en PARTES (símbolo, entero, decimales), para la primitiva que las pinta a tamaños distintos. */
export function partesDeImporte(
  centimos: number,
  idioma: Idioma,
  moneda = "USD",
): Intl.NumberFormatPart[] {
  return formatoNumero(LOCALE_IMPORTE[idioma], {
    style: "currency",
    currency: moneda,
  }).formatToParts(centimos / 100);
}

// ---------------------------------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------------------------------

/**
 * LOS ESTILOS DE FECHA, cerrados. Son los que ya usaba la app (el censo de la Fase 11 encontró nueve
 * combinaciones); uno nuevo se añade AQUÍ, con nombre, y no como un objeto de opciones suelto en una
 * pantalla.
 */
const ESTILOS = {
  /** «13/11/2026» (la forma por defecto de `toLocaleDateString`). */
  numerica: { day: "numeric", month: "numeric", year: "numeric" },
  /** «05/11/2026», con ceros. La del panel. */
  numericaFija: { day: "2-digit", month: "2-digit", year: "numeric" },
  /** «05/11/2026, 14:30». */
  numericaFijaHora: {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  /** «13 nov». */
  diaMes: { day: "numeric", month: "short" },
  /** «13 nov 2026». */
  diaMesAno: { day: "numeric", month: "short", year: "numeric" },
  /** «05 nov 2026» (el día con cero: las listas de movimientos, para que las columnas cuadren). */
  diaFijoMesAno: { day: "2-digit", month: "short", year: "numeric" },
  /** «13 nov 2026, 14:30». */
  diaMesAnoHora: {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  /** «05 nov». */
  diaFijoMes: { day: "2-digit", month: "short" },
  /** «05 nov, 14:30» (las colas del panel). */
  diaFijoMesHora: { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" },
  /** «05 nov 2026, 14:30». */
  diaFijoMesAnoHora: {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  /** «13 nov 2026» con el estilo «medium» del idioma. */
  medio: { dateStyle: "medium" },
  /** «13 nov 2026, 14:30» con los estilos «medium» y «short» del idioma. */
  medioHora: { dateStyle: "medium", timeStyle: "short" },
  /** «13/11/26». */
  corta: { dateStyle: "short" },
  /** «13/11/26, 14:30:05»: el aviso al admin, donde los segundos dicen si es el mismo evento. */
  cortaHoraSegundos: { dateStyle: "short", timeStyle: "medium" },
  /** «13 de noviembre». */
  diaMesLargo: { day: "numeric", month: "long" },
  /** «13 de noviembre de 2026». */
  diaMesLargoAno: { day: "numeric", month: "long", year: "numeric" },
  /** «05 de noviembre de 2026». */
  diaFijoMesLargoAno: { day: "2-digit", month: "long", year: "numeric" },
  /** «01:00» (24 h). */
  hora: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type EstiloFecha = keyof typeof ESTILOS;
/** Los estilos SIN hora: lo único que tiene sentido para una clave de día. */
/** Los estilos CON hora que tienen una versión sin ella (ver `estiloSinHora`). */
type EstiloConHora =
  | "cortaHoraSegundos"
  | "numericaFijaHora"
  | "diaMesAnoHora"
  | "diaFijoMesHora"
  | "diaFijoMesAnoHora"
  | "medioHora";
/** Los estilos SIN hora: lo único que tiene sentido para una clave de día. */
export type EstiloSoloFecha = Exclude<EstiloFecha, EstiloConHora | "hora">;
/** Lo que se le puede pedir a `formatearFechaParaQuienMira`: todo menos la hora SOLA, que sin zona
 *  no tiene nada que enseñar en su lugar. */
export type EstiloParaQuienMira = Exclude<EstiloFecha, "hora">;

const CON_HORA: ReadonlySet<EstiloFecha> = new Set<EstiloFecha>([
  "cortaHoraSegundos",
  "numericaFijaHora",
  "diaMesAnoHora",
  "diaFijoMesHora",
  "diaFijoMesAnoHora",
  "medioHora",
  "hora",
]);

export function estiloLlevaHora(estilo: EstiloFecha): boolean {
  return CON_HORA.has(estilo);
}

/**
 * EL MISMO ESTILO SIN LA HORA. Para cuando no se sabe la zona de quien mira: una fecha sin hora es
 * verdad en casi cualquier zona; una hora en una zona inventada no lo es nunca. EXHAUSTIVO a propósito:
 * un estilo con hora nuevo no compila hasta que se dice cuál es su versión sin ella.
 */
export function estiloSinHora(estilo: EstiloParaQuienMira): EstiloSoloFecha {
  switch (estilo) {
    case "cortaHoraSegundos":
      return "corta";
    case "numericaFijaHora":
      return "numericaFija";
    case "diaMesAnoHora":
      return "diaMesAno";
    case "diaFijoMesHora":
      return "diaFijoMes";
    case "diaFijoMesAnoHora":
      return "diaFijoMesAno";
    case "medioHora":
      return "medio";
    default:
      return estilo;
  }
}

type Instante = Date | number | string;
const aFecha = (i: Instante) => (i instanceof Date ? i : new Date(i));

/** UN INSTANTE (algo que pasó en un momento), en la zona y el idioma de quien mira. */
export function formatearFecha(
  instante: Instante,
  idioma: Idioma,
  zona: ZonaHoraria,
  estilo: EstiloFecha,
): string {
  return formatoFecha(LOCALE[idioma], { ...ESTILOS[estilo], timeZone: zona }).format(
    aFecha(instante),
  );
}

/**
 * UN INSTANTE PARA QUIEN MIRA, con la zona que se sepa de él (la cookie del navegador, ver
 * `lib/zona-espectador`). LA POLÍTICA CUANDO NO SE SABE vive AQUÍ y no repartida por las pantallas: la
 * HORA no se dice (una hora en una zona inventada es mentira) y queda la FECHA, que casi nunca cambia
 * entre zonas —solo cerca de la medianoche— y no se acompaña de «UTC», que a un usuario no le dice
 * nada. Con la zona, exactamente `formatearFecha`.
 */
export function formatearFechaParaQuienMira(
  instante: Instante,
  idioma: Idioma,
  zona: ZonaHoraria | null,
  estilo: EstiloParaQuienMira,
): string {
  return zona
    ? formatearFecha(instante, idioma, zona, estilo)
    : formatearFecha(instante, idioma, ZONA_UTC, estiloSinHora(estilo));
}

/**
 * UNA CLAVE DE DÍA UTC («2026-11-07», o el `Date` de las 00:00 UTC de ese día) como etiqueta de
 * calendario. SIN ZONA a propósito: ver la cabecera. Un estilo con hora no tiene sentido aquí.
 */
export function formatearDiaClave(
  dia: string | Date,
  idioma: Idioma,
  estilo: EstiloSoloFecha,
): string {
  const fecha = typeof dia === "string" ? new Date(`${dia.slice(0, 10)}T00:00:00.000Z`) : dia;
  return formatoFecha(LOCALE[idioma], { ...ESTILOS[estilo], timeZone: "UTC" }).format(fecha);
}

/**
 * LAS CIFRAS de un instante en una zona: año, mes, día, hora y minuto, como números. Para CALCULAR (a
 * qué hora local empieza un día, si cae en el anterior, qué fecha es en Madrid), no para pintar.
 */
export function componentesEnZona(
  instante: Instante,
  zona: ZonaHoraria,
): { ano: number; mes: number; dia: number; hora: number; minuto: number } {
  const partes = formatoFecha("en-US", {
    timeZone: zona,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(aFecha(instante));
  const v = (t: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === t)?.value ?? "0");
  return { ano: v("year"), mes: v("month"), dia: v("day"), hora: v("hour"), minuto: v("minute") };
}

/**
 * A QUÉ HORA LOCAL se reinician los contadores diarios (Boost, toques): las 00:00 UTC del día que viene,
 * en la zona de quien mira («01:00» en Madrid en invierno, «19:00» en Bogotá). Se calcula sobre el
 * PRÓXIMO reinicio, así que respeta el horario de verano. El día se sigue CALCULANDO en UTC: esto
 * solo cambia cómo se DICE.
 */
export function horaDelReinicioDiario(ahora: Date, idioma: Idioma, zona: ZonaHoraria): string {
  const proximo = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1);
  return formatearFecha(proximo, idioma, zona, "hora");
}
