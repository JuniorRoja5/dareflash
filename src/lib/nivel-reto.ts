/**
 * LA PUERTA DE NIVEL DE UN RETO — pura, y la MISMA para el botón y para el servidor.
 *
 * Un reto declara qué nivel hace falta para participar (`Challenge.nivelMinimo`). La regla es
 * MÍNIMO, NO EXACTO: un Legend entra en un reto de Pro; un Rookie no. Escrito como "alcanza o
 * supera" y no como una lista de niveles admitidos, porque la escalera ya tiene orden (`tier`) y dos
 * formas de decir lo mismo acaban discrepando justo en el nivel de arriba.
 *
 * SE COMPARA POR `tier`, NO POR PUNTOS. El reto guarda la CLAVE del nivel, así que "de Pro" sigue
 * siendo Pro aunque el umbral de Pro cambie; comparar `puntos >= minimoDelNivel` habría convertido el
 * reto en otra cosa el día que se moviera un umbral.
 *
 * ESTO NO ES LA SEGURIDAD. Es una regla compartida: la pantalla la usa para pintar el candado y el
 * servidor para rechazar. La autoridad es el servidor, que la aplica sobre el `pointsBalance` de la
 * fila, nunca sobre lo que diga el cliente.
 */
import { NIVELES, nivelPorPuntos, type ClaveNivel, type Nivel } from "@/lib/niveles";

/** Sin restricción. Es `rookie` porque rookie empieza en 0 puntos: lo alcanza todo el mundo. */
export const NIVEL_MINIMO_ABIERTO: ClaveNivel = "rookie";

/** ¿Es una clave de nivel de verdad? Lo que venga de la BD o de un formulario pasa por aquí. */
export function esClaveNivel(v: unknown): v is ClaveNivel {
  return typeof v === "string" && NIVELES.some((n) => n.clave === v);
}

/**
 * El nivel de una clave. Una clave desconocida cae a `rookie` —o sea, a "sin restricción"— y no a un
 * nivel alto: si un día la BD tuviera un valor que este código no entiende, el fallo seguro es dejar
 * participar, no vetar a todo el mundo de un reto con premio.
 */
export function nivelDeClave(clave: string): Nivel {
  return NIVELES.find((n) => n.clave === clave) ?? NIVELES[0]!;
}

/** Un reto sin restricción real: nadie queda fuera, así que la pantalla no pinta candado. */
export function retoAbiertoATodos(nivelMinimo: string): boolean {
  return nivelDeClave(nivelMinimo).tier <= nivelDeClave(NIVEL_MINIMO_ABIERTO).tier;
}

/**
 * ¿Alcanza este usuario el nivel que pide el reto? MÍNIMO, no exacto.
 *
 * `puntos` es el `pointsBalance` de la fila del usuario. No se acepta un nivel ya calculado por quien
 * llama: derivarlo aquí es lo que garantiza que el botón y el servidor respondan lo mismo.
 */
export function puedeParticiparPorNivel(puntos: number, nivelMinimo: string): boolean {
  return nivelPorPuntos(puntos).tier >= nivelDeClave(nivelMinimo).tier;
}

/**
 * El COPY del veto, construido con el nombre del nivel. Vive aquí, al lado de la regla, porque
 * depende de los nombres de `niveles.ts`: en `constants.ts` sería una segunda lista de nombres
 * esperando a desincronizarse de la escalera.
 */
export function mensajeNivelInsuficiente(nivelMinimo: string): string {
  return `Necesitas ser ${nivelDeClave(nivelMinimo).nombre} para participar en este reto.`;
}
