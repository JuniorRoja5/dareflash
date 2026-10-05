import { z } from "zod";

import { apiError, apiOk, clientIpKey, depsRuta, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

// El calculo de la edad vivia AQUI, como una funcion local de nueve lineas. Se fue a `lib/edad`
// porque una frontera de producto —quien puede registrarse— no se ata con tests si esta escondida
// dentro de un handler, y esta tiene bordes de verdad: el dia del cumpleanos, el 29 de febrero.

export async function POST(req: Request) {
  const { env, prisma } = await depsRuta();
  const { MSG_EDAD_MINIMA, MSG_FECHA_NACIMIENTO_NO_VALIDA, MSG_TERMINOS_SIN_ACEPTAR, RATE_LIMITS } =
    await import("@/config/constants");
  const { declaraEdadMinima, leerFechaNacimiento } = await import("@/lib/edad");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { registerUser } = await import("@/server/auth/registration");
  const { esArgon2Sobrecargado } = await import("@/server/auth/password");
  const { evaluarPassword } = await import("@/server/auth/password-policy");

  const rl = await rateLimit(prisma, {
    key: `register:ip:${clientIpKey(req, env.AUTH_SECRET)}`,
    ...RATE_LIMITS.REGISTER_PER_IP,
  });
  if (!rl.allowed) return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);

  const schema = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    // La longitud/fuerza REAL la valida `evaluarPassword` (abajo). Aquí solo el .max, que evita
    // quemar CPU en el pre-hash de Argon2 con una entrada enorme; .min(1) para no aceptar vacío.
    password: z.string().min(1).max(200),
    // LA FECHA NO LA PARSEA ZOD. `z.coerce.date()` acepta todo lo que `new Date` sepa tragarse, y
    // eso incluye "2001-02-30", que se convierte CALLADAMENTE en el 2 de marzo: se guardaria una
    // fecha distinta de la que escribio la persona, y en la frontera de la edad eso decide quien
    // entra. Se recibe como texto y lo valida `leerFechaNacimiento`, que exige AAAA-MM-DD y que el
    // dia exista de verdad.
    birthDate: z.string().max(10),
    // LA CASILLA. `literal(true)` y no `boolean()`: un `false` no es "no marcada y seguimos", es
    // que no hay consentimiento, y entonces no hay alta.
    aceptaTerminos: z.literal(true),
    // Codigo del enlace de invitacion, si llego por uno. OPCIONAL y tolerante: un valor con mala
    // forma no invalida el alta, se ignora (lo resuelve `referentePorCodigo`). Si aqui fuera
    // estricto, pegar un enlace roto impediria registrarse, que es peor que perder la invitacion.
    ref: z.string().trim().max(64).optional(),
  });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Mensaje GENERICO a proposito para el resto de campos: no se dice cual falló, que es lo que
    // abriria enumeracion por el email. La casilla es la excepcion util —el cliente ya sabe si la
    // marcó— y se distingue para poder decirle algo que sirva.
    const sinCasilla = parsed.error.issues.some((i) => i.path[0] === "aceptaTerminos");
    if (sinCasilla) return apiError("TERMINOS", MSG_TERMINOS_SIN_ACEPTAR, 400);
    return apiError("VALIDATION", "Datos de registro invalidos.", 400);
  }

  // LA PUERTA DE EDAD, EN UN SOLO SITIO Y EN EL SERVIDOR. El `<input type="date">` del formulario
  // no es una barrera: cualquiera puede mandar el JSON a mano. Y es DECLARADA — se cree lo que
  // escribe la persona, no se verifica—, asi que ni esto ni la casilla autorizan a cobrar nada:
  // eso lo decidira Stripe Connect al reclamar, con documento. Ver `EDAD_MIN_USO`.
  const ahora = new Date();
  const nacimiento = leerFechaNacimiento(parsed.data.birthDate, ahora);
  if (!nacimiento) return apiError("VALIDATION", MSG_FECHA_NACIMIENTO_NO_VALIDA, 400);
  if (!declaraEdadMinima(nacimiento, ahora)) return apiError("EDAD_MINIMA", MSG_EDAD_MINIMA, 400);

  // Rate-limit POR DIRECCION (ademas del de IP de arriba). Sin esto, un atacante con muchas IPs
  // (botnet / IPv6 rotando) puede BOMBARDEAR el buzon de una victima con correos de verificacion. El
  // tope por email lo frena. Mensaje 429 UNIFORME (igual exista o no la cuenta): no abre enumeracion.
  const rlEmail = await rateLimit(prisma, {
    key: `register:email:${rateLimitKey(env.AUTH_SECRET, parsed.data.email)}`,
    ...RATE_LIMITS.REGISTER_PER_EMAIL,
  });
  if (!rlEmail.allowed) {
    return apiError("RATE_LIMITED", "Demasiados intentos. Intenta mas tarde.", 429);
  }

  // POLITICA DE CONTRASENA FUERTE (server-side, misma regla que el reset): rechaza debiles/comunes/
  // predecibles, no solo por longitud. El email se pasa para vetar contrasenas ligadas a la identidad.
  const veredicto = evaluarPassword({
    password: parsed.data.password,
    email: parsed.data.email,
  });
  if (!veredicto.ok) return apiError("VALIDATION", veredicto.mensaje, 400);

  // El argon2 del registro (que se ejecuta SIEMPRE, anti-enumeracion) va por el semaforo: si
  // esta saturado, 503, no 500. La respuesta uniforme se mantiene para el resto de casos.
  try {
    await registerUser(prisma, {
      email: parsed.data.email,
      password: parsed.data.password,
      birthDate: nacimiento,
      // El sello lo pone el SERVIDOR, no el cliente: una fecha de consentimiento que manda quien
      // consiente no prueba nada. `ahora` es el mismo instante con el que se juzgó la edad.
      terminosAceptadosEn: ahora,
      appUrl: env.APP_URL,
      refCode: parsed.data.ref ?? null,
    });
  } catch (e) {
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
