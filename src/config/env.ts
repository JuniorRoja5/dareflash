/**
 * Validacion de variables de entorno (fail-fast).
 *
 * REGLA DE ORO: nadie lee `process.env` fuera de este archivo.
 * Importa `env` desde aqui y usa el objeto tipado.
 *
 * CUANDO falla: en el ARRANQUE del servidor (ver `src/instrumentation.ts`),
 * NO en el build. Hostinger ejecuta `next build` sin ninguna variable
 * configurada; si la validacion se ejecutase al compilar, tumbaria el despliegue.
 * El criterio del documento de arquitectura es que la app *no arranque*,
 * no que *no compile*.
 *
 * `server-only` hace que este modulo reviente en COMPILACION si algun
 * componente de cliente intenta importarlo, para que ningun secreto acabe
 * en el bundle del navegador.
 *
 * ============================================================================
 * REGLA DE ACCESO (importante, rompe el despliegue si se incumple)
 * ============================================================================
 * `env` valida de forma PEREZOSA: la validacion ocurre al leer una propiedad,
 * no al importar el modulo. Y `next build` SI ejecuta codigo de pagina para
 * prerenderizar. Por tanto:
 *
 *   ✅ SE PUEDE leer `env` desde codigo de servidor que corre POR PETICION:
 *      route handlers, server actions, funciones de servicio (`src/server/**`).
 *
 *   ❌ NO se puede leer `env` en AMBITO DE MODULO de nada que cuelgue de
 *      `src/app/**`, ni en componentes o layouts que se prerendericen de forma
 *      estatica. Se evaluaria durante el build de Hostinger, que compila SIN
 *      ninguna variable configurada -> excepcion -> despliegue caido.
 *
 * Si una pagina necesita configuracion: o se accede dentro del ambito de la
 * peticion, o se marca esa ruta como dinamica de forma explicita y consciente.
 *
 * Esto lo vigila `npm run test:build-sin-env` (verificado: detecta una pagina
 * que lea `env` en ambito de modulo).
 * ============================================================================
 */
import "server-only";

import { z } from "zod";

/**
 * Variables de SERVIDOR (privadas). Nunca llegan al navegador.
 *
 * Solo se marca obligatorio lo que la fase actual usa de verdad. El esquema
 * crece con el proyecto: cada paso que introduzca una variable la promueve a
 * obligatoria y la anade al fichero de entorno del VPS en ese mismo paso. Marcar
 * algo como obligatorio antes de tiempo tumbaria el sitio ya desplegado sin motivo.
 */
const serverSchema = z.object({
  // --- Obligatorias HOY ---
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url("APP_URL debe ser una URL absoluta, p.ej. https://dareflash.com"),
  /** Paso 4 — base de datos. Ya configurada en el VPS (confirmado por el propietario). */
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL es obligatoria: cadena de conexion de MySQL/MariaDB"),

  /**
   * Paso 6 — secreto de servidor. OBLIGATORIO: se usa como clave HMAC del token CSRF
   * (acciones con efectos) Y del hash de IP del rate-limit. Sin el, ni el rate-limit
   * anonimiza la IP ni se puede proteger CSRF. `openssl rand -hex 32` (hex, sin `=`).
   * NO hay Google OAuth: registro solo email + contrasena.
   */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET es obligatoria (>=32 chars; openssl rand -hex 32)"),

  /**
   * Directorio PERSISTENTE donde se guardan los avatares (WebP). OPCIONAL con default: es una ruta de
   * CONTENEDOR, no un secreto, y no debe ser obligatoria (rompería el arranque sin aportar nada). En
   * prod es un volumen montado en `web` (escribe la app) y en `caddy` (lo sirve en /avatars/*). En
   * local, si se quiere probar la subida, se apunta a una carpeta escribible.
   */
  AVATARS_DIR: z.string().min(1).default("/srv/avatars"),

  // --- Se promueven a obligatorias en su paso (ver comentario de cada una) ---
  /** Paso 8 — cola de trabajos disparada por cron. */
  CRON_SECRET: z.string().min(1).optional(),
  /**
   * Bunny Stream (video). OBLIGATORIAS desde el paso de subida real: el servicio de
   * credenciales las necesita (la clave de API SOLO en servidor; nunca llega al cliente).
   * Deben estar en el fichero de entorno del VPS ANTES de desplegar esta rama, o el arranque
   * falla (validacion fail-fast en instrumentation). Stripe sigue opcional hasta su paso.
   */
  BUNNY_STREAM_LIBRARY_ID: z.string().min(1),
  BUNNY_STREAM_API_KEY: z.string().min(1),
  BUNNY_CDN_HOSTNAME: z.string().min(1),
  /**
   * Clave de TOKEN AUTHENTICATION de la pull-zone (firma las URLs de reproduccion). Es DISTINTA de
   * la API key (firmar con la API key da 403 en Bunny). Obligatoria: sin firma, la .m3u8 seria
   * publica/scrapeable. Debe estar en el .env del VPS ANTES de desplegar esta rama, o crash-loop.
   */
  BUNNY_TOKEN_AUTH_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  /**
   * Email por SMTP del servidor de correo de Hostinger (Paso 6). El envio pasa por
   * la cola. Se promueven a obligatorias cuando se conecte el envio real.
   */
  EMAIL_FROM: z.email().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  /**
   * Nombre HELO/EHLO que el cliente SMTP anuncia. Sin esto, nodemailer usa el hostname del contenedor
   * (127.0.0.1) -> "helo=[127.0.0.1]", que perjudica la entregabilidad. OPCIONAL con default (no es
   * secreto ni obligatorio; no rompe el arranque). Debe ser el dominio del remitente.
   */
  SMTP_HELO_NAME: z.string().min(1).default("dareflash.com"),
  /**
   * Correo del ADMIN para AVISOS operativos DIRECTOS (no por la cola): p.ej. acumulacion de
   * jobs en FAILED. Opcional hoy; sin ella el worker registra el aviso en el log (alto) en vez
   * de enviarlo. Se promueve a obligatoria cuando el aviso deba llegar si o si.
   */
  ADMIN_EMAIL: z.email().optional(),
  /** Observabilidad. */
  SENTRY_DSN: z.url().optional(),
  /**
   * Modo de la limpieza de HUERFANOS en Bunny (reconciliacion Parte B, DESTRUCTIVA). Por defecto
   * "dry-run": el barrido LOGuea que borraria pero NO borra nada. Junior lo pone a "borrar" en el
   * .env del VPS SOLO tras revisar los logs del dry-run. Ausente => dry-run => despliegue SEGURO.
   * NO es secreto (no hace falta hPanel para desplegar en modo seguro).
   */
  RECON_HUERFANOS_MODO: z.enum(["dry-run", "borrar"]).default("dry-run"),
  /**
   * Modo de la reconciliacion Parte C (PUBLICADOS desaparecidos). Por defecto "dry-run": LOGuea que
   * degradaria pero NO muta. Junior lo pone a "actuar" tras revisar los logs del dry-run. INDEPENDIENTE
   * de RECON_HUERFANOS_MODO. Ausente => dry-run => despliegue SEGURO. No es secreto (no pide hPanel).
   */
  RECON_PUBLICADOS_MODO: z.enum(["dry-run", "actuar"]).default("dry-run"),
});

