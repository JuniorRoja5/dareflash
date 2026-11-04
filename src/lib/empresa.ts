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
  type TipoNegocio,
} from "@/config/constants";

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
