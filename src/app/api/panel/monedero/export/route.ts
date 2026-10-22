import { z } from "zod";

import { csvNombre } from "@/lib/csv";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError } from "@/server/http/api";

export const dynamic = "force-dynamic";

import { PRESETS_EXPORT } from "@/lib/rango-export";

/**
 * `desde`/`hasta` solo significan algo con `preset: "custom"`; con un preset la ventana es relativa
 * a AHORA y se calcula en el servidor. Que el cliente no pueda mandar un rango arbitrario disfrazado
 * de preset es parte del punto: el preset es una promesa de la pantalla, no un parámetro.
 */
const CuerpoSchema = z.object({
  tipo: z.enum(["retiradas", "ajustes"]),
  preset: z.enum(PRESETS_EXPORT),
  desde: z.string().max(10).optional(),
  hasta: z.string().max(10).optional(),
});

/**
 * POST /api/panel/monedero/export — descarga el CSV de retiradas o de ajustes.
 *
 * ┌─ ES UN POST, Y NO UN ENLACE, A PROPÓSITO ────────────────────────────────────────────────────┐
 * │ Un GET se dispara desde cualquier sitio: bastaría una imagen en otra página para que un admin │
 * │ con sesión abierta "exportara" sin saberlo. El atacante NO vería el fichero —el navegador no  │
 * │ le deja leer una respuesta de otro origen—, pero la línea de auditoría SÍ se escribiría, y    │
 * │ entonces la auditoría deja de ser prueba de quién sacó los datos: es exactamente lo que esta  │
 * │ pieza existe para garantizar. Siendo POST pasa por `mutatingRoute`, o sea Origin + sesión +   │
 * │ CSRF, y la descarga la arma el cliente con el blob.                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL ROL SE DERIVA DE `secciones.ts`. Aquí importa el doble: este endpoint devuelve IBANes y
 * direcciones de cripto EN CLARO, que es lo único del producto que ni siquiera su dueño puede leer.
 *
 * Y SE AUDITA ANTES DE RESPONDER. Si la traza se escribiera "después de enviar", un fallo a mitad
 * dejaría el fichero entregado y la auditoría muda — que es el único estado inaceptable de los dos.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { rolDeRuta } = await import("@/app/panel/secciones");
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { exportarAjustes, exportarRetiradas } = await import("@/server/services/monedero-export");

  try {
    await requireRole(rolDeRuta("/panel/monedero"));
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para exportar datos de pago.", 403);
  }
  const admin = await getCurrentUser();
  if (!admin) return apiError("FORBIDDEN", "No tienes permiso para exportar datos de pago.", 403);

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("INVALID_BODY", "Qué exportación no está claro.", 400);

  const { tipo, preset } = cuerpo.data;
  const { motivoLegible, resolverRango } = await import("@/lib/rango-export");
  const resuelto = resolverRango(
    { preset, desde: cuerpo.data.desde ?? null, hasta: cuerpo.data.hasta ?? null },
    new Date(),
  );
  // SE RECHAZA ANTES DE LEER NADA: un rango imposible no debe llegar a abrir la tabla de
  // retiradas, y mucho menos a descifrar un IBAN.
  if (!resuelto.ok) return apiError("RANGO_INVALIDO", motivoLegible(resuelto.motivo), 400);
  const { rango } = resuelto;

  const r =
    tipo === "retiradas"
      ? await exportarRetiradas(prisma, rango)
      : await exportarAjustes(prisma, rango);

  // LA TRAZA, ANTES DE ENTREGAR. Qué, cuántas filas y si se truncó: sin el recuento, la línea dice
  // "exportó algo" y no sirve para saber qué salió. Los DATOS no entran aquí, obviamente.
  //
  // Y EL RANGO, que ahora es parte de "qué salió": sin él, dos líneas idénticas de 40 filas pueden
  // ser dos meses distintos y la auditoría no distingue cuál se llevó cada uno.
  await prisma.auditLog.create({
    data: {
      actorId: admin.userId,
      action: "WALLET_EXPORT",
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
      // Un CSV con IBANes no se guarda en ninguna caché, de nadie.
      "Cache-Control": "no-store",
      // Cuántas filas van dentro, para que la pantalla pueda decirlo sin abrir el fichero.
      "X-Filas": String(r.filas),
      "X-Truncada": String(r.truncada),
    },
  });
});
