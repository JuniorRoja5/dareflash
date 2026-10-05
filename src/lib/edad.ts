/**
 * EDAD DECLARADA (puro). La puerta de 18+ del registro.
 *
 * ┌─ LO QUE ESTO **NO** ES ─────────────────────────────────────────────────────────────────────┐
 * │ No es verificación de edad y no autoriza a cobrar nada. Es una fecha que ESCRIBE EL USUARIO  │
 * │ para poder usar el producto, igual que un "confirmo que soy mayor de edad": nadie ha visto   │
 * │ un documento. La verificación de verdad —con documento, contra una identidad— la hace        │
 * │ Stripe Connect cuando alguien va a RECLAMAR un premio, y es otra puerta, en otro momento y   │
 * │ con otras consecuencias. Que esta esté pasada no significa nada sobre aquella.               │
 * │                                                                                              │
 * │ Por eso aquí no hay ninguna función que se llame `verificado` ni nada que devuelva "puede    │
 * │ cobrar": lo que no existe no se puede llamar por error desde el sitio equivocado.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TODO EN UTC, como el resto del producto. Una fecha de nacimiento es un DÍA, no un instante: si se
 * compara con husos distintos, alguien nacido el 1 de enero cumple años un día antes o después
 * según desde dónde mire, y en la frontera de los 18 eso decide si entra o no.
 */
import { EDAD_MIN_USO } from "@/config/constants";

/** Nadie vivo ha nacido antes de esto. Una fecha más vieja es un error de tecleo, no una persona. */
export const EDAD_MAX_PLAUSIBLE = 120;

/**
 * Años cumplidos de quien nació en `nacimiento`, el día `hoy` (PURO, en UTC).
 *
 * Cumplir años es alcanzar el MISMO día y mes: el día del cumpleaños ya cuentas la edad nueva. Se
 * compara (mes, día) y no milisegundos, que es lo que hace que los años bisiestos salgan solos —
 * quien nació un 29 de febrero cumple el 1 de marzo en los años que no lo tienen, porque el 28 de
 * febrero todavía no ha alcanzado su (mes, día).
 */
export function edadEn(nacimiento: Date, hoy: Date): number {
  let edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear();
  const mes = hoy.getUTCMonth() - nacimiento.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoy.getUTCDate() < nacimiento.getUTCDate())) edad -= 1;
  return edad;
}

/**
 * ¿Declara la edad mínima para usar el producto? El umbral sale de `EDAD_MIN_USO` y de ningún otro
 * sitio: mover ese número tiene que mover la frontera en todas partes a la vez, tests incluidos.
 *
 * El día que cumples 18 YA entras: la comparación es `>=`, no `>`.
 */
export function declaraEdadMinima(nacimiento: Date, hoy: Date): boolean {
  return edadEn(nacimiento, hoy) >= EDAD_MIN_USO;
}

/**
 * Lee una fecha de nacimiento `AAAA-MM-DD` y devuelve el día en UTC, o `null` si no vale.
 *
 * SE RECHAZA LO IMPOSIBLE, no solo lo mal escrito: una fecha en el futuro, o de hace más de
 * `EDAD_MAX_PLAUSIBLE` años, no es la fecha de nadie. Y se comprueba que la fecha EXISTE — "2026-02-30"
 * tiene la forma correcta y `new Date` la convierte calladamente en el 2 de marzo, que es un dato
 * distinto del que escribió la persona.
 *
 * Nunca lanza: quien llama decide qué decirle al usuario.
 */
export function leerFechaNacimiento(crudo: unknown, hoy: Date): Date | null {
  if (typeof crudo !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(crudo);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  // El viaje de ida y vuelta caza los días que no existen: el 30 de febrero vuelve como 2 de marzo.
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null;
  }
  if (fecha.getTime() > hoy.getTime()) return null;
  if (edadEn(fecha, hoy) > EDAD_MAX_PLAUSIBLE) return null;
  return fecha;
}
