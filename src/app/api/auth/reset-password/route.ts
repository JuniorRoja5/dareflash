import { z } from "zod";

import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * Confirma el RESTABLECIMIENTO de contrasena. Es el POST del BOTON de la pagina `/restablecer` (no
 * un GET): asi los escaneres de correo, que hacen prefetch del enlace, no consumen el token de un
 * solo uso antes de que el usuario haga clic (mismo patron que `/verify` y `/unlock`).
 *
 * El token, su consumo un-solo-uso, la aplicacion de la contrasena (Argon2id) y la REVOCACION de
 * TODAS las sesiones del usuario van juntos en `resetPassword` (misma transaccion). Ver alli.
 *
 * SIN rate-limit A PROPOSITO (dicho, no omitido en silencio): el token es de 256 bits (fuerza bruta
 * inviable) y `resetPassword` hace una PRE-LECTURA barata que rechaza los tokens invalidos/caducados
 * ANTES de pagar el argon2, asi que no hay amplificacion de CPU que un cubo tuviera que frenar.
 *
 * NO lleva sesion (el dueño llega desde el correo, deslogueado), asi que esta en la lista EXEMPT de
 * `tests/route-csrf.test.ts` con su justificacion. La proteccion CSRF que le aplica es exigir
 * `application/json` (una peticion cross-site no puede enviarlo sin preflight).
 */
export async function POST(req: Request) {
  const { prisma } = await import("@/server/db/client");
  const { resetPassword } = await import("@/server/auth/password-reset");
  const { esArgon2Sobrecargado } = await import("@/server/auth/password");

  // Misma politica de contrasena que el registro: min 8, max 200 (el .max evita quemar CPU en el
  // pre-hash de Argon2 con entradas enormes).
  const schema = z.object({
    token: z.string().min(1),
    password: z.string().min(8).max(200),
  });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", "Cuerpo de la peticion invalido.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return apiError("VALIDATION", "Revisa el enlace y una contrasena de 8+ caracteres.", 400);

  try {
    const r = await resetPassword(prisma, {
      rawToken: parsed.data.token,
      newPassword: parsed.data.password,
    });
    if (!r.ok) {
      // Generico (invalido/caducado igual): sin oraculo de por que fallo. El caso NORMAL aqui es el
      // enlace YA USADO (el dueño acaba de restablecer y recarga); la pagina lo cubre con texto.
      return apiError(
        "INVALID_TOKEN",
        "El enlace para restablecer la contrasena es invalido o ha caducado.",
        400,
      );
    }
    return apiOk({
      ok: true,
      message: "Contrasena actualizada. Ya puedes iniciar sesion con la nueva.",
    });
  } catch (e) {
    // El argon2 del hasheo va por el semaforo: si esta saturado, 503 (servicio ocupado), nunca 500.
    if (esArgon2Sobrecargado(e)) {
      return apiError("OVERLOADED", "Servicio ocupado, reintenta en unos segundos.", 503);
    }
    throw e;
  }
}
