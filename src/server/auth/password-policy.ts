import "server-only";

import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";

/**
 * POLÍTICA DE CONTRASEÑA (server-side, COMPARTIDA por registro y restablecer). El registro aceptaba
 * antes cualquier cadena de 8+ caracteres: "password", "12345678" o "dareflash2026" pasaban. Esto es
 * un GATE de fuerza real, no solo de longitud.
 *
 * Fuerza vía @zxcvbn-ts (librería LOCAL, sin red ni datos fuera, como sharp): estima cuántos intentos
 * costaría adivinarla teniendo en cuenta diccionarios, patrones de teclado, secuencias, repeticiones
 * y l33t. Se exige `score >= 3` (de 0 a 4). El diccionario común se carga UNA vez al importar.
 *
 * Además: mínimo 10 caracteres, y se rechaza si contiene la parte local del email (juan@x.com ->
 * fuera "juan...") o "dareflash" (lo primero que probaría alguien). Esas cadenas también se pasan a
 * zxcvbn como `userInputs` para que penalice sus variantes (juan1, dar3flash...).
 *
 * El cliente puede dar una pista de UX, pero el SERVIDOR es el único gate: nada entra sin pasar por
 * aquí. Los mensajes son HUMANOS (nunca score ni códigos).
 */
// Un único estimador (v4 es un factory): diccionario común + grafos de teclado, cargados al importar.
const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...zxcvbnCommon.dictionary },
  graphs: zxcvbnCommon.adjacencyGraphs,
  useLevenshteinDistance: true,
});

export const LONGITUD_MINIMA = 10;
const SCORE_MINIMO = 3; // 0..4; < 3 se considera adivinable
const MARCA = "dareflash";

const MENSAJE_DEBIL =
  "Esa contraseña es demasiado fácil de adivinar. Prueba una más larga o menos predecible.";
const MENSAJE_CORTA = `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`;

export type VeredictoPassword = { ok: true } | { ok: false; mensaje: string };

/** Parte local del email (antes de la @), en minúsculas. Solo si es lo bastante larga para que
 *  buscarla dentro de la contraseña tenga sentido (evita falsos positivos con locales de 1-3 letras). */
function localDeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0]?.trim().toLowerCase() ?? "";
  return local.length >= 4 ? local : null;
}

/**
 * Evalúa una contraseña contra la política. `email` es opcional pero recomendado (mejora la
 * detección de contraseñas ligadas a la identidad). Puro y testeable.
 */
export function evaluarPassword(input: {
  password: string;
  email?: string | null;
}): VeredictoPassword {
  const password = input.password;
  if (password.length < LONGITUD_MINIMA) return { ok: false, mensaje: MENSAJE_CORTA };

  const enMinus = password.toLowerCase();
  const local = localDeEmail(input.email);
  if (local && enMinus.includes(local)) return { ok: false, mensaje: MENSAJE_DEBIL };
  if (enMinus.includes(MARCA)) return { ok: false, mensaje: MENSAJE_DEBIL };

  const userInputs = [local, MARCA].filter((s): s is string => Boolean(s));
  const { score } = zxcvbn.check(password, userInputs);
  if (score < SCORE_MINIMO) return { ok: false, mensaje: MENSAJE_DEBIL };

  return { ok: true };
}
