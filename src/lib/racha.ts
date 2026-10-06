/**
 * RACHA DE DÍAS ACTIVOS (puro). Cuántos días seguidos llevas haciendo algo que cuenta.
 *
 * ┌─ LA RACHA SE CALCULA, NO SE DISPARA ─────────────────────────────────────────────────────────┐
 * │ No hay ningún barrido nocturno que recorra usuarios rompiendo rachas. La racha es una FUNCIÓN │
 * │ de dos fechas guardadas y del día de hoy: si tu último día activo no es hoy ni ayer, vale     │
 * │ cero, y nadie ha tenido que tocar nada para que así sea.                                      │
 * │                                                                                               │
 * │ Es la doctrina de siempre —el estado visible se calcula— y aquí además es lo barato: un job   │
 * │ que cada noche mirase a todo el mundo para apagar rachas sería caro, frágil y, si se perdiera │
 * │ una ejecución, dejaría rachas vivas que ya no existen.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LA LONGITUD NO SE GUARDA, SE DERIVA de (inicio, último): son días consecutivos por definición,
 * así que su número es la distancia entre los dos extremos. Guardarla además sería un tercer dato
 * que puede contradecir a los otros dos.
 *
 * ┌─ EL DÍA ES UTC, Y ESO TIENE UN COSTE QUE SE ACEPTA ──────────────────────────────────────────┐
 * │ El corte es la medianoche UTC. Para alguien en UTC+10 eso parte su día a media tarde: puede   │
 * │ entrar el lunes por la noche y el martes por la mañana (su lunes y su martes) y que para      │
 * │ nosotros sean el MISMO día UTC — o al revés, perder una racha habiendo estado los dos días    │
 * │ suyos.                                                                                        │
 * │                                                                                               │
 * │ Se acepta para la v1 a sabiendas: la versión justa es el día en la zona de cada persona, que  │
 * │ obliga a conocerla y a guardarla, y una racha es una función indulgente — no es dinero. Esto  │
 * │ está escrito aquí para que quien lo lea sepa que fue una DECISIÓN y no un descuido.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { RACHA_DIAS_PREMIO } from "@/config/constants";

const DIA_MS = 24 * 60 * 60 * 1000;

/** El DÍA de un instante, en UTC: medianoche del día al que pertenece. */
export function diaUTC(cuando: Date): Date {
  return new Date(Date.UTC(cuando.getUTCFullYear(), cuando.getUTCMonth(), cuando.getUTCDate()));
}

/** Cuántos días enteros hay de `a` a `b`. Negativo si `b` es anterior. */
export function diasEntre(a: Date, b: Date): number {
  return Math.round((diaUTC(b).getTime() - diaUTC(a).getTime()) / DIA_MS);
}

/** Lo que se guarda de la racha de alguien. `null` en quien nunca ha hecho nada que cuente. */
export interface EstadoRacha {
  /** Día en que empezó la racha viva. */
  inicio: Date | null;
  /** Último día en que hizo algo que cuenta. */
  ultimo: Date | null;
}

/**
 * La racha a día de HOY, en días (PURO).
 *
 * SIGUE VIVA SI EL ÚLTIMO DÍA FUE AYER: todavía no se ha roto — queda el día de hoy entero para
 * continuarla. Contarla como cero desde la medianoche sería cortarla antes de tiempo y castigar a
 * quien aún está a tiempo. A partir de dos días sin actividad, cero.
 */
export function rachaActual(estado: EstadoRacha, hoy: Date): number {
  if (!estado.inicio || !estado.ultimo) return 0;
  const desdeElUltimo = diasEntre(estado.ultimo, hoy);
  // Negativo = el último día está en el futuro. No debería pasar; si pasa, no se inventa una racha.
  if (desdeElUltimo < 0 || desdeElUltimo > 1) return 0;
  const largo = diasEntre(estado.inicio, estado.ultimo) + 1;
  return largo > 0 ? largo : 0;
}

/**
 * El estado DESPUÉS de hacer hoy algo que cuenta (PURO).
 *
 * DEVUELVE EL MISMO OBJETO SI YA ESTABA MARCADO HOY, y eso no es una optimización: es lo que hace
 * que la acción número 50 del día no escriba en `User` otra vez. Sin ello, cada like de una tarde
 * sería una escritura más en la tabla más caliente del producto.
 *
 * Tres casos y nada más: ya marcado (no-op), venía de ayer (la racha continúa), o cualquier otra
 * cosa —primera vez, o rota— y la racha empieza hoy.
 */
export function siguienteDiaActivo(estado: EstadoRacha, hoy: Date): EstadoRacha {
  const dia = diaUTC(hoy);
  if (estado.ultimo && diasEntre(estado.ultimo, dia) === 0) return estado;
  const continua = estado.inicio && estado.ultimo && diasEntre(estado.ultimo, dia) === 1;
  return { inicio: continua ? estado.inicio : dia, ultimo: dia };
}

/** ¿Cambia algo marcar hoy? Es decir: ¿hay que escribir? */
export function cambiaAlMarcar(estado: EstadoRacha, hoy: Date): boolean {
  return siguienteDiaActivo(estado, hoy) !== estado;
}

/**
 * ¿Esta racha ha alcanzado el premio? El umbral sale de `RACHA_DIAS_PREMIO`.
 *
 * SE PAGA UNA VEZ POR RACHA, no una vez en la vida ni cada siete días: quien encadena treinta días
 * cobra una vez (al llegar al séptimo), y quien la pierde y la reconstruye vuelve a cobrar. Premia
 * la constancia sostenida sin que entrar y salir sea una forma de farmear. Lo garantiza la clave
 * de idempotencia, derivada del DÍA DE INICIO de la racha: mientras sea la misma racha, la clave
 * es la misma y el segundo intento es un no-op.
 */
export function rachaPremiada(estado: EstadoRacha, hoy: Date): boolean {
  return rachaActual(estado, hoy) >= RACHA_DIAS_PREMIO;
}

/** `AAAA-MM-DD` de un día en UTC. La mitad de la clave de idempotencia del premio. */
export function claveDia(dia: Date): string {
  return diaUTC(dia).toISOString().slice(0, 10);
}
