"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ReproductorHls } from "./reproductor-hls";

/**
 * MODAL DE REPRODUCCIÓN — overlay accesible que reproduce UN vídeo sobre la pantalla actual (hoy: la
 * rejilla del perfil). Reutiliza la primitiva `ReproductorHls` variante="detalle" (16:9 escritorio /
 * 9:16 móvil vía `CajaVideo`) y el endpoint FIRMADO `GET /api/videos/{id}/reproduccion`.
 *
 * AUTORIZACIÓN: no vive aquí. El endpoint es público SOLO para vídeos `PUBLISHED`; si responde 404 el
 * vídeo no es reproducible y se muestra "Este vídeo no está disponible" (NUNCA un player roto). El 502
 * (firma caída) cae en el estado de error con reintento.
 *
 * ACCESIBILIDAD: `role="dialog"` + `aria-modal`, título asociado (`aria-labelledby`), cierre por X /
 * Escape / clic en el backdrop, FOCO ATRAPADO dentro del diálogo y devuelto al disparador al cerrar, y
 * bloqueo del scroll del fondo. Móvil: respeta el safe-area.
 */
type Estado =
  | { fase: "cargando" }
  | { fase: "ok"; src: string; poster: string }
  | { fase: "no-disponible" }
  | { fase: "error" };

const SELECTOR_FOCO =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function ModalReproductor({
  id,
  titulo,
  onCerrar,
  participacionVista = null,
  haySesion = false,
}: {
  id: string;
  titulo: string | null;
  onCerrar: () => void;
  /**
   * Participación a marcar como "vista" mientras se reproduce (el gate que exige la ruta de voto).
   * `null` = no marcar: invitado, o una rejilla donde no se vota (perfil). Va TAL CUAL al reproductor.
   */
  participacionVista?: string | null;
  /** ¿Hay sesión? Sin ella no se marca "visto". Va aparte de `participacionVista`: una es del
   *  vídeo y la otra del usuario. Se pasan las dos TAL CUAL al reproductor. */
  haySesion?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);
  const dialogoRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const tituloId = useId();
  const etiqueta = titulo?.trim() ? titulo : "Reproducción del vídeo";

  // Al montar: guarda el foco previo (para DEVOLVERLO al cerrar; el disparador sigue en la rejilla),
  // bloquea el scroll del fondo y lleva el foco al botón de cerrar (primer accionable del diálogo).
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrarRef.current?.focus();
    return () => {
      document.body.style.overflow = scrollPrevio;
      previo?.focus?.();
    };
  }, []);

  // Escape cierra; Tab queda ATRAPADO dentro del diálogo (ciclo de foco).
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCerrar();
        return;
      }
      if (e.key !== "Tab") return;
      const cont = dialogoRef.current;
      if (!cont) return;
      const focos = Array.from(cont.querySelectorAll<HTMLElement>(SELECTOR_FOCO)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (!primero || !ultimo) return;
      const activo = document.activeElement;
      if (e.shiftKey && activo === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    },
    [onCerrar],
  );

  // Carga la URL firmada. 404 -> no-disponible; otro fallo -> error (con reintento).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/videos/${id}/reproduccion`, { credentials: "include" });
        if (!vivo) return;
        if (res.status === 404) {
          setEstado({ fase: "no-disponible" });
          return;
        }
        if (!res.ok) {
          setEstado({ fase: "error" });
          return;
        }
        const { src, poster } = (await res.json()) as { src: string; poster: string };
        if (vivo) setEstado({ fase: "ok", src, poster });
      } catch {
        if (vivo) setEstado({ fase: "error" });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [id, intento]);

  // El modal solo se monta en el cliente tras un clic (nunca en el árbol SSR inicial); aun así se
  // comprueba `document` por robustez antes de crear el portal.
  if (typeof document === "undefined") return null;

  return createPortal(
    // Overlay: backdrop translúcido + desenfoque. El clic en el fondo (no en el panel) cierra.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="df-rise relative w-full max-w-lg lg:max-w-4xl"
      >
        <h2 id={tituloId} className="sr-only">
          {etiqueta}
        </h2>

        <button
          ref={cerrarRef}
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute -top-11 right-0 grid h-9 w-9 place-items-center rounded-full border border-line bg-surface/80 text-text backdrop-blur-md transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised lg:-right-11 lg:top-0"
        >
          <IconoCerrar />
        </button>

        <div className="overflow-hidden rounded-sm border border-line bg-void shadow-[var(--df-shadow-lg)]">
          {estado.fase === "cargando" ? (
            <MensajeCaja>Cargando…</MensajeCaja>
          ) : estado.fase === "no-disponible" ? (
            <MensajeCaja>Este vídeo no está disponible.</MensajeCaja>
          ) : estado.fase === "error" ? (
            <MensajeCaja>
              <span>No se pudo cargar el vídeo. Reintenta.</span>
              <button
                type="button"
                onClick={() => {
                  setEstado({ fase: "cargando" });
                  setIntento((n) => n + 1);
                }}
                className="mt-3 rounded-sm border border-line px-4 py-1.5 text-sm text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised"
              >
                Reintentar
              </button>
            </MensajeCaja>
          ) : (
            <ReproductorHls
              variante="detalle"
              src={estado.src}
              poster={estado.poster}
              participacionVista={participacionVista}
              haySesion={haySesion}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Caja con el MISMO encuadre que el player (9:16 móvil / 16:9 escritorio) para los estados de texto,
 *  de modo que el modal no “salte” de tamaño entre cargando/no-disponible/error y el vídeo. */
function MensajeCaja({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex aspect-[9/16] flex-col items-center justify-center gap-1 p-6 text-center text-sm text-text-dim lg:aspect-video">
      {children}
    </div>
  );
}

/** Aspa de cierre. SVG inline, trazo de marca; nada de librerías de iconos. */
function IconoCerrar() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
