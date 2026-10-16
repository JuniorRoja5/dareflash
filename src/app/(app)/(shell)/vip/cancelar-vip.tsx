"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { Boton } from "@/components/ui/boton";
import { MSG_VIP_CANCELADA_OK, MSG_VIP_PAGO_NO_DISPONIBLE } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

/** Las cuatro caras del botón. `pedida` es terminal: lo que falta lo escribe el webhook. */
type Fase = "reposo" | "confirmando" | "enviando" | "pedida";

/**
 * DARSE DE BAJA — en dos pasos, y sin cortar nada.
 *
 * ┌─ NUNCA DE UN TOQUE ──────────────────────────────────────────────────────────────────────────┐
 * │ Es el mismo criterio que borrar un vídeo o un comentario: una acción que cuesta dinero        │
 * │ deshacer (hay que volver a suscribirse) no se dispara con el clic que se da sin mirar. Va     │
 * │ EN LÍNEA y no en un diálogo: lo que hay que decir cabe en una frase y un modal para esto es   │
 * │ más ceremonia que la decisión.                                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ "BAJA PEDIDA" NO ES "SUSCRIPCIÓN CANCELADA", Y POR ESO NO SE REFRESCA SOLO ─────────────────┐
 * │ Lo que hace la ruta es pedirle a Stripe `cancel_at_period_end`. Quien escribe CANCELADA en    │
 * │ nuestra fila es el WEBHOOK, unos instantes después. Un `router.refresh()` automático al       │
 * │ volver repintaría la tarjeta IGUAL que estaba —todavía "se renueva el…"— y parecería que el   │
 * │ botón no ha hecho nada. Así que se enseña el mensaje del servidor, que dice la verdad del     │
 * │ momento, y se ofrece "Actualizar" para cuando el webhook haya llegado.                         │
 * │                                                                                               │
 * │ Y EL MENSAJE ES EL DEL SERVIDOR, no uno escrito aquí: el caso "ya estaba cancelada" tiene su  │
 * │ propio copy y es la ruta quien sabe en cuál de los dos ha caído.                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL ACCESO NO SE PIERDE, y el texto de confirmación lo dice antes de pulsar: el periodo está
 * pagado y se disfruta entero (`esVipActivo` deja pasar una CANCELADA con la fecha por delante).
 */
export function CancelarVip({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("reposo");
  const [mensaje, setMensaje] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [refrescando, refrescar] = useTransition();

  const confirmar = useCallback(async () => {
    setError(null);
    setFase("enviando");
    try {
      const r = await postJsonCsrf<{ mensaje?: string }>("/api/vip/cancelar", {});
      if (r.ok) {
        setMensaje(typeof r.data.mensaje === "string" ? r.data.mensaje : MSG_VIP_CANCELADA_OK);
        setFase("pedida");
        return;
      }
      setError(mensajeDe(r.data) || MSG_VIP_PAGO_NO_DISPONIBLE);
      setFase("reposo");
    } catch {
      setError("No hemos podido conectar. Inténtalo otra vez.");
      setFase("reposo");
    }
  }, []);

  if (fase === "pedida") {
    return (
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        <p role="status" data-baja-pedida className="max-w-[44ch] text-sm text-text-dim">
          {mensaje}
        </p>
        <Boton
          variante="secundario"
          disabled={refrescando}
          onClick={() => refrescar(() => router.refresh())}
        >
          {refrescando ? "Actualizando…" : "Actualizar"}
        </Boton>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-start gap-3 ${className}`}>
      {fase === "reposo" ? (
        <Boton variante="secundario" onClick={() => setFase("confirmando")}>
          Cancelar suscripción
        </Boton>
      ) : (
        <>
          <p className="max-w-[44ch] text-sm text-text-dim">
            Seguirás siendo VIP Mythic hasta que acabe el periodo que ya has pagado. No hay
            reembolso ni prorrateo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Boton
              variante="peligro"
              disabled={fase === "enviando"}
              onClick={() => void confirmar()}
            >
              {fase === "enviando" ? "Dando de baja…" : "Sí, dar de baja"}
            </Boton>
            <Boton
              variante="secundario"
              disabled={fase === "enviando"}
              onClick={() => setFase("reposo")}
            >
              Seguir siendo VIP
            </Boton>
          </div>
        </>
      )}

      {error ? (
        <p role="alert" data-error-cancelar className="max-w-[44ch] text-sm text-alarm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
