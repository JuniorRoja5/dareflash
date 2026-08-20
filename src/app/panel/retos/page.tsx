import { CrearReto } from "../crear-reto";
import { ListaRetos } from "../lista-retos";

export const metadata = { title: "Retos · Panel" };
export const dynamic = "force-dynamic";

/**
 * Sección RETOS del panel (M5, funcional): crear reto (queda DRAFT) + lista con su estado y la acción
 * Publicar en los borradores. Acceso protegido por el layout (requireRole ADMIN); los endpoints se
 * reprotegen a sí mismos. Solo el admin crea/publica. Datos reales.
 */
export default async function RetosPanelPage() {
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
          Crea un reto (se guarda como borrador) y publícalo cuando esté listo.
        </p>
      </div>

      <CrearReto />

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Retos existentes
        </h2>
        <ListaRetos retos={retos} />
      </section>
    </div>
  );
}
