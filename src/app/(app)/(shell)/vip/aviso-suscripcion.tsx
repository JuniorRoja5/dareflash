"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

/** Los dos estados con los que Stripe nos devuelve. Cualquier otro valor no pinta nada. */
export type EstadoVuelta = "ok" | "cancelada";

/**
 * LA VUELTA DE STRIPE — un MENSAJE, y nada más.
 *
 * ┌─ ESTE PARÁMETRO NO DICE QUE NADIE SEA VIP ───────────────────────────────────────────────────┐
 * │ `?suscripcion=ok` lo pone Stripe en la URL de vuelta, o sea que lo puede poner cualquiera     │
 * │ escribiéndolo en la barra de direcciones. Quién es VIP lo decide SIEMPRE el chokepoint        │
 * │ (`esVipActivo` sobre la suscripción que escribió el webhook), y por eso la tarjeta de "eres   │
 * │ Mythic" de esta página no mira este valor ni una vez. Lo único que hace este aviso es contar  │
 * │ qué acaba de pasar en la pasarela.                                                            │
 * │                                                                                               │
 * │ Y "pago recibido" TAMPOCO es "ya eres VIP": Stripe devuelve al usuario en cuanto cobra, y el  │
 * │ webhook que escribe la suscripción llega por otro camino unos instantes después. Afirmarlo    │
 * │ aquí sería desmentirse a sí mismo un centímetro más abajo, donde la página sigue enseñando el │
 * │ botón de suscribirse.                                                                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ES DE UN SOLO USO: el botón navega al pathname SIN el parámetro (`router.replace`), que hace dos
 * cosas a la vez —quita el aviso para siempre y trae la página fresca del servidor, que es cuando
 * aparece el estado nuevo—. Un `router.refresh()` dejaría `?suscripcion=ok` pegado a la URL y el
 * aviso volvería al recargar. El pendiente va en `useTransition` y no en un `useState` propio: una
 * navegación que solo cambia la query NO remonta el segmento, así que un booleano nuestro se
 * quedaría colgado en `true`. Las dos cosas son errores que ya se cometieron en el aviso de Boost.
 *
 * CANCELAR NO ES UN ERROR. Quien cierra el formulario de pago cambió de idea; pintarlo en rojo le
 * dice que algo se rompió por su culpa.
 */
export function AvisoSuscripcion({ estado }: { estado: EstadoVuelta }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, iniciar] = useTransition();

  const descartar = useCallback(() => {
    iniciar(() => router.replace(pathname, { scroll: false }));
  }, [router, pathname]);

  if (estado === "cancelada") {
    return (
      <div className="df-rise flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-raised p-4 text-sm text-text-dim">
        <span className="min-w-0">No has completado el pago. No se te ha cobrado nada.</span>
        <button
          type="button"
          onClick={descartar}
          disabled={pendiente}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-sm border border-line px-4 text-sm font-semibold text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pendiente ? "Cerrando…" : "Cerrar"}
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="df-rise flex flex-wrap items-center justify-between gap-3 rounded-sm border p-4 text-sm"
      style={{
        borderColor: "color-mix(in srgb, var(--df-ok) 40%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--df-ok) 8%, transparent)",
      }}
    >
      <span className="min-w-0">
        <strong className="font-semibold" style={{ color: "var(--df-ok)" }}>
          Pago recibido.
        </strong>{" "}
        <span className="text-text-dim">
          Tu suscripción se confirma en unos segundos. Si no la ves aquí, actualiza.
        </span>
      </span>
      <button
        type="button"
        onClick={descartar}
        disabled={pendiente}
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-sm border border-line px-4 text-sm font-semibold text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pendiente ? "Actualizando…" : "Actualizar"}
      </button>
    </div>
  );
}
