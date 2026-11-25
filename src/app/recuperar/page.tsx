import { TextosProvider } from "@/components/textos-provider";
import { textos, textosClienteDeLaPeticion, textosRicos } from "@/textos/servidor";

import { FormularioRecuperar } from "./formulario-recuperar";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("recuperar") };
}

const estiloDisplay = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 780, "wdth" 118',
} as const;

/**
 * RECUPERAR (/recuperar) — ruta SUELTA, fuera del grupo (app), sin nav (como /entrar, /verify y
 * /unlock). Destino del enlace "He olvidado mi contraseña" de /entrar: pide el correo y, si esa
 * cuenta existe, envía un enlace de un solo uso a /restablecer.
 *
 * Marca (brief v2): fondo void con glow de acción ambiental y tarjeta glass. UNA sola acción principal
 * (la del formulario). La respuesta es UNIFORME (sin enumeración): el mismo mensaje exista o no la
 * cuenta, para no revelar qué direcciones tienen cuenta.
 */
export default async function RecuperarPage() {
  const [t, tr, textosForm] = await Promise.all([
    textos("recuperar"),
    textosRicos("recuperar"),
    textosClienteDeLaPeticion(["formAcceso", "recuperar"] as const),
  ]);
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-void px-4 py-10">
      {/* Glow ambiental de marca (muy tenue) detrás de la tarjeta. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <div className="df-rise relative w-full max-w-md rounded-lg border border-line bg-surface p-8 shadow-[var(--df-shadow-lg)] sm:p-10">
        <h1 className="mb-1.5 text-3xl text-text" style={estiloDisplay}>
          {t("titulo")}
        </h1>
        <p className="mb-6 text-sm text-text-dim">{t("intro")}</p>
        <TextosProvider textos={textosForm}>
          <FormularioRecuperar />
        </TextosProvider>
        <p className="mt-6 text-sm text-text-dim">
          {tr("yaTeAcuerdas", {
            enlace: {
              href: "/entrar",
              className: "rounded-xs font-medium text-text underline underline-offset-2",
            },
          })}
        </p>
      </div>
    </main>
  );
}
