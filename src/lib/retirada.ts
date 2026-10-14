import {
  MetodoRetiradaSchema,
  RedCriptoSchema,
  RETIRADA_MINIMA_CENTS,
  type MetodoRetirada,
  type RedCripto,
} from "@/config/constants";

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

export type DestinoRetirada =
  | { metodo: "BANK"; iban: string; titular: string }
  | { metodo: "CRYPTO"; direccion: string; red: RedCripto };

export type RechazoDestino =
  | "METODO_DESCONOCIDO"
  | "IBAN_INVALIDO"
  | "TITULAR_VACIO"
  | "RED_NO_SOPORTADA"
  | "DIRECCION_INVALIDA"
  | "DIRECCION_NO_ES_DE_LA_RED";

/** IBAN: dos letras de país, dos dígitos de control y hasta 30 alfanuméricos. Sin espacios. */
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
/** TRON: base58 empezando por T, 34 caracteres. */
const DIR_TRC20 = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
/** Ethereum: 0x y 40 hex. */
const DIR_ERC20 = /^0x[0-9a-fA-F]{40}$/;

/**
 * Valida el destino del cobro. Es la puerta que impide el fallo más caro de toda la pieza.
 *
 * ┌─ LA RED NO SE DEDUCE DE LA DIRECCIÓN: SE EXIGE Y SE CONTRASTA ────────────────────────────────┐
 * │ Un envío de cripto es IRREVERSIBLE. Mandar USDT por TRON a una dirección de Ethereum es       │
 * │ dinero que desaparece, sin soporte que valga y sin vuelta atrás. Por eso la red se elige      │
 * │ aparte Y se comprueba que la dirección es de ESA red: no basta con que la dirección "parezca  │
 * │ válida", porque una dirección de Ethereum es perfectamente válida… en Ethereum.               │
 * │                                                                                               │
 * │ Y por eso la lista es cerrada: una red que DareFlash no envía no se acepta aunque la          │
 * │ dirección esté bien escrita. La persona se adapta a las redes de la casa, no al revés.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function validarDestino(
  destino: DestinoRetirada,
): { ok: true } | { ok: false; motivo: RechazoDestino } {
  if (!MetodoRetiradaSchema.safeParse(destino.metodo).success) {
    return { ok: false, motivo: "METODO_DESCONOCIDO" };
  }

  if (destino.metodo === "BANK") {
    if (destino.titular.trim().length < 2) return { ok: false, motivo: "TITULAR_VACIO" };
    if (!IBAN.test(destino.iban.replace(/\s+/g, "").toUpperCase())) {
      return { ok: false, motivo: "IBAN_INVALIDO" };
    }
    return { ok: true };
  }

  if (!RedCriptoSchema.safeParse(destino.red).success) {
    return { ok: false, motivo: "RED_NO_SOPORTADA" };
  }
  const dir = destino.direccion.trim();
  if (dir.length === 0) return { ok: false, motivo: "DIRECCION_INVALIDA" };
  const patron = destino.red === "TRC20" ? DIR_TRC20 : DIR_ERC20;
  // La dirección es válida PARA SU RED, no "válida" a secas: es la comprobación que salva el dinero.
  if (!patron.test(dir)) return { ok: false, motivo: "DIRECCION_NO_ES_DE_LA_RED" };
  return { ok: true };
}

/** El texto que se cifra: todo lo que hace falta para pagar, y nada más. */
export function serializarDestino(destino: DestinoRetirada): string {
  return destino.metodo === "BANK"
    ? JSON.stringify({
        iban: destino.iban.replace(/\s+/g, "").toUpperCase(),
        titular: destino.titular.trim(),
      })
    : JSON.stringify({ direccion: destino.direccion.trim(), red: destino.red });
}

/** Lo que se enseña sin descifrar nada: los últimos caracteres del destino. */
export function colaDelDestino(destino: DestinoRetirada): string {
  return destino.metodo === "BANK" ? destino.iban.replace(/\s+/g, "") : destino.direccion.trim();
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

/**
 * ¿Esta transición DEVUELVE el dinero? Solo una: rechazar. Las demás no mueven saldo porque el
 * dinero ya salió al solicitar — aprobar o marcar "en proceso" son anotaciones de lo que el admin
 * está haciendo por fuera, no movimientos.
 */
export function devuelveDinero(hasta: EstadoRetirada): boolean {
  return hasta === "REJECTED";
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
