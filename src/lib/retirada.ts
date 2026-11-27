import {
  AJUSTE_NOTA_MAX,
  AJUSTE_NOTA_MIN,
  MOTIVO_RECHAZO_LIBRE,
  RETIRADA_MINIMA_CENTS,
  type MetodoRetirada,
  type MotivoRechazo,
  VALORES_METODO_RETIRADA,
  VALORES_MOTIVO_RECHAZO,
} from "@/config/constants";
import { esUnoDe } from "@/lib/valores";

/**
 * LA RETIRADA, EN LO QUE NO TOCA NI BASE DE DATOS NI RED. Aquí vive lo que se puede equivocar sin
 * que nada falle: si un importe es pedible, si un destino es válido, y si una transición de estado
 * existe. Todo ello se prueba directamente, sin montar nada.
 *
 * NO VALIDA SALDO: eso solo se puede decidir con la fila del `User` bloqueada, y por tanto vive en
 * el servicio. Lo de aquí es la forma; lo de allí, el dinero.
 */

// ---------------------------------------------------------------------------
// EL IMPORTE
// ---------------------------------------------------------------------------

export type RechazoImporte = "BAJO_MINIMO" | "NO_ENTERO" | "SIN_SALDO";

/**
 * ¿Se puede pedir este importe con este saldo? Devuelve el motivo, no un booleano: quien llama tiene
 * que poder decirle a la persona QUÉ pasa, y "false" no se le puede enseñar a nadie.
 *
 * EL MÍNIMO SE COMPRUEBA ANTES QUE EL SALDO, y el orden importa para el copy: a quien tiene 20 € y
 * pide 20 € hay que decirle que el mínimo son 50 €, no que le falta saldo — lo segundo es falso y
 * además le haría intentarlo otra vez.
 */
export function evaluarImporte(
  importeCents: number,
  saldoCents: number,
): { ok: true } | { ok: false; motivo: RechazoImporte } {
  if (!Number.isInteger(importeCents)) return { ok: false, motivo: "NO_ENTERO" };
  if (importeCents < RETIRADA_MINIMA_CENTS) return { ok: false, motivo: "BAJO_MINIMO" };
  if (importeCents > saldoCents) return { ok: false, motivo: "SIN_SALDO" };
  return { ok: true };
}

/** ¿Tiene esta persona bastante para que la sección de cobro le sirva de algo? */
export function puedePedirCobro(saldoCents: number): boolean {
  return saldoCents >= RETIRADA_MINIMA_CENTS;
}

// ---------------------------------------------------------------------------
// EL DESTINO
// ---------------------------------------------------------------------------

/** El único destino: una cuenta bancaria (IBAN y su titular). Ver `VALORES_METODO_RETIRADA`. */
export type DestinoRetirada = { metodo: "BANK"; iban: string; titular: string };

export type RechazoDestino = "METODO_DESCONOCIDO" | "IBAN_INVALIDO" | "TITULAR_VACIO";

/** IBAN: dos letras de país, dos dígitos de control y hasta 30 alfanuméricos. Sin espacios. */
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

/**
 * Valida el destino del cobro. Es la puerta que impide guardar un IBAN que no puede recibir nada:
 * mal escrito aquí, el error se congela en todas las solicitudes futuras.
 *
 * El método se contrasta con el CATÁLOGO aunque el tipo diga que solo puede ser `BANK`: esta función
 * también corre con lo que llega por la red, y ahí el tipo no garantiza nada.
 */
export function validarDestino(
  destino: DestinoRetirada,
): { ok: true } | { ok: false; motivo: RechazoDestino } {
  if (!esUnoDe(VALORES_METODO_RETIRADA, destino.metodo)) {
    return { ok: false, motivo: "METODO_DESCONOCIDO" };
  }
  if (destino.titular.trim().length < 2) return { ok: false, motivo: "TITULAR_VACIO" };
  if (!IBAN.test(destino.iban.replace(/\s+/g, "").toUpperCase())) {
    return { ok: false, motivo: "IBAN_INVALIDO" };
  }
  return { ok: true };
}

