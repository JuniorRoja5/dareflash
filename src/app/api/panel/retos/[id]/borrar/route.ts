import { z } from "zod";

import { apiError, apiOk } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/retos/[id]/borrar — el ADMIN borra un reto. Su PROPIO guard (`requireRole("ADMIN")`)
 * + `mutatingRoute`.
 *
 * DOS modos, y el que NO destruye es el de por defecto: sin `forzar`, el reto entra en una GRACIA de 7
 * dias durante la que desaparece del publico pero sigue en el panel y se puede restaurar. Con
 * `forzar: true`, el admin lo saca ya.
 *
 * En los dos casos es un borrado LOGICO: los videos de las participaciones siguen siendo de sus
 * autores y siguen en su perfil. Borrar un reto NUNCA destruye contenido de terceros.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { prisma }, { params }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { borrarReto } = await import("@/server/services/retos-admin");

    try {
      await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para borrar retos.", 403);
    }

    // Cuerpo OPCIONAL. Sin el (o ilegible) se asume el modo SEGURO: gracia de 7 dias. Forzar el
    // borrado inmediato tiene que ser una decision explicita, nunca el resultado de un cuerpo perdido.
    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      /* sin cuerpo: modo seguro */
    }
    const cuerpo = z.object({ forzar: z.boolean().optional() }).safeParse(body ?? {});
    if (!cuerpo.success) return apiError("VALIDATION", "Datos invalidos.", 400);

    const { id } = await params;
    const r = await borrarReto(prisma, id, { forzar: cuerpo.data.forzar === true });
    if (!r.borrado) return apiError("NOT_FOUND", "Ese reto no existe o ya estaba borrado.", 404);
    return apiOk({ ok: true, eliminaEnMs: r.eliminaEn ? r.eliminaEn.getTime() : null });
  },
);
