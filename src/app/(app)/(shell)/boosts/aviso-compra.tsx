"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

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
 * ┌─ Y ES DE UN SOLO USO: SE VA LIMPIANDO LA URL ─────────────────────────────────────────────────┐
 * │ El aviso existe porque está `?compra=ok` en la dirección, así que mientras ese parámetro esté  │
 * │ ahí el aviso vuelve: al recargar, al volver atrás, y seguía puesto aunque el saldo ya          │
 * │ estuviera al día — diciendo "aparecen en unos segundos" sobre unos boosts que ya habían        │
 * │ llegado. La primera versión intentaba arreglarlo con `router.refresh()`, y era el arreglo      │
 * │ equivocado dos veces: no quita el parámetro, y no desmonta nada (ver abajo).                   │
 * │                                                                                               │
 * │ `router.replace(pathname)` hace las dos cosas de una vez:                                      │
 * │   - la página lee `searchParams` como prop, así que se renderiza POR PETICIÓN, y el caché de   │
 * │     cliente no guarda páginas dinámicas (`staleTimes.dynamic` = 0 por defecto): la navegación  │
 * │     vuelve al servidor y trae el saldo fresco, que es lo que el botón prometía;                │
 * │   - al volver sin el parámetro, la página deja de renderizar este aviso y desaparece — y ya no │
 * │     vuelve ni recargando, porque la dirección ya no lo pide.                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL PENDIENTE VA EN `useTransition`, NO EN UN `useState` NUESTRO. Es lo que arregla el botón
 * colgado: el estado se ponía a `true` y nadie lo volvía a bajar, porque `router.refresh()` no
 * remonta el componente. Y cuidado con la tentación de confiar en el desmontaje: la documentación de
 * `router.bfcacheId` dice que una navegación que SOLO cambia la query **no** recrea el segmento, así
 * que el estado de cliente se conserva. Aquí el aviso se va porque el padre deja de renderizarlo, no
 * porque React lo remonte. `useTransition` no depende de ninguna de las dos cosas: baja solo cuando
 * la navegación termina, pase lo que pase con el árbol.
 *
 * CANCELAR NO ES UN ERROR. Quien cierra el formulario de pago cambió de idea; tratarlo como un fallo
 * (rojo, "no se pudo completar") es decirle que algo se rompió por su culpa. Va en tono neutro, y
 * también se puede cerrar: si no, se queda pegado a la URL igual que el otro.
 */
export function AvisoCompra({ estado }: { estado: EstadoVuelta }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, iniciar] = useTransition();

  /**
   * Quita `?compra=` de la dirección. El destino sale de `usePathname`, no escrito a mano: si esta
   * pantalla cambia de sitio, el botón sigue llevando a donde está y no a donde estaba.
   *
   * `scroll: false` porque esto no es ir a otra pantalla: es la misma, sin el parámetro. Subir al
   * principio daría un salto que nadie ha pedido.
   */
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
          Tus Boosts aparecen en el saldo en unos segundos. Si no los ves, actualiza.
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
