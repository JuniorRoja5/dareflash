import { apartarCuentaEmpresa } from "@/server/auth/solo-participante";
import { TextosProvider } from "@/components/textos-provider";
import { textos, textosClienteDeLaPeticion } from "@/textos/servidor";

import { LanzadorSubida } from "./lanzador-subida";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("crear") };
}
// Lee la sesión (una cuenta de empresa no sube vídeos: va a su portal) -> por petición.
export const dynamic = "force-dynamic";

/**
 * CREAR — "Subir tu vídeo" por libre. La subida vive en el `ModalSubida` reutilizable (mismo modal que
 * usan "Participar" en un reto y otras entradas); esta ruta ofrece el CTA que lo abre sin `challengeId`.
 * Columna centrada de ancho cómodo, con panel en `lg` (glass + sombra suave); en móvil ocupa la columna.
 */
export default async function CrearPage() {
  await apartarCuentaEmpresa();
  const [t, textosSubida] = await Promise.all([
    textos("crear"),
    textosClienteDeLaPeticion(["subida", "categorias"] as const),
  ]);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 lg:px-8 lg:py-12">
      <h1
        className="mb-3 text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        {t("titulo")}
      </h1>
      <p className="mb-6 text-sm text-text-dim">{t("intro")}</p>
      <div className="df-rise lg:rounded-sm lg:border lg:border-line lg:bg-surface/60 lg:p-8 lg:shadow-[var(--df-shadow-md)] lg:backdrop-blur-md">
        <TextosProvider textos={textosSubida}>
          <LanzadorSubida />
        </TextosProvider>
      </div>
    </div>
  );
}
