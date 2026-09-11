"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { NOTIF_DESPLEGABLE, NOTIF_NO_LEIDAS_TOPE } from "@/config/constants";
import { getJson, postJsonCsrf } from "@/lib/cliente-http";
import { haceCuanto, textoBadge } from "@/lib/notificaciones";

import { useNoLeidas } from "../avisos-contexto";
import { useCerrarDesplegable } from "./usar-desplegable";

/** Icono campana inline (trazo 1.6 px, currentColor), misma familia severa que la barra. */
function IconoCampana() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 14 18 8z" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </svg>
  );
}

interface ItemAviso {
  id: string;
  texto: string;
  href: string;
  leida: boolean;
  creadaMs: number;
}

type Carga =
  | { estado: "cargando" }
  | { estado: "error" }
  | { estado: "listo"; items: ItemAviso[]; hayMas: boolean; ahoraMs: number };

/**
 * CAMPANA de avisos de la barra superior (escritorio), con su DESPLEGABLE.
 *
 *  - El BADGE sale del contador COMPARTIDO (`useNoLeidas`, ver `avisos-contexto`): el mismo número que
 *    el icono de Perfil en móvil, y que se refresca solo mientras la pestaña está a la vista. NEUTRO,
 *    como todos los recuentos (la lima es solo dinero). Sin nada nuevo no se pinta; pasado el tope, "99+".
 *  - Al ABRIR se piden los `NOTIF_DESPLEGABLE` avisos más recientes y los que estaban sin leer se
 *    marcan como leídos (POST con CSRF: marcar cambia estado y nunca va por GET); lo que el servidor
 *    dice que queda sin leer va al contador compartido. El punto de "nuevo" se mantiene mientras el
 *    desplegable sigue abierto, para que se vea qué era nuevo.
 *  - Si hay más de los que caben, "Ver todas" lleva a /notificaciones.
 *
 * Solo se monta con sesión: un invitado no tiene avisos, y enseñarle una campana sería maqueta.
 */
export function CampanaNotificaciones() {
  const { noLeidas, fijar } = useNoLeidas();
  const [abierto, setAbierto] = useState(false);
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" });
  const ref = useRef<HTMLDivElement>(null);
  const cerrar = useCallback(() => setAbierto(false), []);
  useCerrarDesplegable(ref, abierto, cerrar);

  async function alternar(): Promise<void> {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    setCarga({ estado: "cargando" });
    try {
      const r = await getJson<{ items: ItemAviso[]; nextCursor: string | null; noLeidas: number }>(
        `/api/notificaciones?limite=${NOTIF_DESPLEGABLE}`,
      );
      if (!r.ok) {
        setCarga({ estado: "error" });
        return;
      }
      setCarga({
        estado: "listo",
        items: r.data.items,
        hayMas: r.data.nextCursor !== null,
        ahoraMs: Date.now(),
      });
      fijar(r.data.noLeidas);

      const vistas = r.data.items.filter((i) => !i.leida).map((i) => i.id);
      if (vistas.length > 0) {
        const m = await postJsonCsrf<{ noLeidas: number }>("/api/notificaciones/leidas", {
          ids: vistas,
        });
        if (m.ok) fijar(m.data.noLeidas);
      }
    } catch {
      setCarga({ estado: "error" });
    }
  }

  const badge = textoBadge(noLeidas, NOTIF_NO_LEIDAS_TOPE);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={badge ? `Notificaciones (${badge} sin leer)` : "Notificaciones"}
        onClick={alternar}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-text-dim transition-colors duration-150 ease-mechanical hover:bg-raised hover:text-text"
      >
        <IconoCampana />
        {badge ? (
          <span className="absolute top-2 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-text-dim px-1 text-2xs font-semibold tabular-nums text-void">
            {badge}
          </span>
        ) : null}
      </button>

      {abierto ? (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-sm border border-line bg-surface shadow-[var(--df-shadow-md)]"
        >
          <p className="border-b border-line px-4 py-3 text-sm font-semibold text-text">
            Notificaciones
          </p>

          {carga.estado === "cargando" ? (
            <p className="px-4 py-6 text-center text-sm text-text-dim">Cargando…</p>
          ) : carga.estado === "error" ? (
            <p role="alert" className="px-4 py-6 text-center text-sm text-text-dim">
              No hemos podido cargar tus avisos. Vuelve a abrir la campana para reintentarlo.
            </p>
          ) : carga.items.length === 0 ? (
            // Vacío = invitación a actuar, no un mensaje triste (brief v2).
            <p className="px-4 py-6 text-center text-sm text-text-dim">
              Aún no tienes avisos. Sube un vídeo o participa en un reto y aquí verás lo que pase.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {carga.items.map((i) => (
                <li key={i.id}>
                  <Link
                    href={i.href}
                    onClick={cerrar}
                    className="flex gap-3 px-4 py-3 transition-colors duration-150 ease-mechanical hover:bg-raised"
                  >
                    {/* Punto de "nuevo": NEUTRO (text-text), no un color de producto. */}
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.leida ? "bg-transparent" : "bg-text"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${i.leida ? "text-text-dim" : "text-text"}`}>
                        {i.leida ? null : <span className="sr-only">Nuevo: </span>}
                        {i.texto}
                      </span>
                      <span className="mt-0.5 block text-2xs text-text-dim">
                        {haceCuanto(i.creadaMs, carga.ahoraMs)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {carga.estado === "listo" && carga.hayMas ? (
            <div className="border-t border-line p-2">
              <Boton
                href="/notificaciones"
                variante="secundario"
                onClick={cerrar}
                className="w-full"
              >
                Ver todas
              </Boton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
