import { notFound } from "next/navigation";

import { VerificadorReproduccion } from "./verificador";

export const metadata = { title: "Verificación de reproducción" };
export const dynamic = "force-dynamic";

/**
 * ARNES de verificación del camino de reproducción (player <-> endpoint firmado) contra un Video
 * PUBLISHED real. DEV-GUARDED: solo accesible LOGUEADO y SIN enlazar en la navegación (ruta suelta,
 * fuera del shell). NO es el cableado de feed/perfil (eso llega con la capa de datos); es solo el
 * banco de pruebas de navegador. Se le pasa el id del Video por la ruta: /reproduccion-test/{id}.
 */
export default async function ReproduccionTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const user = await getCurrentUser();
  if (!user) notFound(); // solo logueado

  const { id } = await params;
  return (
    <main className="min-h-svh bg-void px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="mb-4 text-lg font-semibold text-text">Verificación de reproducción</h1>
        <p className="mb-6 text-sm text-text-dim">
          Video <span className="tabular-nums">{id}</span> — pide la URL firmada y la reproduce.
        </p>
        <VerificadorReproduccion id={id} />
      </div>
    </main>
  );
}
