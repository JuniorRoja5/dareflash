"use client";

import { useState } from "react";

import { formatearContador } from "@/components/feed/feed-datos";
import { delCsrf, postJsonCsrf } from "@/lib/cliente-http";
import { navegarDuro } from "@/lib/navegacion-dura";

/**
 * ME GUSTA — corazón del rail del feed.
 *
 * OPTIMISTA Y CON VUELTA ATRÁS: el corazón cambia al instante y el número con él; si el servidor
 * dice que no, vuelve a como estaba. Esperar la ida y vuelta para un like es lo que hace que una
 * app se sienta lenta, y aquí el coste de equivocarse es un corazón que se apaga solo.
 *
 * SIN ESTADO COMPARTIDO, al contrario que el voto. El voto necesitaba un registro global porque la
 * regla es "uno por RETO": votar aquí quita el voto de allí, y dos botones distintos hablan del
 * mismo dato. Un like es del VÍDEO y de nadie más, así que no hay dos sitios que contradecirse y
 * el estado local es la respuesta correcta, no una simplificación.
 *
 * UN CANDADO MIENTRAS VUELA: sin él, el doble clic manda POST y DELETE a la vez y el que conteste
 * el último decide — con el contador ya movido dos veces en la pantalla. Con el candado, el
 * segundo clic no sale hasta que el primero responde.
 */
export function BotonLike({
  videoId,
  likes,
  miLike,
  haySesion,
  esMio = false,
}: {
  videoId: string;
  /** Recuento que trajo el payload. El delta de TU acción se le suma encima. */
  likes: number;
  /** ¿Le había dado ya? Del payload; `false` para un invitado. */
  miLike: boolean;
  haySesion: boolean;
  /** Es tuyo: no se puede dar like (el servidor responde PROPIO). */
  esMio?: boolean;
}) {
  const [dado, setDado] = useState(miLike);
  const [delta, setDelta] = useState(0);
  const [enCurso, setEnCurso] = useState(false);

  const mostrados = Math.max(0, likes + delta);
  // A un invitado NO se le esconde el corazón: ver que existe es parte de entender el producto.
  // Lo que no puede es actuar — se le manda a entrar, igual que con el voto.
  const deshabilitado = esMio || enCurso;

  async function alternar(): Promise<void> {
    if (deshabilitado) return;
    if (!haySesion) {
      // La vuelta se lee AQUÍ y con su query, no de una prop: es la ruta en la que el usuario está
      // de verdad, y ninguna pantalla puede equivocarse al pasarla. Siempre local, así que no abre
      // un open-redirect. Y va en DURO (`navegarDuro`): el router de cliente guarda lo precargado
      // como invitado y devolvería al logueado al login.
      const vuelta = window.location.pathname + window.location.search;
      navegarDuro(`/entrar?siguiente=${encodeURIComponent(vuelta)}`);
      return;
    }
    const antes = dado;
    setEnCurso(true);
    // Optimismo ANTES de la petición: el corazón responde al dedo, no a la red.
    setDado(!antes);
    setDelta((d) => d + (antes ? -1 : 1));
    try {
      const url = `/api/videos/${encodeURIComponent(videoId)}/like`;
      const r = antes ? await delCsrf(url) : await postJsonCsrf(url, {});
      if (!r.ok) {
        setDado(antes);
        setDelta((d) => d + (antes ? 1 : -1));
      }
    } catch {
      setDado(antes);
      setDelta((d) => d + (antes ? 1 : -1));
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void alternar()}
      disabled={esMio}
      aria-pressed={dado}
      aria-label={`${dado ? "Quitar me gusta" : "Me gusta"} (${formatearContador(mostrados)})`}
      className="flex flex-col items-center gap-1 disabled:opacity-40"
    >
      <span className="flex h-11 w-11 items-center justify-center text-white lg:text-text lg:hover:text-white">
        <IconoCorazon relleno={dado} />
      </span>
      <span className="text-2xs font-medium tabular-nums text-white lg:text-text-dim">
        {formatearContador(mostrados)}
      </span>
    </button>
  );
}

/**
 * El corazón. RELLENO cuando es tuyo y de CONTORNO cuando no: la forma cambia, no solo el color,
 * porque quien no distingue bien los tonos tiene que poder saber si ya lo ha dado. El relleno usa
 * `--df-action` —es una acción— y solo cuando está puesto, así que sigue habiendo un acento por
 * pantalla: el del botón que de verdad has pulsado.
 */
function IconoCorazon({ relleno }: { relleno: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={relleno ? "var(--df-action)" : "none"}
      stroke={relleno ? "var(--df-action)" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
      aria-hidden
    >
      <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13z" />
    </svg>
  );
}
