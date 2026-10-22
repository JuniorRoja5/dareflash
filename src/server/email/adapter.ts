/**
 * Abstraccion de envio de email con ADAPTADORES intercambiables.
 *
 *  - Adaptador de CONSOLA (desarrollo): "inbox" local en la consola. No necesita
 *    credenciales reales. Es el UNICO sitio donde el enlace de verificacion aparece
 *    en texto: no hay correo de verdad en dev y el desarrollador necesita el enlace.
 *    NUNCA se usa en produccion.
 *  - Adaptador SMTP (produccion): servidor de correo propio via nodemailer.
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

/** La configuración SMTP mínima para poder enviar. Nombrada UNA vez: la usan el adaptador y el
 *  arranque del worker, y tienen que coincidir o el aviso del arranque mentiría. */
export interface ConfigSmtpParcial {
  SMTP_HOST?: string | undefined;
  SMTP_PORT?: number | undefined;
  SMTP_USER?: string | undefined;
  SMTP_PASSWORD?: string | undefined;
  EMAIL_FROM?: string | undefined;
}

/**
 * QUÉ VARIABLES FALTAN, POR SU NOMBRE. Devuelve la lista vacía si está todo.
 *
 * ┌─ POR QUÉ IMPORTA EL NOMBRE ─────────────────────────────────────────────────────────────────┐
 * │ Antes el error decía "faltan variables SMTP_* / EMAIL_FROM", que obliga a quien lo lee a ir  │
 * │ a mirar las cinco. Un fallo de configuración tiene que decir EXACTAMENTE qué poner: es la    │
 * │ diferencia entre arreglarlo en un minuto y entrar al servidor a adivinar.                     │
 * │                                                                                               │
 * │ LA CONTRASEÑA SE LLAMA `SMTP_PASSWORD` (no `SMTP_PASS`), que es el nombre que YA está en el   │
 * │ `.env` del servidor. Renombrarla en el código sin tocar el servidor deja el correo muerto el  │
 * │ día del despliegue y con un error que dice que falta una variable que nadie ha visto nunca.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function variablesSmtpQueFaltan(cfg: ConfigSmtpParcial): string[] {
  const faltan: string[] = [];
  if (!cfg.SMTP_HOST) faltan.push("SMTP_HOST");
  if (!cfg.SMTP_PORT) faltan.push("SMTP_PORT");
  if (!cfg.SMTP_USER) faltan.push("SMTP_USER");
  if (!cfg.SMTP_PASSWORD) faltan.push("SMTP_PASSWORD");
  if (!cfg.EMAIL_FROM) faltan.push("EMAIL_FROM");
  return faltan;
}

/** El mensaje, en un sitio: el del envío fallido y el del arranque dicen lo mismo. */
export function mensajeSmtpIncompleto(faltan: string[]): string {
  return (
    `SMTP no configurado: falta ${faltan.join(", ")} en el .env del servidor. ` +
    `Ponla(s) y reinicia el worker; mientras tanto, ningún correo sale.`
  );
}

/** La configuración, ya completa y con los tipos estrechados, o la lista de lo que falta. */
export type ConfigSmtp =
  | {
      ok: true;
      host: string;
      port: number;
      user: string;
      password: string;
      from: string;
    }
  | { ok: false; faltan: string[] };

export function leerConfigSmtp(cfg: ConfigSmtpParcial): ConfigSmtp {
  const faltan = variablesSmtpQueFaltan(cfg);
  if (faltan.length > 0) return { ok: false, faltan };
  return {
    ok: true,
    host: cfg.SMTP_HOST!,
    port: cfg.SMTP_PORT!,
    user: cfg.SMTP_USER!,
    password: cfg.SMTP_PASSWORD!,
    from: cfg.EMAIL_FROM!,
  };
}

export function createSmtpEmailAdapter(): EmailAdapter {
  return {
    name: "smtp",
    async send(message) {
      const { env } = await import("@/config/env");
      const cfg = leerConfigSmtp(env);
      if (!cfg.ok) {
        // El error VA AL LOG del worker con el NOMBRE dentro (el runner lo registra al marcar el
        // job como fallido): no es un 500 mudo ni un "algo falló al enviar".
        throw new Error(mensajeSmtpIncompleto(cfg.faltan));
      }
      // EMAIL_FROM debe COINCIDIR con la cuenta autenticada (SMTP_USER): el servidor comprueba
      // la correspondencia (X-Authenticated-Sender) y, si no cuadra, rechaza o rompe el SPF.
      if (cfg.from !== cfg.user) {
        throw new Error(
          `EMAIL_FROM (${cfg.from}) debe coincidir con SMTP_USER (${cfg.user}): el ` +
            `servidor rechaza si el remitente no es la cuenta autenticada.`,
        );
      }
      if (!smtpTransport) {
        const nodemailer = await import("nodemailer");
        smtpTransport = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          // HELO/EHLO con nuestro dominio: sin `name`, nodemailer usa el hostname del contenedor
          // (127.0.0.1) y algunos filtros penalizan ese "helo=[127.0.0.1]". Mejora la entregabilidad.
          //
          // `SMTP_HELO_NAME` tiene DEFAULT en el esquema (no es opcional-sin-valor) justamente por
          // esto: si se dejara sin default y el `.env` del servidor no la trajera, el transporte
          // volvería a anunciar el hostname del contenedor y nada fallaría — se vería meses
          // después, en la carpeta de spam de otra gente.
          name: env.SMTP_HELO_NAME,
          secure: cfg.port === 465, // 465 = TLS directo; 587 = STARTTLS
          requireTLS: cfg.port !== 465, // 587: STARTTLS OBLIGATORIO, nunca texto plano
          // TLS: la verificacion del certificado queda SIEMPRE activada (rejectUnauthorized
          // por defecto = true). Por esta conexion viajan credenciales; NO desactivarla jamas.
          // Si la verificacion de nombre falla, se arregla el CERTIFICADO del servidor (que cubra
          // el host de SMTP_HOST), NUNCA el cliente: desactivarla abre la puerta a un
          // intermediario que robe las credenciales.
          // Timeouts PROPIOS del transporte, por DEBAJO del JOB_TIMEOUT_MS del worker (60 s): asi
          // un servidor colgado ABORTA el envio de verdad (no se queda en vuelo), y el timeout
          // del worker queda solo como red de seguridad.
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
          socketTimeout: 30_000,
          auth: { user: cfg.user, pass: cfg.password },
        });
      }
      await smtpTransport.sendMail({
        from: cfg.from,
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