/**
 * Variables PUBLICAS (`NEXT_PUBLIC_*`). Next las **inlinea en el bundle del
 * navegador**, asi que aqui NUNCA va un secreto.
 *
 * Ahora mismo no hay ninguna. Se mantiene separado a proposito.
 *
 * NOTA para cuando aparezca la primera: este modulo es `server-only`, asi que
 * un componente de cliente no puede importarlo. La variable publica habra que
 * exponerla ademas desde un modulo sin `server-only`, referenciandola de forma
 * literal (`process.env.NEXT_PUBLIC_X`), porque Next solo sustituye accesos
 * estaticos, no dinamicos.
 */
const clientSchema = z.object({});

/**
 * Esquema efectivo: servidor + publicas. Se fusionan (en vez de intersecar los
 * tipos) porque un `z.object({})` vacio infiere `Record<string, never>` y al
 * intersectarlo colapsaria el tipo resultante a `never`.
 */
const envSchema = serverSchema.extend(clientSchema.shape);

export type Env = z.infer<typeof envSchema>;

/** Error dedicado, para distinguirlo de cualquier otro fallo de arranque. */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const key = issue.path.join(".") || "(raiz)";
    const falta = issue.code === "invalid_type" && issue.message.includes("undefined");
    return `  - ${key}: ${falta ? "FALTA (obligatoria y no esta definida)" : issue.message}`;
  });
}

let cache: Env | undefined;

/**
 * Valida `process.env` y devuelve el objeto tipado. Memoiza el resultado.
 * Lanza `EnvValidationError` con el detalle de lo que falta.
 */
export function validateEnv(): Env {
  if (cache) return cache;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const detalle = formatIssues(parsed.error).join("\n");

    throw new EnvValidationError(
      [
        "Configuracion de entorno invalida. La aplicacion NO puede arrancar.",
        "",
        detalle,
        "",
        "Define esas variables en tu `.env` local (plantilla en `.env.example`)",
        "o, en produccion, en el fichero de entorno del VPS (~/dareflash-config/.env).",
      ].join("\n"),
    );
  }

  const resultado = parsed.data;
  cache = resultado;
  return resultado;
}

/**
 * Entorno tipado. La validacion es PEREZOSA: ocurre en el primer acceso a una
 * propiedad, no al importar el modulo. Asi importar `env` nunca puede tumbar
 * el build; el fallo se fuerza explicitamente en el arranque.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return validateEnv()[prop as keyof Env];
  },
  has(_target, prop) {
    return prop in validateEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(validateEnv());
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  },
});
