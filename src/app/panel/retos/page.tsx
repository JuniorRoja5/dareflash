import { requireSeccion } from "../panel-guard";
import { RetosPanel } from "../retos-panel";

export const metadata = { title: "Retos · Panel" };
export const dynamic = "force-dynamic";

/**
 * Sección RETOS del panel (funcional): crear reto (queda DRAFT), EDITAR (DRAFT o PUBLISHED) y publicar
 * los borradores. Guard PROPIO derivado de su sección (ADMIN): el layout solo abre el shell, y desde
 * que entran moderadores esta sección no es para ellos. Los endpoints se reprotegen a sí mismos. La
 * interacción crear/editar vive en el island `RetosPanel` (comparte estado entre formulario y lista).
 */
export default async function RetosPanelPage() {
  await requireSeccion("/panel/retos");
  const { prisma } = await import("@/server/db/client");
  const { listarRetosAdmin } = await import("@/server/services/retos-admin");
  const retos = await listarRetosAdmin(prisma);

  return (
    <div className="df-rise space-y-8">
      <div>
        <h1
          className="text-2xl leading-none text-text"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wght" 720, "wdth" 112',
          }}
        >
          Retos
        </h1>
        <p className="mt-2 text-sm text-text-dim">
          Crea un reto (se guarda como borrador), edítalo cuando quieras y publícalo cuando esté
          listo.
        </p>
      </div>

      <RetosPanel retos={retos} />
    </div>
  );
}