/** El texto que se cifra: todo lo que hace falta para pagar, y nada más. */
export function serializarDestino(destino: DestinoRetirada): string {
  return JSON.stringify({
    iban: destino.iban.replace(/\s+/g, "").toUpperCase(),
    titular: destino.titular.trim(),
  });
}

/** Lo que se enseña sin descifrar nada: los últimos caracteres del IBAN. */
export function colaDelDestino(destino: DestinoRetirada): string {
  return destino.iban.replace(/\s+/g, "");
}

// ---------------------------------------------------------------------------
// LA MÁQUINA DE ESTADOS
// ---------------------------------------------------------------------------

export type EstadoRetirada = "PENDING" | "APPROVED" | "PROCESSING" | "PAID" | "REJECTED";

/**
 * A DÓNDE SE PUEDE IR DESDE CADA ESTADO. La tabla es la regla entera: lo que no está aquí, no pasa.
 *
 * `PAID` y `REJECTED` son FINALES y por eso su lista está vacía. Eso no es un detalle: un reembolso
 * sobre una retirada ya rechazada devolvería el dinero DOS veces, y "marcar como pagada" una ya
 * pagada invita a transferir otra vez. Los estados finales son finales porque cada uno ya movió
 * dinero (o lo devolvió) y repetirlo cuesta dinero de verdad.
 */
const TRANSICIONES: Record<EstadoRetirada, readonly EstadoRetirada[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["PROCESSING", "REJECTED"],
  PROCESSING: ["PAID"],
  PAID: [],
  REJECTED: [],
};

export function transicionValida(desde: EstadoRetirada, hasta: EstadoRetirada): boolean {
  return TRANSICIONES[desde]?.includes(hasta) ?? false;
}

/** Los destinos posibles desde un estado, para que el panel pinte SOLO los botones que existen. */
export function siguientesEstados(desde: EstadoRetirada): readonly EstadoRetirada[] {
  return TRANSICIONES[desde] ?? [];
}

/** Todos los estados que existen. Sale de la TABLA, así que uno nuevo entra aquí él solo. */
export const ESTADOS_RETIRADA = Object.keys(TRANSICIONES) as readonly EstadoRetirada[];

/**
 * ¿Es un estado FINAL? Se DERIVA de la tabla —final es "no se va a ninguna parte"— en vez de
 * enumerar `["PAID", "REJECTED"]` en un segundo sitio. Una segunda lista es una lista libre de
 * discrepar: el día que entre otro estado final, quien enumeró se queda corto SIN fallar, y lo que
 * se cuenta mal es dinero.
 */
export function esEstadoFinal(estado: EstadoRetirada): boolean {
  return siguientesEstados(estado).length === 0;
}

/**
 * Los estados VIVOS: dinero ya debitado del monedero que todavía no ha llegado a su destino. Es lo
 * que la plataforma tiene pendiente de pagar, y por eso se deriva en vez de escribirse.
 */
export const ESTADOS_RETIRADA_EN_CURSO: readonly EstadoRetirada[] = ESTADOS_RETIRADA.filter(
  (e) => !esEstadoFinal(e),
);

/**
 * ¿Esta transición DEVUELVE el dinero? Solo una: rechazar. Las demás no mueven saldo porque el
 * dinero ya salió al solicitar — aprobar o marcar "en proceso" son anotaciones de lo que el admin
 * está haciendo por fuera, no movimientos.
 */
export function devuelveDinero(hasta: EstadoRetirada): boolean {
  return hasta === "REJECTED";
}

// ---------------------------------------------------------------------------
// CÓMO SE CUENTA EL ESTADO (el chip y el recorrido)
// ---------------------------------------------------------------------------

/**
 * EL ESTADO, DICHO EN CASTELLANO, para el PANEL (que no se traduce). El monedero de la persona lo dice
 * desde el diccionario (`cobros.estado_*`, P5b2a), y un test exige que en castellano las dos tablas
 * digan exactamente lo mismo: la persona que escribe a soporte cita la palabra que ve, y el admin
 * tiene que ver esa misma.
 */
export const ETIQUETA_ESTADO: Record<EstadoRetirada, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aceptada",
  PROCESSING: "En proceso",
  PAID: "Pagada",
  REJECTED: "Rechazada",
};

