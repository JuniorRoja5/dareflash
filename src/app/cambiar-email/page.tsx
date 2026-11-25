import { Suspense } from "react";

import { TextosProvider } from "@/components/textos-provider";
import { textos, textosClienteDeLaPeticion } from "@/textos/servidor";

import { TarjetaCambioEmail } from "./tarjeta-cambio-email";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("cambiarEmail") };
}

/**
 * CONFIRMACIÓN del cambio de correo (/cambiar-email). Ruta SUELTA, fuera del grupo (app) y sin nav,
 * como /verify y /entrar: quien llega lo hace desde su gestor de correo, no navegando por la app.
 *
 * MISMA mecánica que /verify, y por la misma razón: el token NO se consume en el GET (un prefetch del
 * cliente de correo lo quemaría sin que nadie pulsara), sino en el POST del botón.
 */
export default async function CambiarEmailPage() {
  const textosTarjeta = await textosClienteDeLaPeticion(["cambioEmail", "formAcceso"] as const);
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-void px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <TextosProvider textos={textosTarjeta}>
        <Suspense fallback={null}>
          <TarjetaCambioEmail />
        </Suspense>
      </TextosProvider>
    </main>
  );
}
