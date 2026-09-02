import { FeedVertical } from "@/components/feed/feed-vertical";

export const metadata = { title: "Feed · DareFlash" };
export const dynamic = "force-dynamic";

/**
 * FEED — el feed inmersivo, en `/feed` DENTRO del grupo (app) pero FUERA del grupo `(shell)`: sin barra
 * superior ni rejilla de escritorio, conserva su layout inmersivo. Server Component: consulta la PRIMERA
 * página de videos PUBLISHED reales (paginación por cursor) y firma su reproducción; las siguientes
 * páginas las carga el cliente contra `/api/feed`. Contenido PÚBLICO: un invitado ve el feed.
 */
export default async function FeedPage() {
  const { prisma } = await import("@/server/db/client");
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { feedPublicado } = await import("@/server/services/feed");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");

  // El usuario decide DOS cosas, ninguna de ellas una barrera (el feed es público y la seguridad real
  // la aplica el endpoint): si el reproductor marca "visto", y de quién es el voto que trae el payload
  // para que el botón nazca bien pintado. `getCurrentUser` está memoizado por petición.
  const usuario = await getCurrentUser();
  const haySesion = usuario !== null;
  const { items, nextCursor } = await feedPublicado(prisma, {
    firmar: firmarReproduccion,
    userId: usuario?.userId ?? null,
  });

  if (items.length === 0) {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold text-text">Aún no hay vídeos</h1>
        <p className="max-w-sm text-sm text-text-dim">
          Cuando se publiquen los primeros vídeos, aparecerán aquí. Vuelve en un rato.
        </p>
      </div>
    );
  }

  return <FeedVertical postsIniciales={items} cursorInicial={nextCursor} haySesion={haySesion} />;
}
