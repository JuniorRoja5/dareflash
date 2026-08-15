import Link from "next/link";

import { Boton } from "@/components/ui/boton";

import { CambiarPassword } from "./cambiar-password";
import { FormularioEditarPerfil } from "./formulario-editar-perfil";

export const metadata = { title: "Editar perfil · DareFlash" };

// Lee la sesión (cookie) -> render dinámico por petición. Explícito para no depender de la inferencia.
export const dynamic = "force-dynamic";

/**
 * EDITAR PERFIL — pantalla del DUEÑO de la sesión. La autorización se refleja en la UI: si no hay
 * sesión, NO se muestra el formulario, sino una invitación a entrar (el backend igual rechaza al
 * anónimo; esto es la cara amable). Solo se edita el PROPIO perfil: no hay id en la ruta, el usuario
 * que se edita es siempre el de la sesión.
 *
 * Los datos actuales (nombre, @usuario) se cargan en el SERVIDOR y se pasan al formulario como valor
 * inicial. Dentro del (shell): mismo contenedor, columna estrecha centrada (un formulario no quiere
 * el ancho completo de la rejilla de vídeos).
 */
export default async function EditarPerfilPage() {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { prisma } = await import("@/server/db/client");

  const sesion = await getCurrentUser();

  if (!sesion) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-text">Edita tu perfil</h1>
        <p className="mt-3 text-text-dim">
          Inicia sesión para cambiar tu nombre y tu foto. Solo tú puedes editar tu perfil.
        </p>
        <Boton href="/entrar" variante="principal" className="mt-6 px-6 py-3">
          Iniciar sesión
        </Boton>
      </div>
    );
  }

  const perfil = await prisma.user.findUnique({
    where: { id: sesion.userId },
    select: {
      displayName: true,
      username: true,
      image: true,
      bio: true,
      website: true,
      instagram: true,
      youtube: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 lg:py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-text">Editar perfil</h1>
        <Link
          href="/perfil"
          className="rounded-xs text-sm text-text-dim transition-colors duration-150 ease-mechanical hover:text-text"
        >
          Volver al perfil
        </Link>
      </div>

      <FormularioEditarPerfil
        nombreInicial={perfil?.displayName ?? ""}
        usuario={perfil?.username ?? ""}
        imagenInicial={perfil?.image ?? null}
        bioInicial={perfil?.bio ?? ""}
        websiteInicial={perfil?.website ?? ""}
        instagramInicial={perfil?.instagram ?? ""}
        youtubeInicial={perfil?.youtube ?? ""}
      />

      {/* Cambiar contraseña: sesión ya exigida arriba; el endpoint re-verifica (mutatingRoute). */}
      <div className="mt-8">
        <CambiarPassword />
      </div>
    </div>
  );
}
