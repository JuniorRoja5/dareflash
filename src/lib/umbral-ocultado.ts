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
import { DENUNCIAS_PARA_OCULTAR } from "@/config/constants";

/** Lo que hace falta saber para decidir. Nada más: ni ids, ni fechas, ni quién denunció. */
export interface EstadoDenuncias {
  /** Denuncias ABIERTAS del objeto, ya contadas. Las descartadas no están aquí. */
  abiertas: number;
  /** ¿Ya estaba oculto por este mismo mecanismo? */
  yaOculto: boolean;
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
  return estado.abiertas >= DENUNCIAS_PARA_OCULTAR;
}
