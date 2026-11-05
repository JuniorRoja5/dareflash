/**
 * EL CORREO «YA TIENES CUENTA» — lo que hace VERDAD la pantalla de un registro con un correo que ya
 * existía.
 *
 * ┌─ POR QUÉ EXISTE (lo encontró Junior en producción) ────────────────────────────────────────────┐
 * │ Registró una empresa con un correo que ya era cuenta. El servidor hizo lo previsto —no-op      │
 * │ silencioso, sin enumeración— y la pantalla le dijo que le habíamos enviado un enlace. No le    │
 * │ habíamos enviado NADA: ni fila, ni job, ni correo. La regla que se rompió es la de arriba de   │
 * │ todo: ninguna pantalla afirma algo que el servidor no sabe que es verdad.                       │
 * │                                                                                                 │
 * │ La salida no es decir «ese correo ya existe» —eso es el oráculo de direcciones que el registro │
 * │ evita—. Es que la frase de la pantalla sea cierta en los DOS casos: siempre se manda un         │
 * │ mensaje a esa dirección. Si es nueva, la verificación; si ya tenía cuenta, este. Quien lo lee  │
 * │ es el DUEÑO de la dirección, que es el único que tiene derecho a saber que existe la cuenta.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TOPE: UNO POR CUENTA, MOTIVO Y DÍA (UTC), por la clave de idempotencia. Sin él, el formulario de
 * registro serviría para bombardear el buzón de cualquiera que tenga cuenta: bastaría con escribir
 * su correo una y otra vez. Con la clave, el segundo intento del día es un no-op en la base de
 * datos (la UNIQUE de `Job.idempotencyKey`), no un `if`. Encima sigue estando el rate-limit por
 * dirección del registro (`REGISTER_PER_EMAIL`).
 *
 * LA CLAVE LLEVA EL `id` DE LA CUENTA, no el correo: es un identificador interno, no un dato
 * personal —igual que `empresa-pendiente:{empresaId}`—, así que no hace falta derivar un HMAC ni
 * pasar el secreto hasta aquí.
 *
 * TIEMPO: este camino hace una consulta y un INSERT; el de una cuenta nueva, varios INSERT. Las dos
 * cosas son milisegundos frente al argon2 (~180 ms) que se paga SIEMPRE y antes de mirar la base de
 * datos, así que no reabre el oráculo por tiempo. Lo vigilan los tests de tiempo de los dos altas.
 */
import "server-only";

import type { Db } from "@/server/db/types";
import type { EmailMessage } from "@/server/email/adapter";
import { renderCorreoHtml } from "@/server/email/plantilla";
import { enqueueEmail } from "@/server/email/send";

/** Desde qué alta llegó el intento: cambia la explicación y a dónde se le manda. */
export type MotivoCuentaExistente = "REGISTRO" | "EMPRESA";

/** UNA por cuenta, motivo y día UTC. Ver el docblock del módulo. */
export function claveCuentaExistente(
  motivo: MotivoCuentaExistente,
  userId: string,
  ahora: Date,
): string {
  return `cuenta-existente:${motivo}:${userId}:${ahora.toISOString().slice(0, 10)}`;
}

/**
 * El correo, en sus variantes. El texto de EMPRESA sobre una cuenta de participante es el que se
 * decidió, palabra por palabra.
 *
 * LA TERCERA VARIANTE NO ESTABA EN EL ENCARGO y hace falta: si el correo YA ES de una empresa —lo
 * primero que hace una empresa que no recuerda haberse registrado es repetir el alta—, decirle «para
 * registrar una empresa, usa otro correo» la empujaría a crear una SEGUNDA empresa con otra
 * dirección. Lo cierto, y lo útil, es mandarla a entrar con la que ya tiene.
 */
