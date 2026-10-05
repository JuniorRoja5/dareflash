/**
 * ¿TOCA OCULTAR ESTO POR DENUNCIAS? La decisión, sola y sin base de datos.
 *
 * Está aquí fuera a propósito: es la regla que convierte "tres personas se han quejado" en "esto
 * desaparece de la vista sin que ningún humano lo haya mirado", y una regla así no puede vivir
 * dentro de un `if` en mitad de un servicio donde nadie la pueda atar.
 *
 * ┌─ UNA SOLA DIRECCIÓN ────────────────────────────────────────────────────────────────────────┐
 * │ Esto dice CUÁNDO OCULTAR. No existe —ni puede existir— una función hermana que diga cuándo   │
 * │ des-ocultar: levantar el velo es SIEMPRE una decisión humana (el "descartar" del moderador). │
 * │                                                                                              │
 * │ Y no es una preferencia de diseño: un des-ocultado automático podría deshacer una RETIRADA   │
 * │ que un moderador decidió a mano, en silencio y sin que nada fallara. Por eso el ocultado     │
 * │ automático tiene su propio estado, separado del de moderación, y por eso aquí solo hay una   │
 * │ función y mira en una dirección.                                                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUÉ "DENUNCIAS ABIERTAS" ES LO MISMO QUE "PERSONAS DISTINTAS": `Report` tiene un `@@unique`
 * por (denunciante, objeto), así que una persona no puede contar dos veces por el mismo contenido.
 * Contar filas ES contar personas. Y la ingesta ya exige correo verificado, así que las tres son
 * cuentas verificadas distintas — que es lo que hace que el umbral no sea un arma entre rivales.
 */
import { DENUNCIAS_PARA_OCULTAR, INMUNIDAD_TRAS_DESCARTE_MS } from "@/config/constants";

/** Lo que hace falta saber para decidir. Nada de ids, ni de quién denunció. */
export interface EstadoDenuncias {
  /** Denuncias ABIERTAS del objeto, ya contadas. Las descartadas no están aquí. */
  abiertas: number;
  /** ¿Ya estaba oculto por este mismo mecanismo? */
  yaOculto: boolean;
  /** Cuándo un moderador descartó denuncias de este objeto por última vez, o `null` si nunca. */
  descartadoEn?: Date | null;
  /** Ahora. Se pasa en vez de leerlo para que la inmunidad se pueda probar en sus dos bordes. */
  ahora?: Date;
}

/**
 * ¿Está el objeto dentro del plazo en que un moderador ya lo absolvió? (PURO)
 *
 * El borde es `>=`: el día que vence la inmunidad, vence. Un objeto sin descarte previo nunca es
 * inmune, y una fecha futura —que no debería existir— se trata como inmune, que es el lado
 * prudente: ante un dato raro, no escondemos solos.
 */
export function estaInmune(descartadoEn: Date | null | undefined, ahora: Date): boolean {
  if (!descartadoEn) return false;
  return ahora.getTime() - descartadoEn.getTime() < INMUNIDAD_TRAS_DESCARTE_MS;
}

/**
 * ¿Hay que ocultar AHORA? Solo en el CRUCE: la denuncia que alcanza el umbral lo devuelve `true`,
 * y la cuarta, la quinta y las que vengan devuelven `false` porque ya está oculto.
 *
 * Esa es toda la idempotencia del mecanismo, y vive aquí: quien llama no tiene que acordarse de
 * comprobar si ya lo hizo, porque la respuesta a "¿lo hago?" ya lo tiene en cuenta.
 */
export function cruzaUmbralOculto(estado: EstadoDenuncias): boolean {
  if (estado.yaOculto) return false;
  // LO QUE UN HUMANO YA ABSOLVIÓ NO LO VUELVE A ESCONDER UNA MÁQUINA, al menos mientras el juicio
  // esté fresco. Las denuncias nuevas se siguen registrando y el objeto vuelve a la cola: lo que
  // se suspende es el automatismo, no la revisión.
  if (estaInmune(estado.descartadoEn, estado.ahora ?? new Date())) return false;
  return estado.abiertas >= DENUNCIAS_PARA_OCULTAR;
}
