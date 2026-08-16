"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Boton } from "@/components/ui/boton";
import { delCsrf } from "@/lib/cliente-http";

/**
 * BORRAR MI VÍDEO — botón (esquina de la celda) + diálogo de CONFIRMACIÓN (nunca de un toque). Al
 * confirmar: DELETE /api/videos/[id] (mutatingRoute: Origin + sesión + CSRF). La AUTORIZACIÓN real la
 * pone el endpoint (solo el dueño de la sesión; un vídeo ajeno da 404); aquí es la cara amable. Éxito
 * -> `router.refresh()` y el vídeo desaparece (queda REMOVED, filtrado de la rejilla). Accesible:
 * `role="dialog"`, Escape/backdrop cierran, foco inicial en Cancelar y devuelto al disparador.
 */
export function BorrarVideo({ videoId, titulo }: { videoId: string; titulo: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState("");
  const disparadorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !borrando) setAbierto(false);
    };
    document.addEventListener("keydown", onKey);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = scroll;
      previo?.focus?.();
    };
  }, [abierto, borrando]);

  async function confirmar(): Promise<void> {
    setError("");
    setBorrando(true);
    try {
      const r = await delCsrf(`/api/videos/${encodeURIComponent(videoId)}`);
      if (r.ok) {
        setAbierto(false);
        router.refresh(); // el vídeo (REMOVED) desaparece de la rejilla
        return;
      }
      setError(
        r.status === 401
          ? "Tu sesión ha caducado. Vuelve a iniciar sesión."
          : "No hemos podido borrar el vídeo. Reinténtalo.",
      );
      setBorrando(false);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "SIN_SESION"
          ? "Inicia sesión para borrar el vídeo."
          : "No hemos podido conectar. Inténtalo de nuevo.",
      );
      setBorrando(false);
    }
  }

  const nombre = titulo?.trim() ? `«${titulo}»` : "este vídeo";

  return (
    <>
      <button
        ref={disparadorRef}
        type="button"
        onClick={() => {
          setError("");
          setAbierto(true);
        }}
        aria-label={`Borrar ${nombre}`}
        className="absolute top-1.5 right-1.5 z-10 grid h-8 w-8 place-items-center rounded-full bg-void/70 text-white backdrop-blur-sm transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-alarm"
      >
        <IconoPapelera />
      </button>

      {abierto
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-void/70 p-4 backdrop-blur-sm"
              onClick={() => {
                if (!borrando) setAbierto(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="borrar-video-titulo"
                onClick={(e) => e.stopPropagation()}
                className="df-rise w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-[var(--df-shadow-lg)]"
              >
                <h2 id="borrar-video-titulo" className="text-lg font-semibold text-text">
                  ¿Borrar {nombre}?
                </h2>
                <p className="mt-2 text-sm text-text-dim">
                  Esta acción no se puede deshacer: el vídeo se elimina para siempre.
                </p>
                {error ? (
                  <p role="alert" className="mt-3 text-sm text-alarm">
                    {error}
                  </p>
                ) : null}
                <div className="mt-6 flex justify-end gap-3">
                  <Boton
                    autoFocus
                    type="button"
                    variante="secundario"
                    disabled={borrando}
                    onClick={() => setAbierto(false)}
                  >
                    Cancelar
                  </Boton>
                  <Boton type="button" variante="peligro" disabled={borrando} onClick={confirmar}>
                    {borrando ? "Borrando…" : "Borrar"}
                  </Boton>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Papelera. SVG inline, trazo de marca. */
function IconoPapelera() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 12h10l1-12" />
    </svg>
  );
}
