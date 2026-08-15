import { redirect } from "next/navigation";

import { PerfilVista } from "./perfil-vista";

export const metadata = { title: "Perfil · DareFlash" };
export const dynamic = "force-dynamic";

/**
 * /perfil — MI perfil (el de la SESIÓN). Server Component: resuelve el usuario por la COOKIE (nunca por
 * un id del cliente) y consulta sus datos reales (displayName/username, puntos -> nivel). A diferencia
 * del perfil público de otros, aquí la rejilla incluye los vídeos EN PROCESO/FALLIDOS con su ESTADO
 * (via `miPerfil`, camino separado del público). Sin sesión -> a /entrar. Solo se firma el póster de
 * los vídeos PUBLICADOS (los no publicados aún no tienen reproducción — eso es otra pieza).
 */
export default async function PerfilPage() {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");

  const { prisma } = await import("@/server/db/client");
  const { miPerfil } = await import("@/server/services/perfil");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");

  const perfil = await miPerfil(prisma, user.userId);
  // Sesión válida pero la fila pudo borrarse/banearse entre validar la cookie y consultar: mismo trato.
  if (!perfil) redirect("/entrar");

  const videos = perfil.videos.map((v) => ({
    id: v.id,
    title: v.title,
    // Solo el vídeo PUBLICADO tiene póster firmable; los demás muestran su estado, sin miniatura.
    poster: v.estado === "publicado" ? firmarReproduccion(v.bunnyVideoId).poster : "",
    estado: v.estado,
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
