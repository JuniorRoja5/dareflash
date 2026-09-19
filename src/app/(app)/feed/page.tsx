import { FeedVertical } from "@/components/feed/feed-vertical";
import { PARAM_COMENTARIO, PARAM_VIDEO } from "@/lib/enlace-comentario";

export const metadata = { title: "Feed · DareFlash" };
export const dynamic = "force-dynamic";

/** Un parámetro repetido (`?video=a&video=b`) no es una petición legítima: se ignora. */
function unParam(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null;
}

/**
 * FEED — el feed inmersivo, en `/feed` DENTRO del grupo (app) pero FUERA del grupo `(shell)`: sin barra
 * superior ni rejilla de escritorio, conserva su layout inmersivo. Server Component: consulta la PRIMERA
 * página de videos PUBLISHED reales (paginación por cursor) y firma su reproducción; las siguientes
 * páginas las carga el cliente contra `/api/feed`. Contenido PÚBLICO: un invitado ve el feed.
 *
 * DEEP-LINK (`?video=…&comentario=…`, el enlace del aviso de comentario): el vídeo pedido se carga
 * APARTE y se pone el PRIMERO, así que el feed abre por él aunque estuviera en la página doce. Si ya no
 * se ve, no se finge: se entra al feed normal con un aviso honesto.
 */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { prisma } = await import("@/server/db/client");
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { feedPublicado, videoParaFeed } = await import("@/server/services/feed");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");

  const sp = await searchParams;
  const pedido = unParam(sp[PARAM_VIDEO]);
  const comentario = unParam(sp[PARAM_COMENTARIO]);

  // El usuario decide DOS cosas, ninguna de ellas una barrera (el feed es público y la seguridad real
  // la aplica el endpoint): si el reproductor marca "visto", y de quién es el voto que trae el payload
  // para que el botón nazca bien pintado. `getCurrentUser` está memoizado por petición.
  const usuario = await getCurrentUser();
  const haySesion = usuario !== null;
  const userId = usuario?.userId ?? null;
  const [pagina, destino] = await Promise.all([
    feedPublicado(prisma, { firmar: firmarReproduccion, userId }),
    pedido ? videoParaFeed(prisma, pedido, { firmar: firmarReproduccion, userId }) : null,
  ]);

  // El vídeo pedido va DELANTE y no se repite más abajo si la primera página ya lo traía.
  const items = destino
    ? [destino, ...pagina.items.filter((p) => p.id !== destino.id)]
    : pagina.items;

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

  return (
    <FeedVertical
      postsIniciales={items}
      cursorInicial={pagina.nextCursor}
      haySesion={haySesion}
      comentarioDestacado={destino && comentario ? comentario : undefined}
      aviso={pedido && !destino ? "Ese vídeo ya no está disponible." : undefined}
    />
  );
}
