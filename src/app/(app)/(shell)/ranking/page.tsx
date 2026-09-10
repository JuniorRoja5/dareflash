import { type DatosRanking, RankingVistas } from "./ranking-vistas";

export const metadata = { title: "Ranking · DareFlash" };
export const dynamic = "force-dynamic";

/**
 * RANKING — datos REALES. Hasta esta pieza pintaba usuarios y cifras de maqueta (`ranking-datos.ts`,
 * ya retirado): nombres inventados con puntuaciones inventadas, en producción.
 *
 * La primera página del mensual se resuelve AQUÍ, en el servidor, para que la clasificación llegue
 * pintada (no hay salto de "cargando" ni una petición extra desde el navegador). Las siguientes las
 * pide el cliente por cursor a `/api/ranking`.
 *
 * El "top del reto" es el del ÚLTIMO reto CERRADO, y se nombra en el conmutador. La maqueta decía
 * "Top 20 del reto" sin decir de cuál, que con un solo reto de mentira se entendía y con retos de
 * verdad no dice nada.
 */
export default async function RankingPage() {
  const { prisma } = await import("@/server/db/client");
  const { rankingMensual, topDelReto } = await import("@/server/services/ranking");
  const { getCurrentUser } = await import("@/server/auth/current-user");

  const [pagina, usuario, ultimoCerrado] = await Promise.all([
    rankingMensual(prisma, { limite: 20 }),
    getCurrentUser(),
    // El más reciente que ya consumó su cierre. `closedAt` está indexado por el propio cierre.
    prisma.challenge.findFirst({
      where: { closedAt: { not: null }, deletedAt: null, eliminacionProgramadaEn: null },
      orderBy: { closedAt: "desc" },
      select: { id: true, title: true, publicCode: true },
    }),
  ]);

  const top = ultimoCerrado ? await topDelReto(prisma, ultimoCerrado.id, 20) : [];

  const datos: DatosRanking = {
    mensual: pagina.filas.map((f) => ({
      userId: f.userId,
      username: f.username,
      displayName: f.displayName,
      victorias: f.victorias,
      puntos: f.puntos,
    })),
    cursorInicial: pagina.cursor,
    reto: ultimoCerrado
      ? {
          titulo: ultimoCerrado.title,
          codigo: ultimoCerrado.publicCode,
          top: top.map((t) => ({
            submissionId: t.submissionId,
            userId: t.userId,
            username: t.username,
            votos: t.votos,
            puesto: t.puesto,
          })),
        }
      : null,
    yo: usuario?.userId ?? null,
  };

  return (
    <div className="relative mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      {/* ATMÓSFERA v2: glow --df-glow-accion MUY tenue detrás del contenido. NO es un magenta de
          acción (no hay botón): da profundidad y color para que el glass (bg-surface/60 +
          backdrop-blur + sombras) LEA sobre el fondo plano, en vez de verse como v1. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <RankingVistas datos={datos} />
    </div>
  );
}
