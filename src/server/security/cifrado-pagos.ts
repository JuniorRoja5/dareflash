import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

import { env } from "@/config/env";

/**
 * CIFRADO DE LOS DATOS DE PAGO (AES-256-GCM).
 *
 * Un IBAN o una dirección de cripto en claro en la base de datos es una fuga con nombre y apellidos:
 * basta una copia de seguridad perdida o un `SELECT` de más. Aquí se guardan cifrados y solo se
 * descifran en el punto donde hacen falta de verdad — el panel del admin que hace la transferencia.
 *
 * ┌─ SECRETO PROPIO, NO `AUTH_SECRET` ────────────────────────────────────────────────────────────┐
 * │ Podría derivarse de `AUTH_SECRET` como las subclaves de CSRF o de IP, y sería más cómodo. No  │
 * │ se hace a propósito: rotar `AUTH_SECRET` —cerrar todas las sesiones, algo que puede tocar     │
 * │ hacer un martes cualquiera— dejaría los datos de pago ILEGIBLES para siempre. Son dos cosas   │
 * │ con vidas distintas y radios de daño distintos, así que llevan secretos distintos.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ FALLA CERRADA ───────────────────────────────────────────────────────────────────────────────┐
 * │ `PAGOS_SECRET` es OPCIONAL en `env` —tiene que serlo: el build corre sin ninguna variable—,   │
 * │ así que la comprobación va aquí, al usarlo. Sin secreto no se cifra: se LANZA. La alternativa │
 * │ —guardar el dato en claro "mientras tanto"— es exactamente la fuga que esto evita, y además   │
 * │ silenciosa. Que la solicitud falle es ruidoso, y lo ruidoso se arregla.                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * FORMATO VERSIONADO `v1:iv:tag:dato` (las tres partes en base64url). La versión va delante para
 * poder rotar algún día sin adivinar qué hay guardado: un valor viejo se sigue reconociendo por su
 * prefijo. Hoy solo existe `v1`.
 */

/** Prefijo de versión. Cambia SOLO si cambia el algoritmo o la derivación de la clave. */
const VERSION = "v1";

/** El dominio de la subclave, para que este secreto no se reutilice tal cual. */
const DOMINIO = "pagos.v1";

class SinSecretoDePagos extends Error {
  constructor() {
    super(
      "PAGOS_SECRET no está configurado: no se pueden cifrar los datos de pago, así que no se guardan.",
    );
    this.name = "SinSecretoDePagos";
  }
}

/** La clave de 32 bytes. Se deriva del secreto para no usar el valor crudo del entorno. */
function clave(): Buffer {
  const secreto = env.PAGOS_SECRET;
  if (!secreto) throw new SinSecretoDePagos();
  return createHmac("sha256", secreto).update(DOMINIO).digest();
}

/** ¿Está el sistema en condiciones de aceptar datos de pago? Para decirlo ANTES de pedirlos. */
export function cifradoDePagosDisponible(): boolean {
  return Boolean(env.PAGOS_SECRET);
}

/**
 * Cifra un dato de pago. Devuelve la cadena que va a la columna, nunca el original.
 *
 * El IV es ALEATORIO en cada llamada y eso no es opcional con GCM: repetir un IV con la misma clave
 * rompe el cifrado entero, no solo ese mensaje. Por eso se genera aquí y no se pasa desde fuera.
 */
export function cifrarDatoDePago(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const dato = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    dato.toString("base64url"),
  ].join(":");
}

/**
 * Descifra un dato de pago. SOLO desde el camino del admin que procesa el pago.
 *
 * Si el valor fue manipulado, GCM lo detecta al comprobar la etiqueta y esto LANZA. Es la diferencia
 * entre cifrar y cifrar con autenticación: aquí no se puede cambiar un dígito de un IBAN guardado y
 * que salga otro IBAN válido al leerlo.
 */
export function descifrarDatoDePago(guardado: string): string {
  const partes = guardado.split(":");
  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new Error(`Dato de pago con formato desconocido (${partes[0] ?? "vacío"}).`);
  }
  const [, iv, tag, dato] = partes as [string, string, string, string];
  const d = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dato, "base64url")), d.final()]).toString("utf8");
}

/**
 * La PISTA que sí se puede enseñar: los últimos caracteres del destino. Sirve para que el usuario
 * reconozca su propia retirada ("…4321") sin que nadie descifre nada para pintar una lista.
 *
 * Se queda en CUATRO. Con más, una dirección de cripto acabaría identificando la cartera entera por
 * acumulación de pistas; con menos, no distingue dos cuentas de la misma persona.
 */
export function pistaDeDestino(destino: string): string {
  const limpio = destino.replace(/\s+/g, "");
  return limpio.slice(-4);
}
