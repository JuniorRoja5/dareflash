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
export interface ContextoMensajeError {
  /** Copy para 400 (validacion), especifico de la pantalla. */
  validacion: string;
  /** Copy por defecto / codigo desconocido, especifico de la pantalla. */
  generico: string;
  /** Login: 401/INVALID_CREDENTIALS -> mismo mensaje que credencial mala (sin enumerar si el correo existe). */
  credenciales?: boolean;
}

/** Copy de la pantalla de INICIAR SESION (identico al que tenia formulario-login). */
export const MSG_LOGIN: ContextoMensajeError = {
  validacion: "Revisa el correo y la contraseña.",
  generico: "No se pudo iniciar sesión. Reintenta.",
  credenciales: true,
};

/** Copy de la pantalla de REGISTRO (identico al que tenia formulario-registro). */
export const MSG_REGISTRO: ContextoMensajeError = {
  validacion:
    "Revisa el correo, una contraseña de 10+ caracteres (larga y poco predecible) y que tengas al menos 16 años.",
  generico: "No se pudo crear la cuenta. Reintenta.",
};

/**
 * Mapea `(status, code)` a copy humano. Orden: primero los codigos compartidos (rate-limit, servicio
 * ocupado), luego —solo si el contexto lo pide— credenciales invalidas, luego validacion (400) y por
 * ultimo el generico. Un codigo desconocido cae SIEMPRE en el generico seguro del contexto.
 */
export function mensajeError(status: number, code: string, ctx: ContextoMensajeError): string {
  if (status === 429 || code === "RATE_LIMITED") return "Demasiados intentos, espera un momento.";
  if (status === 503 || code === "OVERLOADED")
    return "El servicio está ocupado. Reinténtalo en unos segundos.";
  if (ctx.credenciales && (status === 401 || code === "INVALID_CREDENTIALS")) {
    return "Correo o contraseña incorrectos.";
  }
  if (status === 400) return ctx.validacion;
  return ctx.generico;
}
