import { categoriaValida } from "../buscar/buscar-logica";
import { FeedRetos } from "./feed-retos";

export const metadata = { title: "Retos · DareFlash" };
export const dynamic = "force-dynamic";

/**
 * RETOS — listado PÚBLICO con datos REALES. Activos = PUBLISHED con cierre futuro (orden por cierre más
 * próximo); Cerrados en su pestaña aparte. `?categoria=` (chips de /buscar) preselecciona el filtro. El
 * único acento de la pantalla es el CTA principal del cromo (por rol: `ctaPrincipal`); aquí las tarjetas
 * solo enlazan al detalle.
 */
export default async function RetosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const categoriaInicial = categoriaValida((await searchParams).categoria);

  const { prisma } = await import("@/server/db/client");
  const { listarRetosPublicos, listarRetosProximos, listarRetosCerrados } =
    await import("@/server/services/retos-publico");
  const ahora = new Date();
  // TRES listas, no dos: los retos que aún no han abierto salían mezclados con los activos, así
  // que la pestaña decía que se podía entrar en retos que no habían empezado.
  // CERRADOS va PAGINADO (keyset): es la única que crece para siempre. Activos y Próximamente
  // están acotadas por su ventana — un reto sale de las dos solo, con el reloj.
  const [activos, proximos, cerrados] = await Promise.all([
    listarRetosPublicos(prisma, ahora),
    listarRetosProximos(prisma, ahora),
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
      <FeedRetos
        activos={activos}
        proximos={proximos}
        cerrados={cerrados.items}
        cerradosCursor={cerrados.nextCursor}
        categoriaInicial={categoriaInicial}
      />
    </div>
  );
}
