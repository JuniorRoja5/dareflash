import { Boton } from "@/components/ui/boton";
import type { CtaPrincipal } from "@/lib/cta-principal";

/**
 * EL CIERRE DE LA PORTADA (rediseño de /inicio): una franja con UNA acción, para quien ha bajado hasta
 * aquí. Es otra pantalla, lejos del hero, así que su botón de acción no compite con el de arriba (MARCA:
 * una acción principal POR PANTALLA). La acción sale de `ctaPrincipal`, la misma fuente que el hero y la
 * barra: nadie escribe aquí el texto ni el destino a mano.
 *  - `participar` (invitado y participante): a subir su vídeo.
 *  - `portal` (empresa, que solo mira): a SU portal.
 */
export function CierrePortada({ tipo, cta }: { tipo: "participar" | "portal"; cta: CtaPrincipal }) {
  const portal = tipo === "portal";
  return (
    <section
      aria-labelledby="cierre-portada"
      className="relative overflow-hidden rounded-sm border border-line bg-surface/80 p-6 text-center backdrop-blur-sm lg:p-10"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <h2
        id="cierre-portada"
        className="mx-auto max-w-2xl text-2xl text-balance text-text lg:text-4xl"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 820, "wdth" 120',
        }}
      >
        {portal ? "Lleva tu marca a los retos" : "Tu próximo vídeo puede ganar"}
      </h2>
      <p className="mx-auto mt-3 max-w-prose text-sm text-text-dim lg:text-base">
        {portal
          ? "Desde tu portal propones retos con premio y lanzas tu publicidad donde está tu gente."
          : "Elige un reto abierto, sube tu vídeo antes del cierre y deja que vote la comunidad."}
      </p>
      <Boton href={cta.href} variante="principal" className="mt-6 shadow-[var(--df-cta-lift)]">
        {cta.crea ? <span className="text-lg leading-none font-bold">+</span> : null}
        <span>{cta.texto}</span>
      </Boton>
    </section>
  );
}
