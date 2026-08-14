import { redirect } from "next/navigation";

import { PerfilVista } from "./perfil-vista";

export const metadata = { title: "Perfil · DareFlash" };
export const dynamic = "force-dynamic";

/**
 * /perfil — MI perfil (el de la SESIÓN). Server Component: resuelve el usuario por la COOKIE (nunca por
 * un id del cliente) y consulta sus datos reales (displayName/username, puntos -> nivel, sus vídeos
 * PUBLISHED). Sin sesión -> a /entrar. Los pósters se firman en el servidor (Bunny, `env`) y se pasan
 * ya listos a la vista presentacional compartida con `/u/[username]`.
 */
export default async function PerfilPage() {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");

  const { prisma } = await import("@/server/db/client");
  const { perfilPublicoPorId } = await import("@/server/services/perfil");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");

  const perfil = await perfilPublicoPorId(prisma, user.userId);
  // Sesión válida pero la fila pudo borrarse/banearse entre validar la cookie y consultar: mismo trato.
  if (!perfil) redirect("/entrar");

  const videos = perfil.videos.map((v) => ({
    id: v.id,
    title: v.title,
    poster: firmarReproduccion(v.bunnyVideoId).poster,
  }));

  return (
    <PerfilVista
      nombre={perfil.displayName ?? perfil.username ?? "Tu perfil"}
      handle={perfil.username}
      puntos={perfil.pointsBalance}
      retosGanados={perfil.retosGanados}
      totalVideos={perfil.videos.length}
      videos={videos}
      esPropio
    />
  );
}
