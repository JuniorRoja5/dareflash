"use client";

import { useState } from "react";

import { enlaceVideo } from "@/lib/enlace-comentario";

/**
 * COMPARTIR un vídeo. Era un botón muerto —se pulsaba y no hacía nada— y ahora hace lo único que
 * puede hacer bien: dar el enlace.
 *
 * DOS CAMINOS, Y EL NATIVO PRIMERO. En móvil `navigator.share` abre la hoja del sistema, que es
 * donde la gente ya tiene WhatsApp, Instagram y el resto; reimplementar esa lista con botones
 * sería peor y envejecería mal. Donde no existe —escritorio, casi siempre— se copia el enlace al
 * portapapeles, que es lo que el usuario iba a hacer igualmente.
 *
 * CANCELAR NO ES UN ERROR. Cerrar la hoja de compartir lanza un `AbortError`, y tratarlo como
 * fallo diría "no se pudo compartir" a quien simplemente cambió de idea. Se distingue.
 *
 * SIN CONTADOR, al contrario que el resto del rail. Antes decía `0` siempre, que es una cifra
 * falsa: no hay nada que cuente las veces que se comparte algo. Mejor sin número que con uno que
 * miente — y el día que se cuenten de verdad, el número tendrá de dónde salir.
 *
 * EL ENLACE SALE DE `enlaceVideo`, la misma fuente que usa el deep-link del aviso de comentario.
 * El origen se lee del navegador: es el dominio por el que la persona ha entrado, así que el
 * enlace que comparte funciona desde donde está — sin arrastrar `APP_URL` hasta el cliente.
 */
type Estado = "idle" | "copiado" | "fallo";

export function BotonCompartir({ videoId, titulo }: { videoId: string; titulo?: string | null }) {
  const [estado, setEstado] = useState<Estado>("idle");

  async function compartir(): Promise<void> {
    const url = new URL(enlaceVideo(videoId), window.location.origin).toString();

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, ...(titulo ? { title: titulo } : {}) });
        return;
      } catch (e) {
        // Cerrar la hoja es `AbortError`: no pasó nada malo, no se dice nada.
        if (e instanceof Error && e.name === "AbortError") return;
        // Cualquier otro fallo del compartir nativo cae al portapapeles, que casi siempre funciona.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setEstado("copiado");
      window.setTimeout(() => setEstado("idle"), 2000);
    } catch {
      setEstado("fallo");
      window.setTimeout(() => setEstado("idle"), 3000);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void compartir()}
      aria-label="Compartir"
      className="flex flex-col items-center gap-1"
    >
      <span className="flex h-11 w-11 items-center justify-center text-white lg:text-text lg:hover:text-white">
        <IconoCompartir />
      </span>
      {/* El estado se dice DEBAJO, en el hueco donde el resto de acciones llevan su número, para
          que la columna no se mueva al aparecer.

          `role="status"` SOLO cuando hay algo que anunciar. Una región de estado sirve para avisar
          de un CAMBIO; dejarla puesta en reposo convierte la etiqueta fija del botón en un aviso
          permanente —y con un feed de N vídeos, en N regiones de estado compitiendo—. */}
      <span
        {...(estado === "idle" ? {} : { role: "status" })}
        className="text-2xs font-semibold text-white lg:text-text-dim"
        data-estado={estado}
      >
        {estado === "copiado" ? "Copiado" : estado === "fallo" ? "No se pudo" : "Compartir"}
      </span>
    </button>
  );
}

/** La flecha de salida. Vive aquí desde que el botón es de verdad, no en el rail. */
function IconoCompartir() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
      aria-hidden
    >
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 13v6h14v-6" />
    </svg>
  );
}
