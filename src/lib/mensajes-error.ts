/**
 * Copy HUMANO de errores de API para las islas cliente. UNA sola fuente: `mensajeError` estaba
 * DUPLICADO (formulario-login y formulario-registro) con la misma estructura. Al usuario NUNCA le
 * llega un codigo crudo, un 401 ni un 500.
 *
 * Los codigos COMPARTIDos (429/RATE_LIMITED y 503/OVERLOADED) tienen el mismo mensaje en todas las
 * pantallas y viven aqui una sola vez. Lo que difiere entre pantallas es, a proposito, el copy de
 * VALIDACION (400) y el GENERICO: NO son "el mismo mensaje peor", son mensajes DISTINTOS por contexto
 * (el 400 de registro habla de edad y contrasena; mostrarlo en login seria incorrecto). Por eso se
 * pasan por `ContextoMensajeError` en vez de colapsarlos: se unifica la estructura sin regresar copy.
 */
/**
 * POR QUÉ FALLÓ UNA PETICIÓN, dicho como un MOTIVO (P5b3). Antes esto devolvía la frase, escrita aquí
 * para cada pantalla (`MSG_LOGIN`, `MSG_REGISTRO`…); ahora decide solo QUÉ pasó, y la frase la pone la
 * pantalla desde su espacio de textos (`fraseDeError`). La regla no cambia:
 *  - 429 / RATE_LIMITED → `limite`; 503 / OVERLOADED → `ocupado`;
 *  - en el login, 401 / INVALID_CREDENTIALS → `credenciales` (el mismo que una credencial mala: no se
 *    dice si el correo existe);
 *  - 400 → `validacion`; cualquier otra cosa → `generico`.
 */
export type MotivoError = "limite" | "ocupado" | "credenciales" | "validacion" | "generico";

export function motivoDeError(
  status: number,
  code: string,
  opciones: { credenciales?: boolean } = {},
): MotivoError {
  if (status === 429 || code === "RATE_LIMITED") return "limite";
  if (status === 503 || code === "OVERLOADED") return "ocupado";
  if (opciones.credenciales && (status === 401 || code === "INVALID_CREDENTIALS")) {
    return "credenciales";
  }
  if (status === 400) return "validacion";
  return "generico";
}

/** Las frases de una pantalla para cada motivo (las comunes vienen de `errorComun`). */
export type FrasesDeError = Record<Exclude<MotivoError, "credenciales">, string> & {
  credenciales?: string;
};

export function fraseDeError(motivo: MotivoError, frases: FrasesDeError): string {
  if (motivo === "credenciales") return frases.credenciales ?? frases.generico;
  return frases[motivo];
}