/**
 * EL CAMINO FELIZ, DERIVADO DE LA TABLA y no escrito a mano: se arranca en el estado inicial y se
 * sigue el único sucesor que NO devuelve el dinero, hasta que no hay a dónde ir. Si mañana se mete
 * un paso entre medias ("en revisión manual"), el recorrido crece solo y el stepper lo pinta sin
 * que nadie se acuerde de venir aquí.
 */
export const CAMINO_RETIRADA: readonly EstadoRetirada[] = (() => {
  const camino: EstadoRetirada[] = ["PENDING"];
  for (;;) {
    const actual = camino[camino.length - 1]!;
    const siguiente = siguientesEstados(actual).find((e) => !devuelveDinero(e));
    // El corte por longitud es una red, no una regla: si alguien cerrara un ciclo en la tabla, esto
    // colgaría el render en vez de fallar, y un bucle infinito en una vista no se diagnostica.
    if (!siguiente || camino.includes(siguiente) || camino.length > ESTADOS_RETIRADA.length) break;
    camino.push(siguiente);
  }
  return camino;
})();

/** Cómo está un paso del recorrido: ya ocurrió, está ocurriendo, o no ha llegado. */
export type PasoRetirada = {
  /**
   * Su palabra la pone la vista (`cobros.evento_<estado>`, P5b2a): el EVENTO, no el estado. Un
   * recorrido nombra lo que pasó ("Pedida"), el chip nombra dónde está ("Pendiente").
   */
  estado: EstadoRetirada;
  situacion: "hecho" | "actual" | "pendiente";
};

/**
 * EL RECORRIDO DE UNA RETIRADA, para pintarlo.
 *
 * `null` CUANDO ESTÁ RECHAZADA, y es la parte que importa: una rechazada no avanzó por el camino, se
 * salió de él. Pintarle un stepper —aunque fuera con los pasos apagados— contaría un progreso que no
 * existe, que es justo lo que un recorrido no puede hacer. Quien lo pinte tiene que dar su propio
 * cierre: el dinero volvió al saldo.
 *
 * `progreso` es el porcentaje de camino RECORRIDO (0 en el primer paso, 100 en el último), para la
 * barra. Sale de la posición en el camino, no de un número por estado escrito a mano.
 */
export function pasosDe(
  estado: EstadoRetirada,
): { pasos: PasoRetirada[]; progreso: number } | null {
  const i = CAMINO_RETIRADA.indexOf(estado);
  if (i === -1) return null;
  // UN ESTADO FINAL NO TIENE PASO "EN CURSO": "Pagada" ya ocurrió. Se vio mirando la pantalla —el
  // último punto salía hueco, con su aro de "esto está pasando", sobre una retirada terminada— y
  // ningún test lo decía, porque lo que se afirmaba era "no queda nada pendiente", y era verdad.
  const final = esEstadoFinal(estado);
  const pasos = CAMINO_RETIRADA.map<PasoRetirada>((e, j) => ({
    estado: e,
    // El paso actual está "ocurriendo", no "hecho": "en proceso" no es "ya te lo hemos mandado".
    situacion: j < i || (j === i && final) ? "hecho" : j === i ? "actual" : "pendiente",
  }));
  const ultimo = CAMINO_RETIRADA.length - 1;
  return { pasos, progreso: ultimo === 0 ? 100 : Math.round((i / ultimo) * 100) };
}

// ---------------------------------------------------------------------------
// POR QUÉ SE RECHAZÓ
// ---------------------------------------------------------------------------

export type RechazoMotivo = "MOTIVO_OBLIGATORIO" | "TEXTO_OBLIGATORIO" | "TEXTO_SOBRA";

/**
 * ¿Es válido el motivo con el que se va a rechazar un cobro?
 *
 * LAS TRES REGLAS, y las tres existen por lo mismo —que la persona reciba una frase que signifique
 * algo—: el motivo es OBLIGATORIO (sin él volvemos al "porque sí"), `OTRO` EXIGE su texto (si no,
 * "Otro" a secas no dice nada), y una clave de la lista NO admite texto (si lo admitiera, el mismo
 * motivo se contaría de dos maneras y la frase buena dejaría de ser la que se enseña).
 */
