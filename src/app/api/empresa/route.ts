import { z } from "zod";

import {
  EMPRESA_DIRECCION_MAX,
  EMPRESA_NOMBRE_MAX,
  EMPRESA_NOMBRE_MIN,
  EMPRESA_WEB_MAX,
  MSG_EMPRESA_DATOS_INVALIDOS,
  MSG_EMPRESA_SIN_VERIFICAR,
  TipoCuentaEmpresaSchema,
  TipoNegocioSchema,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El alta. `webUrl` y `direccion` son opcionales DE VERDAD: una marca personal puede no tener web y
 * un negocio online no tiene dirección. La URL se valida como URL (no como texto): una web que no se
 * puede abrir no sirve para verificar nada, y es el dato con el que se verifica.
 */
const CuerpoSchema = z.object({
  nombre: z.string().trim().min(EMPRESA_NOMBRE_MIN).max(EMPRESA_NOMBRE_MAX),
  tipoCuenta: TipoCuentaEmpresaSchema,
  tipoNegocio: TipoNegocioSchema,
  webUrl: z.url().max(EMPRESA_WEB_MAX).optional(),
  direccion: z.string().trim().max(EMPRESA_DIRECCION_MAX).optional(),
});

/**
 * POST /api/empresa — REGISTRAR mi empresa. Crea la fila en PENDIENTE y encola el aviso al admin en
 * la MISMA transacción (ver `registrarEmpresa`).
 *
 * QUIÉN se registra sale de la SESIÓN, nunca del cuerpo: el cuerpo trae los datos del negocio, no
 * de quién es. `mutatingRoute` ya comprobó Origin → sesión → CSRF; aquí se añade la barrera que
 * tiene toda acción con efectos: EMAIL VERIFICADO.
 *
 * IDEMPOTENTE: una persona, una empresa (`ownerUserId` es UNIQUE). Un doble clic o dos pestañas
 * devuelven la misma empresa con `creado: false`, sin segunda fila y sin segundo correo.
 */
export const POST = mutatingRoute(async (req, { env, prisma }) => {
  const { requireVerifiedUser } = await import("@/server/auth/rbac");
  const { EmpresaError, registrarEmpresa } = await import("@/server/services/empresas");

  let userId: string;
  try {
    userId = (await requireVerifiedUser()).userId;
  } catch {
    // Mismo texto que la pantalla: la barrera antifraude se explica igual en los dos sitios.
    return apiError("EMAIL_NOT_VERIFIED", MSG_EMPRESA_SIN_VERIFICAR, 403);
  }

  const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_BODY", MSG_EMPRESA_DATOS_INVALIDOS, 400);

  try {
    const r = await registrarEmpresa(
      prisma,
      {
        userId,
        nombre: parsed.data.nombre,
        tipoCuenta: parsed.data.tipoCuenta,
        tipoNegocio: parsed.data.tipoNegocio,
        webUrl: parsed.data.webUrl ?? null,
        direccion: parsed.data.direccion ?? null,
      },
      {
        // `env` se lee AQUÍ (por petición), no en el servicio: nadie lee `process.env` fuera de
        // `config/env`, y los servicios reciben lo que necesitan por parámetro.
        adminEmail: env.ADMIN_EMAIL ?? null,
        urlPanel: `${env.APP_URL}/panel/empresas`,
        log: (m) => console.warn(m),
      },
    );
    return apiOk({ id: r.id, creado: r.creado });
  } catch (e) {
    if (e instanceof EmpresaError) return apiError("INVALID_BODY", e.message, 400);
    throw e;
  }
});
