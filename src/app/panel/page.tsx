import { CrearReto } from "./crear-reto";
import { ListaRetos } from "./lista-retos";

export const metadata = { title: "Panel · DareFlash" };
export const dynamic = "force-dynamic";

/**
 * Inicio del PANEL DE ADMIN (M5): crear reto (queda DRAFT) + lista de retos con su estado y la acción
 * Publicar en los borradores. El acceso lo protege el layout (requireRole ADMIN); los endpoints se
 * reprotegen a sí mismos. Solo el admin crea/publica (decisión de producto). Datos reales.
 */
export default async function PanelPage() {
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
