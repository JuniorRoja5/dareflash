import { Boton } from "@/components/ui/boton";

import { FormularioLogin } from "./formulario-login";

export const metadata = { title: "Iniciar sesión · DareFlash" };

/**
 * INICIAR SESIÓN (/entrar) — ruta SUELTA, fuera del grupo (app), sin nav (como /verify y /unlock).
 * Es el destino al que se manda a un anónimo que intenta una acción protegida (votar, comentar,
 * crear reto, subir vídeo); la plataforma se ve como invitado, pero INTERACTUAR exige entrar.
 *
 * Marca (brief v2): fondo oscuro con glow magenta ambiental; tarjeta glass; en ESCRITORIO, panel de
 * bienvenida oscuro con corte diagonal + el formulario a la derecha. En MÓVIL, solo el formulario
 * (más simple, pero con la misma marca). UNA sola acción magenta = "Iniciar sesión"; "Crear cuenta"
 * es secundario. Sin fotos de stock. El registro y el reset son piezas siguientes (enlaces listos).
 */
export default function EntrarPage() {
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-void px-4 py-10">
      {/* Glow ambiental de marca (muy tenue) detrás de la tarjeta. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--df-glow-accion)" }}
      />

      <div className="df-rise relative w-full max-w-4xl overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--df-shadow-lg)]">
        {/* Panel de bienvenida (SOLO escritorio): oscuro + glow, con el borde derecho en DIAGONAL. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 hidden w-[58%] bg-void lg:block"
          style={{ clipPath: "polygon(0 0, 100% 0, 80% 100%, 0 100%)" }}
        >
          <div className="absolute inset-0" style={{ background: "var(--df-glow-accion)" }} />
        </div>

        <div className="relative grid lg:grid-cols-2">
          {/* Bienvenida (escritorio): invita a registrarse. Va SOBRE el panel oscuro. */}
          <section className="hidden flex-col justify-center gap-4 p-10 lg:flex xl:p-14">
            <h2
              className="text-3xl text-text"
              style={{
                fontFamily: "var(--font-display)",
                fontVariationSettings: '"wght" 760, "wdth" 120',
              }}
            >
              ¿Nuevo por aquí?
            </h2>
            <p className="max-w-[24ch] text-text-dim">
              Únete y compite por premios de verdad. Creas tu cuenta en segundos.
            </p>
            <div>
              <Boton variante="secundario" href="/registro">
                Crear cuenta
              </Boton>
            </div>
          </section>

          {/* Formulario de acceso. */}
          <section className="p-8 sm:p-10 xl:p-14">
            <h1
              className="mb-1.5 text-3xl text-text"
              style={{
                fontFamily: "var(--font-display)",
                fontVariationSettings: '"wght" 780, "wdth" 118',
              }}
            >
              Iniciar sesión
            </h1>
            <p className="mb-6 text-sm text-text-dim">
              Entra para votar, comentar y subir tus retos.
            </p>
            <FormularioLogin />
          </section>
        </div>
      </div>
    </main>
  );
}
