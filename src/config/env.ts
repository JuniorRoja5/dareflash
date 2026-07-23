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
 * obligatoria y la anade en hPanel en ese mismo paso. Marcar algo como
 * obligatorio antes de tiempo tumbaria el sitio ya desplegado sin motivo.
 */
const serverSchema = z.object({
  // --- Obligatorias HOY ---
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url("APP_URL debe ser una URL absoluta, p.ej. https://dareflash.com"),

  // --- Se promueven a obligatorias en su paso (ver comentario de cada una) ---
  /** Paso 4 — base de datos y esquema nucleo. */
  DATABASE_URL: z.string().min(1).optional(),
  /** Paso 6 — autenticacion. */
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
  /** Paso 8 — cola de trabajos disparada por cron. */
  CRON_SECRET: z.string().min(1).optional(),
  /** Paso 9 — Bunny.net (video) y Stripe (pagos). */
  BUNNY_STREAM_LIBRARY_ID: z.string().min(1).optional(),
  BUNNY_STREAM_API_KEY: z.string().min(1).optional(),
  BUNNY_CDN_HOSTNAME: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Email transaccional. */
  EMAIL_FROM: z.email().optional(),
  EMAIL_API_KEY: z.string().min(1).optional(),
  /** Observabilidad. */
  SENTRY_DSN: z.url().optional(),
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
        "o, en produccion, en el panel de variables de entorno de hPanel.",
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
