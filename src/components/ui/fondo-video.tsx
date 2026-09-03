"use client";

import { useEffect, useState } from "react";

import { CONSULTA_ESCRITORIO, CONSULTA_MOVIMIENTO, debeMontarVideoFondo } from "@/lib/fondo-video";

/**
 * FONDO DE VÍDEO EN BUCLE — capa decorativa DETRÁS de todo el contenido de una pantalla.
 *
 * ┌─ QUÉ SE PINTA Y CUÁNDO ────────────────────────────────────────────────────────────────────────┐
 * │ SIEMPRE: el TELÓN (fondo `void` + velo con el token `--df-velo-fondo`). Está desde el PRIMER     │
 * │   pintado, así que no hay un fogonazo de fondo vacío mientras el vídeo carga, y es además lo que │
 * │   ven móvil y movimiento-reducido. No hace falta un póster: el telón ya es el fallback.          │
 * │ SOLO EN ESCRITORIO Y SIN MOVIMIENTO REDUCIDO: el <video>, montado TRAS hidratar. En móvil el     │
 * │   elemento no llega a existir, así que sus bytes no se piden nunca (ver `lib/fondo-video`).      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DÓNDE MONTARLO: es `position: fixed`, así que NINGÚN ancestro puede tener `transform`, `filter` ni
 * `overflow: clip` — cualquiera de los tres le crea un bloque contenedor y el `inset-0` deja de ser el
 * viewport. En Inicio eso descarta colgarlo del `<section className="df-rise">` (anima transform) y del
 * contenedor de página (lleva `overflow-x-clip`): va como HERMANO de ambos. Es la misma trampa que nos
 * mordió con la capa del feed del reto.
 *
 * NO COMPITE CON EL CTA: el velo es oscuro y liso, sin glow magenta añadido. El vídeo ya trae sus rayos
 * horneados, y el único magenta de ACCIÓN de la pantalla sigue siendo "Crear reto".
 *
 * `aria-hidden` + `pointer-events-none`: es decoración. Ni la lee un lector de pantalla ni se come un
 * clic del contenido que tiene encima.
 */
export function FondoVideo({ src }: { src: string }) {
  // Arranca en `false` — igual que el servidor. El primer render del cliente coincide con el HTML
  // recibido, así que no hay aviso de hidratación; el vídeo entra en el efecto de después.
  const [conVideo, setConVideo] = useState(false);

  useEffect(() => {
    const escritorio = window.matchMedia(CONSULTA_ESCRITORIO);
    const movimiento = window.matchMedia(CONSULTA_MOVIMIENTO);
    // Se reevalúa al girar el móvil, al redimensionar la ventana y si el usuario cambia su preferencia
    // de movimiento sin recargar: pasar a móvil DESMONTA el vídeo, que es lo coherente con la regla.
    const evaluar = (): void =>
      setConVideo(
        debeMontarVideoFondo({
          escritorio: escritorio.matches,
          permiteMovimiento: movimiento.matches,
        }),
      );
    evaluar();
    escritorio.addEventListener("change", evaluar);
    movimiento.addEventListener("change", evaluar);
    return () => {
      escritorio.removeEventListener("change", evaluar);
      movimiento.removeEventListener("change", evaluar);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-void">
      {conVideo ? (
        <video
          // `muted` + `playsInline` son OBLIGATORIOS para que autoreproduzca: sin `muted` el navegador
          // bloquea el autoplay, y sin `playsInline` iOS se lo lleva a pantalla completa.
          src={src}
          autoPlay
          muted
          loop
          playsInline
          // Sin `poster`: el telón de debajo ya cubre el hueco y un póster sería otro fichero que bajar.
          className="h-full w-full object-cover"
        />
      ) : null}
      {/* VELO por encima del vídeo: es lo que hace legible el contenido. Token, no un rgba a mano. */}
      <div className="absolute inset-0" style={{ background: "var(--df-velo-fondo)" }} />
    </div>
  );
}
