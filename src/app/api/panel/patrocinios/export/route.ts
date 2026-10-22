import { z } from "zod";

import { csvNombre } from "@/lib/csv";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError } from "@/server/http/api";

export const dynamic = "force-dynamic";

import { PRESETS_EXPORT } from "@/lib/rango-export";

/** `desde`/`hasta` solo cuentan con `preset: "custom"`. Igual que en el export del monedero. */
const CuerpoSchema = z.object({
  tipo: z.enum(["patrocinios", "ganadores"]),
  preset: z.enum(PRESETS_EXPORT),
  desde: z.string().max(10).optional(),
  hasta: z.string().max(10).optional(),
});

/**
 * POST /api/panel/patrocinios/export — descarga el CSV de patrocinios o el de ganadores.
 *
 * ┌─ ES UN POST, Y NO UN ENLACE, POR LO MISMO QUE EL DEL MONEDERO ───────────────────────────────┐
 * │ Un GET se dispara desde cualquier sitio: bastaría una imagen en otra página para que un admin │
 * │ con sesión abierta "exportara" sin saberlo. El atacante no vería el fichero —el navegador no  │
 * │ le deja leer una respuesta de otro origen—, pero la línea de auditoría SÍ se escribiría, y    │
 * │ entonces la auditoría deja de ser prueba de quién sacó los datos. Siendo POST pasa por        │
 * │ `mutatingRoute`: Origin + sesión + CSRF.                                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL ROL SE DERIVA DE `secciones.ts`, nunca con un `requireRole("ADMIN")` suelto: el día que la
 * sección cambie de rol, la nav diría una cosa y la ruta otra.
 *
 * ESTOS FICHEROS NO LLEVAN DATOS DE PAGO —ni IBANes ni direcciones—, pero sí nombres de usuario,
 * importes cobrados y condiciones comerciales con marcas. Se auditan igual, y ANTES de responder:
 * una traza escrita "después de enviar" se pierde justo cuando falla el envío.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { rolDeRuta } = await import("@/app/panel/secciones");
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { exportarGanadores, exportarPatrocinios } = await import("@/server/services/patrocinios");

  try {
    await requireRole(rolDeRuta("/panel/patrocinios"));
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para exportar la contabilidad.", 403);
  }
  const admin = await getCurrentUser();
  if (!admin) return apiError("FORBIDDEN", "No tienes permiso para exportar la contabilidad.", 403);

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("INVALID_BODY", "Qué exportación no está claro.", 400);

  const { tipo, preset } = cuerpo.data;
  const { motivoLegible, resolverRango } = await import("@/lib/rango-export");
  const resuelto = resolverRango(
    { preset, desde: cuerpo.data.desde ?? null, hasta: cuerpo.data.hasta ?? null },
    new Date(),
  );
  if (!resuelto.ok) return apiError("RANGO_INVALIDO", motivoLegible(resuelto.motivo), 400);
  const { rango } = resuelto;

  const r =
    tipo === "patrocinios"
      ? await exportarPatrocinios(prisma, rango)
      : await exportarGanadores(prisma, rango);

  // El RANGO entra en la traza: sin él, dos exportaciones de 40 filas pueden ser dos trimestres
  // distintos y la auditoría no sabe cuál se llevó cada uno.
  await prisma.auditLog.create({
    data: {
      actorId: admin.userId,
      action: "SPONSOR_EXPORT",
      targetType: "EXPORT",
      targetId: tipo,
      metadata: {
        tipo,
        filas: r.filas,
        truncada: r.truncada,
        preset,
        desde: rango.desde.toISOString(),
        hasta: rango.hasta.toISOString(),
      },
    },
  });

  return new Response(r.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvNombre(tipo)}"`,
      "Cache-Control": "no-store",
      "X-Filas": String(r.filas),
      "X-Truncada": String(r.truncada),
    },
  });
});
