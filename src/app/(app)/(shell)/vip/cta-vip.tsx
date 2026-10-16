"use client";

import { useCallback, useState } from "react";

import { MSG_VIP_PAGO_NO_DISPONIBLE } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

/**
 * EL COLOR DEL CTA, EN UNA LÍNEA Y EN UN SOLO SITIO.
 *
 * Va en ORO porque es la señal de marca del VIP, y porque `--df-action` está reservado a UNA acción
 * por pantalla —"Subir vídeo", el botón de la barra superior—. Pero la decisión está ABIERTA
 * (Sergio): pasarlo al verde de acción es cambiar esta línea por
 * `{ fondo: "var(--df-action)", tinta: "var(--df-void)" }` y nada más. Por eso el par viaja junto:
 * el relleno y su TINTA se eligen a la vez o el texto se queda ilegible sobre el fondo nuevo.
 *
 * LA TINTA ES UN TOKEN Y NO UN COLOR FIJO: sobre el oro de oscuro hace falta tinta oscura (12,89:1)
 * y sobre el oro de claro hace falta blanca (4,69:1) — el mismo valor en los dos temas deja el botón
 * por debajo de AA en uno de ellos. Medido en `MarcaVip`, que usa este mismo par.
 */
const TONO_CTA = { fondo: "var(--vip-gold)", tinta: "var(--vip-tinta)" } as const;

/**
 * HAZTE VIP — el botón que abre el pago de la suscripción.
 *
 * ┌─ SE COMPORTA EXACTAMENTE COMO EL DE COMPRAR UN BOOST ────────────────────────────────────────┐
 * │ Misma condición para poder pulsarlo (pagos configurados + correo verificado, resuelta en el  │
 * │ servidor y comparada con la de Boost en `tests/vip-pagina`), mismo flujo (POST al checkout -> │
 * │ `window.location.assign` a Stripe), mismo tratamiento del fallo (el copy humano del servidor, │
 * │ cero jerga). SIN claves de Stripe —que es el estado de hoy— el botón sale deshabilitado con   │
 * │ su motivo, igual que los tres de Boost: no hay un "estado inerte" propio de esta pantalla que │
 * │ mantener aparte.                                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL CUERPO VA VACÍO. No hay nada que elegir: el plan es uno (`PLAN_VIP`) y el precio lo resuelve el
 * servidor contra `VIP_PRECIO_CENTS`. "El VIP por un dólar" no es algo que esta pantalla impida: es
 * algo que no puede expresar.
 *
 * SALIR A STRIPE ES `window.location.assign`, no el router: el destino es OTRO ORIGEN, y
 * `router.push` no sale del sitio. Es la única navegación de la pantalla que se va de la app.
 */
export function CtaVip({
  puedeSuscribirse,
  motivoBloqueo,
}: {
  /** Falso cuando el pago no se puede intentar: sin Stripe configurado o sin correo verificado. */
  puedeSuscribirse: boolean;
  /** Por qué no se puede, en copy de producto. Lo decide el servidor; aquí solo se enseña. */
  motivoBloqueo?: string | null;
}) {
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suscribirse = useCallback(async () => {
    setError(null);
    setAbriendo(true);
    try {
      const r = await postJsonCsrf<{ url?: string }>("/api/vip/checkout", {});
      if (r.ok && typeof r.data.url === "string") {
        // A Stripe. No se baja `abriendo`: la pestaña se va, y dejar el botón "despierto" medio
        // segundo invita a un segundo clic que abriría una segunda suscripción.
        window.location.assign(r.data.url);
        return;
      }
      setError(mensajeDe(r.data) || MSG_VIP_PAGO_NO_DISPONIBLE);
      setAbriendo(false);
    } catch {
      // Excepción de red, o `postJsonCsrf` lanzando SIN_SESION: el mismo mensaje, que es con lo que
      // el usuario puede hacer algo. El detalle no le sirve de nada.
      setError("No hemos podido conectar. Inténtalo otra vez.");
      setAbriendo(false);
    }
  }, []);

  return (
    <section aria-labelledby="vip-hazte" className="mt-10">
      <h2 id="vip-hazte" className="sr-only">
        Hazte VIP Mythic
      </h2>

      <button
        type="button"
        data-cta-vip
        onClick={() => void suscribirse()}
        disabled={!puedeSuscribirse || abriendo}
        aria-describedby={puedeSuscribirse ? undefined : "vip-bloqueo"}
        className="inline-flex min-h-[52px] items-center justify-center rounded-sm px-7 text-base font-semibold transition-[filter] duration-150 ease-mechanical hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
        style={{
          backgroundColor: TONO_CTA.fondo,
          color: TONO_CTA.tinta,
          boxShadow: `0 0 30px -8px color-mix(in srgb, ${TONO_CTA.fondo} 45%, transparent)`,
        }}
      >
        {abriendo ? "Abriendo el pago…" : "Hazte VIP Mythic"}
      </button>

      {/* SIN CIFRAS: el precio está tres centímetros más arriba, en el hero, y sale de la constante.
          Repetirlo aquí a mano es cómo se acaba con dos precios distintos en la misma pantalla. */}
      <p className="mt-3 text-xs text-text-dim">
        Pago seguro con Stripe. Renovación mensual; cancelas cuando quieras.
      </p>

      {/* EL MOTIVO DEL BLOQUEO, dicho una vez y debajo. El botón deshabilitado ya no promete nada;
          esto es lo que falta para poder usarlo. */}
      {!puedeSuscribirse && motivoBloqueo ? (
        <p
          id="vip-bloqueo"
          className="mt-4 max-w-[52ch] rounded-sm border border-line bg-raised p-4 text-sm text-text-dim"
        >
          {motivoBloqueo}
        </p>
      ) : null}

      {/* `role="alert"` y no `status`: un pago que no se ha podido abrir hay que oírlo, no leerlo si
          pasas por ahí. Y solo existe cuando hay algo que decir. */}
      {error ? (
        <p
          role="alert"
          data-error-suscripcion
          className="mt-4 max-w-[52ch] rounded-sm border p-4 text-sm"
          style={{
            color: "var(--df-alarm)",
            borderColor: "color-mix(in srgb, var(--df-alarm) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--df-alarm) 8%, transparent)",
          }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
