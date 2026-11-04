import { z } from "zod";

import { apiError, apiOk, clientIpKey, depsRuta, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/empresa — ALTA DE UNA EMPRESA, SIEMPRE DESDE CERO: crea la cuenta y la empresa juntas.
 *
 * ┌─ POR QUÉ NO PASA POR `mutatingRoute` ──────────────────────────────────────────────────────────┐
 * │ Porque NO HAY SESIÓN a la que atar un token CSRF: es un punto de entrada, exactamente como     │
 * │ `auth/register`, y está en la lista de exenciones justificadas de `tests/route-csrf` por eso.  │
 * │ Lo que sí lleva —y es lo que de verdad protege un alta— es el mismo juego que el registro de   │
 * │ participante: rate-limit por IP Y por dirección, política de contraseña, casilla de términos,  │
 * │ y respuesta UNIFORME exista o no la cuenta.                                                     │
 * │                                                                                                 │
 * │ Antes esta ruta colgaba una empresa de la sesión que la llamara. Ya no: una cuenta de empresa  │
 * │ no participa, así que convertir una cuenta de participante obligaría a decidir qué pasa con    │
 * │ sus vídeos, sus puntos y su monedero. Correo nuevo, cuenta nueva.                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SIN ENUMERACIÓN: la respuesta es la misma si el correo ya tenía cuenta. La explicación de que
 * hace falta un correo nuevo la da el FORMULARIO (`MSG_EMPRESA_CORREO_NUEVO`), antes de intentarlo;
 * decirlo en la respuesta convertiría el alta en un oráculo de direcciones registradas.
 *
 * SIN PUERTA DE EDAD, y es deliberado: la edad declarada existe para quien PARTICIPA y puede cobrar
 * premios (ver `EDAD_MIN_USO`), y una cuenta de empresa no hace ni lo uno ni lo otro. Quien firma
 * queda en `personaContacto`.
 */
export async function POST(req: Request) {
  const { env, prisma } = await depsRuta();
  const {
    EMPRESA_CIUDAD_MAX,
    EMPRESA_CONTACTO_MAX,
    EMPRESA_CONTACTO_MIN,
    EMPRESA_DIRECCION_MAX,
    EMPRESA_FISCAL_MAX,
    EMPRESA_NOMBRE_MAX,
    EMPRESA_NOMBRE_MIN,
    EMPRESA_REDES_MAX,
    EMPRESA_WEB_MAX,
    MSG_EMPRESA_DATOS_INVALIDOS,
    MSG_TERMINOS_SIN_ACEPTAR,
    RATE_LIMITS,
    TipoCuentaEmpresaSchema,
    TipoNegocioSchema,
  } = await import("@/config/constants");
  const { esPaisIso } = await import("@/lib/paises");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { esArgon2Sobrecargado } = await import("@/server/auth/password");
  const { evaluarPassword } = await import("@/server/auth/password-policy");
  const { EmpresaError, altaEmpresaDesdeCero } = await import("@/server/services/empresas");

  // Mismos cubos que el registro de participante: es la misma clase de puerta y el mismo abuso.
  const rl = await rateLimit(prisma, {
    key: `register:ip:${clientIpKey(req, env.AUTH_SECRET)}`,
    ...RATE_LIMITS.REGISTER_PER_IP,
  });
  if (!rl.allowed) return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);

  const pais = z.string().trim().length(2).refine(esPaisIso, "pais");
  const schema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    password: z.string().min(1).max(200),
    aceptaTerminos: z.literal(true),
    nombre: z.string().trim().min(EMPRESA_NOMBRE_MIN).max(EMPRESA_NOMBRE_MAX),
    tipoCuenta: TipoCuentaEmpresaSchema,
    tipoNegocio: TipoNegocioSchema,
    paisIso: pais,
    personaContacto: z.string().trim().min(EMPRESA_CONTACTO_MIN).max(EMPRESA_CONTACTO_MAX),
    ciudadTexto: z.string().trim().max(EMPRESA_CIUDAD_MAX).optional(),
    webUrl: z.url().max(EMPRESA_WEB_MAX).optional(),
    redes: z.string().trim().max(EMPRESA_REDES_MAX).optional(),
    direccion: z.string().trim().max(EMPRESA_DIRECCION_MAX).optional(),
    fiscalId: z.string().trim().max(EMPRESA_FISCAL_MAX).optional(),
    fiscalPaisIso: pais.optional(),
  });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // La casilla se distingue (el cliente ya sabe si la marcó); el resto va con un mensaje común,
    // que es lo que no abre enumeración por el email.
    const sinCasilla = parsed.error.issues.some((i) => i.path[0] === "aceptaTerminos");
    if (sinCasilla) return apiError("TERMINOS", MSG_TERMINOS_SIN_ACEPTAR, 400);
    return apiError("VALIDATION", MSG_EMPRESA_DATOS_INVALIDOS, 400);
  }

  // Rate-limit POR DIRECCIÓN además del de IP: sin él, quien tenga muchas IPs puede bombardear el
  // buzón de una víctima con correos de verificación. Mensaje 429 uniforme.
  const rlEmail = await rateLimit(prisma, {
    key: `register:email:${rateLimitKey(env.AUTH_SECRET, parsed.data.email)}`,
    ...RATE_LIMITS.REGISTER_PER_EMAIL,
  });
  if (!rlEmail.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);
  }

  const veredicto = evaluarPassword({
    password: parsed.data.password,
    email: parsed.data.email,
  });
  if (!veredicto.ok) return apiError("VALIDATION", veredicto.mensaje, 400);

  const ahora = new Date();
  try {
    await altaEmpresaDesdeCero(
      prisma,
      {
        email: parsed.data.email,
        password: parsed.data.password,
        // El sello lo pone el SERVIDOR: una fecha de consentimiento que manda quien consiente no
        // prueba nada.
        terminosAceptadosEn: ahora,
        nombre: parsed.data.nombre,
        tipoCuenta: parsed.data.tipoCuenta,
        tipoNegocio: parsed.data.tipoNegocio,
        paisIso: parsed.data.paisIso,
        personaContacto: parsed.data.personaContacto,
        ciudadTexto: parsed.data.ciudadTexto ?? null,
        webUrl: parsed.data.webUrl ?? null,
        redes: parsed.data.redes ?? null,
        direccion: parsed.data.direccion ?? null,
        fiscalId: parsed.data.fiscalId ?? null,
        fiscalPaisIso: parsed.data.fiscalPaisIso ?? null,
      },
      {
        // `env` se lee AQUÍ (por petición): nadie lo lee fuera de `config/env`, y los servicios
        // reciben lo que necesitan por parámetro.
        adminEmail: env.ADMIN_EMAIL ?? null,
        urlPanel: `${env.APP_URL}/panel/empresas`,
        appUrl: env.APP_URL,
        log: (m) => console.warn(m),
      },
      ahora,
    );
  } catch (e) {
    if (e instanceof EmpresaError) return apiError("VALIDATION", e.message, 400);
    if (esArgon2Sobrecargado(e)) {
      return apiError("OVERLOADED", "Servicio ocupado, reintenta en unos segundos.", 503);
    }
    throw e;
  }

  // Respuesta UNIFORME: no revela si la direccion ya tenia cuenta (sin enumeracion).
  return apiOk({
    ok: true,
    message: "Si el email es valido, te hemos enviado un correo de verificacion.",
  });
}