export function validarMotivoRechazo(
  motivo: string | null | undefined,
  texto: string | null | undefined,
): { ok: true } | { ok: false; rechazo: RechazoMotivo } {
  if (!esUnoDe(VALORES_MOTIVO_RECHAZO, motivo)) {
    return { ok: false, rechazo: "MOTIVO_OBLIGATORIO" };
  }
  const limpio = (texto ?? "").trim();
  if (motivo === MOTIVO_RECHAZO_LIBRE) {
    return limpio.length >= AJUSTE_NOTA_MIN && limpio.length <= AJUSTE_NOTA_MAX
      ? { ok: true }
      : { ok: false, rechazo: "TEXTO_OBLIGATORIO" };
  }
  return limpio.length === 0 ? { ok: true } : { ok: false, rechazo: "TEXTO_SOBRA" };
}

/**
 * LO QUE SE LE DICE A LA PERSONA de un rechazo, como DATO (P5b3; antes `fraseDeRechazo` devolvía la
 * frase). La pone el copy, no la fila: la fila guarda la CLAVE, así que reescribir el texto reescribe
 * también los rechazos antiguos en vez de congelarlos. La frase la compone quien la pinta, en su idioma
 * (`cobros.rechazo_<MOTIVO>` del diccionario; el panel, `FRASE_RECHAZO`, y un test exige que digan lo
 * mismo).
 *
 * FAIL-OPEN, y es deliberado (mismo criterio que `nivelDeClave`), y sigue ocurriendo en UN sitio, aquí:
 * una clave que ya no existe —una renombrada sin migrar, una fila de antes de que esto existiera— sale
 * como `desconocido`, que tiene su frase genérica honesta, en lugar de dejar un hueco o reventar la
 * pantalla de alguien que no ha cobrado. Lo que viaja es SIEMPRE una de estas tres formas: nunca una
 * clave cruda de la fila. El texto libre del equipo (solo con el motivo libre) se enseña tal cual: lo
 * escribió una persona.
 */
export type RechazoParaMostrar =
  | { tipo: "texto"; texto: string }
  | { tipo: "motivo"; motivo: MotivoRechazo }
  | { tipo: "desconocido" };

export function rechazoParaMostrar(
  motivo: string | null | undefined,
  texto?: string | null,
): RechazoParaMostrar | null {
  if (!motivo) return null;
  // El texto solo manda cuando el motivo ES el libre: si una clave de la lista trajera texto (una
  // fila vieja, un arreglo a mano), se enseña su frase, que es la que está revisada.
  if (motivo === MOTIVO_RECHAZO_LIBRE) {
    const limpio = (texto ?? "").trim();
    if (limpio.length > 0) return { tipo: "texto", texto: limpio };
  }
  return esUnoDe(VALORES_MOTIVO_RECHAZO, motivo)
    ? { tipo: "motivo", motivo }
    : { tipo: "desconocido" };
}

/**
 * EL NOMBRE HUMANO DE UN MÉTODO DE COBRO, para el PANEL. El monedero lo dice desde el diccionario
 * (`nombreMetodo`, src/textos/cobros.ts, P5b2a) con el mismo criterio, y un test exige que en
 * castellano coincidan: es el mismo dato y se lee igual en las dos pantallas.
 *
 * FAIL-OPEN con un nombre genérico para un método que ya no está en el catálogo: la migración que
 * retiró la cripto no deja ninguno, pero una pantalla de dinero no revienta por una fila rara.
 */
export function nombreDeMetodo(m: { metodo: string }): string {
  return m.metodo === "BANK" ? "Cuenta bancaria" : "Método de cobro";
}

/** Clave de idempotencia de la SOLICITUD. Namespaced por usuario: ver `claveAjusteBoost`. */
export function claveRetirada(userId: string, clave: string): string {
  return `retirada:${userId}:${clave}`;
}

/** Clave del REEMBOLSO. Derivada de la retirada, así que rechazar dos veces devuelve una. */
export function claveReembolso(retiradaId: string): string {
  return `retirada:reembolso:${retiradaId}`;
}

export type { MetodoRetirada };
