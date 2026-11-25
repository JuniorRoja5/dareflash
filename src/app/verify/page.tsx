import { Suspense } from "react";

import { TextosProvider } from "@/components/textos-provider";
import { textos, textosClienteDeLaPeticion } from "@/textos/servidor";

import { TarjetaVerificacion } from "./tarjeta-verificacion";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("verificar") };
}

/**
 * VERIFICACION de email (/verify) — REHECHA con la identidad v2 (Rama 4). Ruta SUELTA, fuera del
 * grupo (app), sin nav (como /entrar y /unlock): fondo void con glow de acción ambiental y tarjeta
 * glass, mismo lenguaje visual que `/entrar`. Es SOLO un rebrand de superficie: la LOGICA (token
 * NO consumido en el GET, POST a /api/auth/verify tras el clic, estados sin-token/listo/
 * enviando/ok/error) vive intacta en `TarjetaVerificacion`.
 *
 * `useSearchParams` (dentro de `TarjetaVerificacion`) exige un limite de Suspense en el prerender
 * estatico; el fallback usa la misma tarjeta para que no haya salto de layout al resolver.
 */
export default async function VerifyPage() {
  const [t, textosTarjeta] = await Promise.all([
    textos("verificar"),
    textosClienteDeLaPeticion(["formAcceso", "verificar"] as const),
  ]);
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-void px-4 py-10">
      {/* Glow ambiental de marca (muy tenue) detrás de la tarjeta, igual que /entrar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <TextosProvider textos={textosTarjeta}>
        <Suspense fallback={<TarjetaCargando texto={t("cargando")} />}>
          <TarjetaVerificacion />
        </Suspense>
      </TextosProvider>
    </main>
  );
}

function TarjetaCargando({ texto }: { texto: string }) {
  return (
    <div className="df-rise relative w-full max-w-md rounded-lg border border-line bg-surface p-8 shadow-[var(--df-shadow-lg)] sm:p-10">
      <p className="text-sm text-text-dim">{texto}</p>
    </div>
  );
}
