import { Suspense } from "react";

import { TarjetaCambioEmail } from "./tarjeta-cambio-email";

export const metadata = { title: "Confirmar tu nuevo correo · DareFlash" };

/**
 * CONFIRMACIÓN del cambio de correo (/cambiar-email). Ruta SUELTA, fuera del grupo (app) y sin nav,
 * como /verify y /entrar: quien llega lo hace desde su gestor de correo, no navegando por la app.
 *
 * MISMA mecánica que /verify, y por la misma razón: el token NO se consume en el GET (un prefetch del
 * cliente de correo lo quemaría sin que nadie pulsara), sino en el POST del botón.
 */
export default function CambiarEmailPage() {
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-void px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <Suspense fallback={null}>
        <TarjetaCambioEmail />
      </Suspense>
    </main>
  );
}
