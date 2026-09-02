import { FeedInicio } from "./feed-inicio";

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

  const { items, nextCursor } = await feedPublicado(prisma, { firmar: firmarReproduccion });
  // Solo para saber si el reproductor debe marcar "visto" (un invitado no marca: no tiene sesión con
  // la que hacerlo). NO es una barrera: el feed es público y la seguridad real la aplica el endpoint.
  // `getCurrentUser` está memoizado por petición, así que no añade consulta si algo más ya lo pidió.
  const haySesion = (await getCurrentUser()) !== null;

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

  return <FeedInicio postsIniciales={items} cursorInicial={nextCursor} haySesion={haySesion} />;
}
