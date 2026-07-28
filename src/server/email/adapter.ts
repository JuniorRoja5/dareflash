/**
 * Abstraccion de envio de email con ADAPTADORES intercambiables.
 *
 *  - Adaptador de CONSOLA (desarrollo): "inbox" local en la consola. No necesita
 *    credenciales reales. Es el UNICO sitio donde el enlace de verificacion aparece
 *    en texto: no hay correo de verdad en dev y el desarrollador necesita el enlace.
 *    NUNCA se usa en produccion.
 *  - Adaptador SMTP (produccion): servidor de correo de Hostinger via nodemailer.
 *
 * Cambiar de proveedor (si la entregabilidad diera problemas) es cuestion de
 * configuracion, para eso sirve esta abstraccion.
 *
 * IMPORTANTE: el LOG operativo de la app nunca registra el cuerpo del correo ni el
 * token (ver `src/server/email/send.ts`). El adaptador de consola es la excepcion
 * consciente, y solo en desarrollo.
 */
import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailAdapter {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Adaptador de desarrollo: imprime el correo en la consola (inbox local). */
export const consoleEmailAdapter: EmailAdapter = {
  name: "console",
  async send(message) {
    // Solo en desarrollo. Aqui SI se ve el enlace/token: es el inbox del dev.
    console.info(
      [
        "",
        "──────────── [EMAIL dev] ────────────",
        `Para:    ${message.to}`,
        `Asunto:  ${message.subject}`,
        "",
        message.text,
        "─────────────────────────────────────",
        "",
      ].join("\n"),
    );
  },
};

/**
 * Adaptador SMTP (produccion). Lee las variables SMTP de forma perezosa (al primer
 * envio), para no exigirlas hasta que el envio real este conectado. Crea un unico
 * transporte reutilizable.
 */
let smtpTransport: import("nodemailer").Transporter | undefined;

export function createSmtpEmailAdapter(): EmailAdapter {
  return {
    name: "smtp",
    async send(message) {
      const { env } = await import("@/config/env");
      if (
        !env.SMTP_HOST ||
        !env.SMTP_PORT ||
        !env.SMTP_USER ||
        !env.SMTP_PASSWORD ||
        !env.EMAIL_FROM
      ) {
        throw new Error("SMTP no configurado: faltan variables SMTP_* / EMAIL_FROM.");
      }
      // EMAIL_FROM debe COINCIDIR con la cuenta autenticada (SMTP_USER): el servidor comprueba
      // la correspondencia (X-Authenticated-Sender) y, si no cuadra, rechaza o rompe el SPF.
      if (env.EMAIL_FROM !== env.SMTP_USER) {
        throw new Error(
          `EMAIL_FROM (${env.EMAIL_FROM}) debe coincidir con SMTP_USER (${env.SMTP_USER}): el ` +
            `servidor rechaza si el remitente no es la cuenta autenticada.`,
        );
      }
      if (!smtpTransport) {
        const nodemailer = await import("nodemailer");
        smtpTransport = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465, // 465 = TLS directo; 587 = STARTTLS
          requireTLS: env.SMTP_PORT !== 465, // 587: STARTTLS OBLIGATORIO, nunca texto plano
          // TLS: la verificacion del certificado queda SIEMPRE activada (rejectUnauthorized
          // por defecto = true). Por esta conexion viajan credenciales; NO desactivarla jamas.
          // Si la verificacion de nombre falla, se arregla el CERTIFICADO del servidor (AutoSSL
          // que cubra mail.dareflash.com), NUNCA el cliente: desactivarla abre la puerta a un
          // intermediario que robe las credenciales.
          // Timeouts PROPIOS del transporte, por DEBAJO del JOB_TIMEOUT_MS del worker (60 s): asi
          // un servidor colgado ABORTA el envio de verdad (no se queda en vuelo), y el timeout
          // del worker queda solo como red de seguridad.
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
          socketTimeout: 30_000,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
        });
      }
      await smtpTransport.sendMail({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      });
    },
  };
}

/** Elige el adaptador segun el entorno: consola en desarrollo, SMTP en el resto. */
export async function getEmailAdapter(): Promise<EmailAdapter> {
  const { env } = await import("@/config/env");
  return env.NODE_ENV === "development" ? consoleEmailAdapter : createSmtpEmailAdapter();
}