export function correoCuentaExistente(
  motivo: MotivoCuentaExistente,
  email: string,
  appUrl: string,
  yaEsEmpresa = false,
): EmailMessage {
  if (motivo === "EMPRESA" && yaEsEmpresa) {
    const entrar = new URL("/entrar", appUrl).toString();
    const lineas = [
      "Alguien ha intentado registrar una empresa con tu correo.",
      "Este correo ya es de una cuenta de empresa en DareFlash: entra con ella para ver cómo va tu empresa.",
      "Si no has sido tú, puedes ignorar este mensaje.",
    ];
    return {
      to: email,
      subject: "Ya tienes una cuenta de empresa en DareFlash",
      text: [...lineas, "", `Entrar: ${entrar}`].join("\n"),
      html: renderCorreoHtml({
        preheader: "Alguien ha intentado registrar una empresa con tu correo.",
        titulo: "Ya tienes una cuenta de empresa",
        intro: `${lineas[0]} ${lineas[1]}`,
        cta: { texto: "Entrar", href: entrar },
        notas: [lineas[2]!],
      }),
    };
  }

  if (motivo === "EMPRESA") {
    const otra = new URL("/empezar/empresa", appUrl).toString();
    const lineas = [
      "Alguien ha intentado registrar una empresa con tu correo.",
      "Ya tienes una cuenta en DareFlash. Para registrar una empresa, usa otro correo.",
      "Si no has sido tú, puedes ignorar este mensaje.",
    ];
    return {
      to: email,
      subject: "Ya tienes una cuenta en DareFlash",
      text: [...lineas, "", `Registrar una empresa con otro correo: ${otra}`].join("\n"),
      html: renderCorreoHtml({
        preheader: "Alguien ha intentado registrar una empresa con tu correo.",
        titulo: "Ya tienes una cuenta",
        intro: `${lineas[0]} ${lineas[1]}`,
        cta: { texto: "Registrar con otro correo", href: otra },
        notas: [lineas[2]!],
      }),
    };
  }

  const recuperar = new URL("/recuperar", appUrl).toString();
  const lineas = [
    "Alguien ha intentado crear una cuenta en DareFlash con tu correo.",
    "Ya tienes una cuenta con esta dirección: entra con ella. Si no recuerdas la contraseña, puedes recuperarla.",
    "Si no has sido tú, puedes ignorar este mensaje.",
  ];
  return {
    to: email,
    subject: "Ya tienes una cuenta en DareFlash",
    text: [...lineas, "", `Recuperar la contraseña: ${recuperar}`].join("\n"),
    html: renderCorreoHtml({
      preheader: "Alguien ha intentado crear una cuenta con tu correo.",
      titulo: "Ya tienes una cuenta",
      intro: `${lineas[0]} ${lineas[1]}`,
      cta: { texto: "Recuperar la contraseña", href: recuperar },
      notas: [lineas[2]!],
    }),
  };
}

/**
 * Avisa al DUEÑO de `email` de que alguien intentó registrarse con su dirección. Se llama desde el
 * camino de la colisión de email de cada alta, FUERA de cualquier transacción (la del alta ya ha
 * revertido).
 *
 * Si la cuenta no aparece —carrera con un borrado entre el choque y esta consulta— no hace nada:
 * no hay a quién avisar, y el borrado ya deja la dirección libre para el siguiente intento.
 */
export async function avisarCuentaExistente(
  db: Db,
  entrada: { email: string; motivo: MotivoCuentaExistente; appUrl: string; ahora: Date },
): Promise<void> {
  const cuenta = await db.user.findUnique({
    where: { email: entrada.email },
    select: { id: true, esCuentaEmpresa: true },
  });
  if (!cuenta) return;

  await enqueueEmail(
    db,
    correoCuentaExistente(entrada.motivo, entrada.email, entrada.appUrl, cuenta.esCuentaEmpresa),
    {
      idempotencyKey: claveCuentaExistente(entrada.motivo, cuenta.id, entrada.ahora),
      runAt: entrada.ahora,
    },
  );
}
