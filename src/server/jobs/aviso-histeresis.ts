/**
 * AVISAR UNA VEZ AL CRUZAR, Y NO VOLVER A AVISAR HASTA QUE SE RE-ARME.
 *
 * ┌─ POR QUÉ ESTO VIVE APARTE ─────────────────────────────────────────────────────────────────────┐
 * │ La lógica nació dentro de `avisarSiFallidos` y se extrajo al añadir el aviso de CAPACIDAD, que │
 * │ la necesita igual. Las cuatro reglas son sutiles y equivocarse en cualquiera deja el aviso     │
 * │ inútil —o peor, ruidoso hasta que se deja de mirar—, así que se escriben UNA vez:              │
 * │                                                                                                 │
 * │  1. Se avisa al CRUZAR hacia arriba, no mientras se está arriba. Con el correo caído serían    │
 * │     cien correos idénticos en una hora.                                                        │
 * │  2. Al bajar se RE-ARMA, sin correo. Volver a cruzar vuelve a avisar: la segunda vez importa    │
 * │     tanto como la primera.                                                                      │
 * │  3. El estado vive en `SystemState` (base de datos), no en memoria: así SOBREVIVE al reinicio   │
 * │     del worker. En memoria, cada despliegue reavisaría.                                         │
 * │  4. Si el envío FALLA, NO se marca disparado. No salió ningún correo, así que no hay spam que   │
 * │     evitar y sí un aviso que entregar: se reintenta al ciclo siguiente.                         │
 * │                                                                                                 │
 * │ Y la quinta, que es una corrección de Junior y la más fácil de equivocar: SIN destinatario      │
 * │ tampoco se marca disparado. Un log repetido molesta; un silencio total es peligroso —se olvida  │
 * │ `ADMIN_EMAIL` en el servidor y el sistema de avisos queda muerto y callado para siempre—. Al    │
 * │ quedarse ARMADO, en cuanto se configure la variable el aviso sale sin esperar a que el valor    │
 * │ baje y vuelva a cruzar.                                                                         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { EmailAdapter, EmailMessage } from "@/server/email/adapter";
import { sanearError } from "@/server/observability/sanitize-error";
import { escribirEstado, leerEstado } from "@/server/services/system-state";

export const AVISO_ARMADO = "armado";
export const AVISO_DISPARADO = "disparado";

export interface EntradaAviso {
  /** Clave en `SystemState`. Una por aviso: dos avisos no pueden compartir histéresis. */
  clave: string;
  /** ¿Está el valor por encima del umbral AHORA? Lo decide quien llama; aquí solo se recuerda. */
  superado: boolean;
  /** El correo a enviar, solo se construye si de verdad toca enviarlo. */
  mensaje: () => EmailMessage;
  /** Qué escribir en el log cuando no hay destinatario. */
  sinDestinatario: string;
  /** Qué escribir cuando sí se envió. */
  enviado: string;
  adapter: EmailAdapter;
  adminEmail?: string;
  log?: (m: string) => void;
}

/** Devuelve si se envió el correo en ESTA llamada. */
export async function avisarConHisteresis(
  db: PrismaClient,
  entrada: EntradaAviso,
): Promise<boolean> {
  const log = entrada.log ?? (() => {});
  const estado = (await leerEstado(db, entrada.clave)) ?? AVISO_ARMADO;

  // Por DEBAJO del umbral: re-armar (sin correo) si estaba disparado.
  if (!entrada.superado) {
    if (estado === AVISO_DISPARADO) await escribirEstado(db, entrada.clave, AVISO_ARMADO);
    return false;
  }
  // Por encima y YA disparado: silencio.
  if (estado === AVISO_DISPARADO) return false;

  if (!entrada.adminEmail) {
    log(entrada.sinDestinatario);
    return false;
  }

  try {
    await entrada.adapter.send({ ...entrada.mensaje(), to: entrada.adminEmail });
  } catch (e) {
    // SMTP caído: no se marca disparado, se reintenta el ciclo siguiente.
    log(`[worker] AVISO no enviado (fallo el envio directo: ${sanearError(e)}); reintento luego.`);
    return false;
  }
  await escribirEstado(db, entrada.clave, AVISO_DISPARADO);
  log(entrada.enviado);
  return true;
}
