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
 * El "top del reto" es el del ÚLTIMO reto CERRADO QUE TIENE PARTICIPACIONES (`ultimoRetoConTop`): uno
 * cerrado vacío no se ofrece, porque su vista solo diría que no hay nada. De cuál es lo dice la
 * cabecera DENTRO de la vista, no la pestaña: el título en el botón hacía una pestaña de ancho variable
 * que enseñaba títulos largos y de prueba.
 */
export default async function RankingPage() {
  const { prisma } = await import("@/server/db/client");
  const { rankingMensual, topDelReto, ultimoRetoConTop } =
    await import("@/server/services/ranking");
  const { getCurrentUser } = await import("@/server/auth/current-user");

  const [pagina, usuario, reto] = await Promise.all([
    rankingMensual(prisma, { limite: 20 }),
    getCurrentUser(),
    // Sin índice propio en `closedAt`: hoy recorre los retos cerrados, que son pocos. Si crecen, el
    // índice es [closedAt] y no cambia nada más.
    ultimoRetoConTop(prisma),
  ]);

  const top = reto ? await topDelReto(prisma, reto.id, 20) : [];

  const datos: DatosRanking = {
    mensual: pagina.filas.map((f) => ({
      userId: f.userId,
      username: f.username,
      displayName: f.displayName,
      image: f.image,
      victorias: f.victorias,
      puntos: f.puntos,
    })),
    cursorInicial: pagina.cursor,
    // Un top vacío aquí sería una carrera (se retiró la última participación entre las dos consultas):
    // se trata igual que "no hay reto", nunca como una pestaña que lleva a la nada.
    reto:
      reto && top.length > 0
        ? {
            titulo: reto.title,
            codigo: reto.publicCode,
            top: top.map((t) => ({
              submissionId: t.submissionId,
              userId: t.userId,
              username: t.username,
              image: t.image,
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
