"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

/** Los dos estados con los que Stripe nos devuelve. Cualquier otro valor no pinta nada. */
export type EstadoVuelta = "ok" | "cancelada";

/**
 * LA VUELTA DE STRIPE — y el único sitio de la pieza donde era fácil mentir.
 *
 * ┌─ "PAGO RECIBIDO" NO ES "YA TIENES TUS BOOSTS" ────────────────────────────────────────────────┐
 * │ Stripe devuelve al usuario a `success_url` en cuanto cobra, y el webhook que ACREDITA los      │
 * │ boosts llega por otro camino, unos instantes después (o bastante después, si Stripe reintenta).│
 * │ Así que al pintar esta pantalla el saldo PUEDE seguir siendo el de antes.                      │
 * │                                                                                               │
 * │ Decir "se han añadido 5 Boosts" aquí sería afirmar algo que la pantalla no sabe, y que encima  │
 * │ se desmiente a sí misma tres centímetros más arriba, donde el hero enseña el saldo real. Por   │
 * │ eso el mensaje dice lo único que es seguro —el pago se ha recibido— y NO repite un número.     │
 * │ `tests/boosts-vista` exige que este copy no lleve cifras ni diga "añadido/acreditado".         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y POR ESO HAY UN BOTÓN DE ACTUALIZAR. Sin él, la única salida honesta del hueco entre el cobro y
 * el abono es "recarga tú la página". `router.refresh()` es exactamente eso: vuelve a pedir ESTA
 * ruta al servidor sin recargar el documento. No es `navegarDuro` porque no cambia quién eres —esa
 * puerta es solo para entrar y salir— ni `router.push`, que a la misma URL no haría nada.
 *
 * CANCELAR NO ES UN ERROR. Quien cierra el formulario de pago cambió de idea; tratarlo como un fallo
 * (rojo, "no se pudo completar") es decirle que algo se rompió por su culpa. Va en tono neutro.
 */
export function AvisoCompra({ estado }: { estado: EstadoVuelta }) {
  const router = useRouter();
  const [actualizando, setActualizando] = useState(false);

  const actualizar = useCallback(() => {
    setActualizando(true);
    router.refresh();
    // No se vuelve a `false`: el refresco repinta el árbol desde el servidor y este componente se
    // monta de nuevo. Apagarlo a mano con un temporizador sería adivinar cuánto tarda.
  }, [router]);

  if (estado === "cancelada") {
    return (
      <p className="df-rise rounded-sm border border-line bg-raised p-4 text-sm text-text-dim">
        No has completado el pago. No se te ha cobrado nada.
      </p>
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
          Tus Boosts aparecen en el saldo en unos segundos. Si no los ves, actualiza.
        </span>
      </span>
      <button
        type="button"
        onClick={actualizar}
        disabled={actualizando}
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-sm border border-line px-4 text-sm font-semibold text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
      >
        {actualizando ? "Actualizando…" : "Actualizar"}
      </button>
    </div>
  );
}
