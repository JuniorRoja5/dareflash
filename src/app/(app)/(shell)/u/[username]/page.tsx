import { notFound } from "next/navigation";
import { z } from "zod";

import { PerfilVista } from "../../perfil/perfil-vista";

export const dynamic = "force-dynamic";

/** El username de la URL, validado. Un valor absurdo -> 404 (no se consulta la BD con basura). */
const ParamsSchema = z.object({ username: z.string().min(1).max(64) });

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `@${username} · DareFlash` };
}

/**
 * /u/[username] — perfil PÚBLICO de otro usuario. NO requiere sesión (es público). Devuelve SOLO
 * campos públicos (via `perfilPublicoPorUsername`): cambiar el username en la URL nunca revela email,
 * fecha de nacimiento, saldos privados ni el hash de nadie. Usuario inexistente/borrado/baneado -> 404.
 */
export default async function PerfilPublicoPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { username } = parsed.data;

  const { prisma } = await import("@/server/db/client");
  const { perfilPublicoPorUsername } = await import("@/server/services/perfil");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");

  const perfil = await perfilPublicoPorUsername(prisma, username);
  if (!perfil) notFound();

  const videos = perfil.videos.map((v) => ({
    id: v.id,
    title: v.title,
    poster: firmarReproduccion(v.bunnyVideoId).poster,
    categoria: v.categoria,
  }));

  return (
    <PerfilVista
      displayName={perfil.displayName}
      handle={perfil.username}
      imagen={perfil.image}
      bio={perfil.bio}
      website={perfil.website}
      instagram={perfil.instagram}
      youtube={perfil.youtube}
      puntos={perfil.pointsBalance}
      retosGanados={perfil.retosGanados}
      totalVideos={perfil.videos.length}
      videos={videos}
      esPropio={false}
    />
  );
}
