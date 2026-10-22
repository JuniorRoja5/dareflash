import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";

import { requireSeccion } from "../panel-guard";
import { RetosPanel } from "../retos-panel";

export const metadata = { title: "Retos · Panel" };
export const dynamic = "force-dynamic";

/**
 * Sección RETOS del panel (funcional): crear reto (queda DRAFT), EDITAR (DRAFT o PUBLISHED) y publicar
 * los borradores. Guard PROPIO derivado de su sección (ADMIN): el layout solo abre el shell, y desde
 * que entran moderadores esta sección no es para ellos. Los endpoints se reprotegen a sí mismos. La
 * interacción crear/editar vive en el island `RetosPanel` (comparte estado entre formulario y lista).
 *
 * LA LISTA VA PAGINADA por keyset (`PasosKeyset`, igual que el resto del panel): antes se traía la
 * tabla entera de retos en cada carga. Los pasos se montan AQUÍ, en el servidor, y bajan al island
 * como `children`: la posición vive en la URL, así que recargar o compartir el enlace cae en la
 * misma página.
 */
export default async function RetosPanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSeccion("/panel/retos");

  const sp = await searchParams;
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 300) : null,
    pila: leerPila(sp["pila"]),
  };

  const { prisma } = await import("@/server/db/client");
  const { listarRetosAdmin } = await import("@/server/services/retos-admin");
  const pagina = await listarRetosAdmin(prisma, { cursor: aqui.cursor });

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

      <RetosPanel
        retos={pagina.filas}
        paginacion={
          <PasosKeyset base="/panel/retos" aqui={aqui} proximoCursor={pagina.proximoCursor} />
        }
      />
    </div>
  );
}
