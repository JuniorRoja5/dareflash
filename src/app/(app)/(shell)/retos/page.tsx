import { categoriaValida } from "../buscar/buscar-logica";
import { FeedRetos } from "./feed-retos";

export const metadata = { title: "Retos · DareFlash" };
export const dynamic = "force-dynamic";

/**
 * RETOS — listado PÚBLICO con datos REALES. Activos = PUBLISHED con cierre futuro (orden por cierre más
 * próximo); Cerrados en su pestaña aparte. `?categoria=` (chips de /buscar) preselecciona el filtro. El
 * único magenta de acción es "Crear reto" del cromo (admin); aquí las tarjetas solo enlazan al detalle.
 */
export default async function RetosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const categoriaInicial = categoriaValida((await searchParams).categoria);

  const { prisma } = await import("@/server/db/client");
  const { listarRetosPublicos, listarRetosCerrados } =
    await import("@/server/services/retos-publico");
  const ahora = new Date();
  const [activos, cerrados] = await Promise.all([
    listarRetosPublicos(prisma, ahora),
    listarRetosCerrados(prisma, ahora),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <h1
        className="mb-5 text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        Retos activos
      </h1>
      <FeedRetos activos={activos} cerrados={cerrados} categoriaInicial={categoriaInicial} />
    </div>
  );
}
