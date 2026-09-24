/**
 * CÓDIGO DE REFERIDO auto-generado. `User.referralCode` es ESTRUCTURALMENTE obligatorio (columna NOT
 * NULL y UNIQUE): cada vía de creación de `User` DEBE asignar uno. Aquí vive el generador —único
 * punto—, exactamente por el mismo motivo que `handle.ts`: hoy hay dos altas (registro propio y el
 * bootstrap del admin) y mañana habrá una tercera (OAuth), y las tres tienen que usar ESTE.
 *
 * NEUTRAL: no se deriva del handle, del email ni del id. El código viaja en un enlace público y
 * acabará pegado en redes; derivarlo de un dato de la cuenta convertiría ese enlace en una filtración.
 * Alfabeto base32 sin caracteres confusos, el mismo que el handle y el `publicCode` de los retos.
 *
 * LA UNICIDAD la garantiza la constraint de la BD; ante colisión, quien crea REGENERA y reintenta
 * (nunca `findUnique`-luego-`create`, que es una carrera).
 */
import { randomBytes } from "node:crypto";

import { codigoBase32, CODIGO_BASE32_ALFABETO } from "@/lib/codigo-base32";

/**
 * Longitud del código: 12. 32^12 ≈ 1.15e18, así que adivinar uno a lo bruto no lleva a ninguna
 * cuenta y el reintento por colisión es una red que casi nunca se usa.
 *
 * DOCE Y NO DIEZ por el RELLENO de la migración: las cuentas que ya existían reciben su código
 * derivado del hash de su id (en SQL no hay forma razonable de generar base32 aleatorio por fila), y
 * a 12 caracteres hexadecimales el espacio es 16^12 ≈ 2.8e14 — suficiente para que el UNIQUE no
 * choque. Igualando la longitud, los códigos viejos y los nuevos tienen EL MISMO formato y una sola
 * expresión regular los valida a los dos.
 */
export const REFERIDO_LEN = 12;

/** Reintentos acotados ante colisión del UNIQUE antes de rendirse (fallo real, no bucle infinito). */
export const REFERIDO_MAX_INTENTOS = 5;

/**
 * Forma canónica de un código. Lo que llegue por la URL se valida contra esto ANTES de ir a la BD.
 * El alfabeto se TOMA de la primitiva compartida, no se reescribe: copiarlo aquí sería una segunda
 * lista que se desincroniza el día que se añada o quite un carácter.
 */
export const REFERIDO_RE = new RegExp(`^[${CODIGO_BASE32_ALFABETO}]{${REFERIDO_LEN}}$`);

/** Genera un código aleatorio válido (impura: `randomBytes`). Cada llamada es un candidato nuevo. */
export function generarCodigoReferido(): string {
  return codigoBase32(randomBytes(REFERIDO_LEN), REFERIDO_LEN);
}

/**
 * ¿Es un código con la forma esperada? Se usa para descartar basura de la URL sin consultar la BD:
 * un `?ref=` con 400 caracteres o con comillas no llega ni a tocar la base.
 *
 * NO dice si existe: eso lo decide la consulta, y un código con forma válida que no existe se trata
 * como "sin referente", no como un error — el alta no se bloquea porque alguien manipule el enlace.
 */
export function esCodigoReferidoValido(v: unknown): v is string {
  return typeof v === "string" && REFERIDO_RE.test(v);
}
