/**
 * LAS REGLAS DE UNA CUENTA DE EMPRESA — puras, sin React y sin servidor.
 *
 * Son dos preguntas, y las dos se hacen desde varios sitios:
 *
 *  1. ¿QUÉ PUEDE COMPRAR este negocio? El formulario lo necesita para no ofrecer lo que va a
 *     rechazarse, y la ruta lo necesita para rechazarlo de verdad. Si cada uno lo resolviera a su
 *     manera, el día que cambie el catálogo uno de los dos se quedaría atrás — y sería el servidor,
 *     porque el formulario se ve y la ruta no.
 *  2. ¿QUÉ PUEDE HACER con el estado que tiene? Entrar al portal y escribir en él NO son la misma
 *     puerta: una empresa pendiente entra (a ver cómo va lo suyo) y no escribe; una suspendida entra
 *     y tampoco escribe. Que sean dos funciones y no un booleano es lo que permite que una
 *     suspensión no se lea como pérdida de datos.
 *
 * El CATÁLOGO (qué alcance por tipo de negocio) vive en `config/constants`; aquí vive la REGLA que
 * lo aplica. Misma separación que `BENEFICIOS_VIP` y `lib/vip`.
 */
import {
  ALCANCES_POR_NEGOCIO,
  type AlcancePublicidad,
  type EspacioPublicidad,
  type EstadoEmpresa,
  ETIQUETA_TIPO_NEGOCIO,
  type TipoNegocio,
  VALORES_TIPO_NEGOCIO,
} from "@/config/constants";
import { esUnoDe } from "@/lib/valores";

/**
 * LEE EL TIPO DE NEGOCIO GUARDADO. La columna es un `String`: un valor fuera del catálogo da `null`, y
 * quien lee DECIDE qué hacer (frase pública, un aviso, un «sin clasificar»). Sustituye al
 * `as TipoNegocio`, que se lo creía todo: con un valor raro, `ALCANCES_POR_NEGOCIO[x]` era `undefined`
 * y lo primero que lo tocaba —la frase del correo de verificación— lanzaba DENTRO de la transacción y
 * deshacía la verificación entera por culpa de una frase.
 */
export function tipoNegocioDe(valor: string): TipoNegocio | null {
  return esUnoDe(VALORES_TIPO_NEGOCIO, valor) ? valor : null;
}

/** Cómo se llama el tipo de negocio en pantalla; uno fuera del catálogo se dice, no se inventa. */
export function etiquetaTipoNegocio(tipo: TipoNegocio | null): string {
  return tipo ? ETIQUETA_TIPO_NEGOCIO[tipo] : "Tipo de negocio sin clasificar";
}

/** Los alcances que este negocio puede comprar. Nunca vacío: todo tipo compra algo. */
export function alcancesPermitidos(tipoNegocio: TipoNegocio): readonly AlcancePublicidad[] {
  return ALCANCES_POR_NEGOCIO[tipoNegocio];
}

/**
 * ¿Puede este negocio comprar ESTE alcance? La pregunta que hace la ruta antes de crear una
 * campaña (P6) y la que hace el formulario para pintar las opciones (misma respuesta, un solo sitio).
 */
export function puedeComprarAlcance(tipoNegocio: TipoNegocio, alcance: AlcancePublicidad): boolean {
  return alcancesPermitidos(tipoNegocio).includes(alcance);
}

/**
 * EL ESPACIO AL QUE PERTENECE UN ALCANCE. Se DERIVA, no se guarda: una columna `espacio` junto a
 * `alcance` podría contradecirla, y entonces habría dos verdades sobre dónde sale un anuncio.
 */
export function espacioDeAlcance(alcance: AlcancePublicidad): EspacioPublicidad {
  return alcance === "CIUDAD" || alcance === "ESTADO" ? "LOCAL" : "GLOBAL";
}

/** El espacio en el que compra un negocio. Es uno solo: ver el test de que el catálogo no los mezcla. */
export function espacioDeNegocio(tipoNegocio: TipoNegocio): EspacioPublicidad {
  // El `!` es seguro: el catálogo no tiene listas vacías y hay un test que lo exige.
  return espacioDeAlcance(alcancesPermitidos(tipoNegocio)[0]!);
}

/**
 * AQUÍ HUBO UN `puedeEntrarAlPortal(estado)` y se ha quitado. Devolvía `true` siempre e ignoraba su
 * argumento, que es la forma más rápida de que alguien lo "arregle" metiendo una condición. La regla
 * —entrar al portal se puede con cualquier estado, porque su pantalla es donde se le cuenta qué pasa
 * con su solicitud— vive donde se aplica: `requireEmpresa` no filtra por estado, y su docblock dice
 * por qué. Una función que no decide nada no es una regla, es un sitio donde esconderla.
 */

/**
 * ¿PUEDE OPERAR (crear, gastar, publicar)? Solo VERIFICADA.
 *
 * Es la lista BLANCA a propósito, no "todas menos las malas": un estado nuevo que se añada mañana
 * entra sin permiso de escritura hasta que alguien decida lo contrario, que es el fallo seguro.
 */
export function puedeOperarEmpresa(estado: EstadoEmpresa): boolean {
  return estado === "VERIFICADA";
}

/** Las decisiones del panel sobre una empresa. */
export type AccionEmpresa = "VERIFICAR" | "RECHAZAR";

/**
 * DESDE QUÉ ESTADOS TIENE EFECTO CADA DECISIÓN (Fase 9 · P4). Fuente ÚNICA: la usan el SERVIDOR
 * (`verificarEmpresa` y `rechazarEmpresa` no hacen nada fuera de aquí) y la FICHA del panel (que solo
 * ofrece los botones que harían algo). Así un botón nunca promete un cambio que el servidor no va a
 * hacer, y el día que cambie una regla cambian los dos a la vez.
 *
 *  - VERIFICAR: desde todo lo que no está verificado (pendiente, rechazada, suspendida).
 *  - RECHAZAR: desde todo lo que no está rechazado (pendiente, verificada, suspendida). Una rechazada
 *    NO se vuelve a rechazar: cambiar el motivo de un rechazo era una segunda decisión con aspecto de
 *    repetición; si hace falta, se verifica y se vuelve a rechazar, y cada paso queda en `AuditLog`.
 *
 * Lista BLANCA por estado, como `puedeOperarEmpresa`: un estado nuevo no admite ninguna decisión hasta
 * que alguien la escriba aquí.
 */
const TRANSICIONES: Record<EstadoEmpresa, readonly AccionEmpresa[]> = {
  PENDIENTE: ["VERIFICAR", "RECHAZAR"],
  VERIFICADA: ["RECHAZAR"],
  RECHAZADA: ["VERIFICAR"],
  SUSPENDIDA: ["VERIFICAR", "RECHAZAR"],
};

/** ¿Tiene efecto esta decisión sobre una empresa en este estado? */
export function puedeDecidirEmpresa(estado: EstadoEmpresa, accion: AccionEmpresa): boolean {
  return TRANSICIONES[estado]?.includes(accion) ?? false;
}
