"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AJUSTE_NOTA_MAX,
  FRASE_RECHAZO,
  MOTIVO_RECHAZO_LIBRE,
  MotivoRechazoSchema,
  type MotivoRechazo,
} from "@/config/constants";
import { Boton } from "@/components/ui/boton";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { validarMotivoRechazo, type EstadoRetirada } from "@/lib/retirada";

/**
 * LOS BOTONES DE UNA RETIRADA. Solo se pintan los estados a los que SE PUEDE ir, y esa lista viene
 * del servidor (`siguientesEstados`), no de un `if` escrito aquí: un botón que el servidor va a
 * rechazar es una promesa que la pantalla no puede cumplir.
 *
 * RECHAZAR PIDE CONFIRMACIÓN. Es la única acción que mueve dinero —lo devuelve— y además lleva a un
 * estado FINAL: no hay deshacer. Las otras tres son anotaciones reversibles por el camino normal.
 */
const ETIQUETA: Record<EstadoRetirada, string> = {
  APPROVED: "Aceptar",
  PROCESSING: "En proceso",
  PAID: "Finalizar",
  REJECTED: "Rechazar",
  PENDING: "Pendiente",
};

/**
 * El nombre CORTO de cada motivo, para el desplegable. La frase larga —la que lee la persona— vive
 * en `FRASE_RECHAZO` y se enseña debajo antes de confirmar: un desplegable con párrafos no se lee.
 */
const ETIQUETA_MOTIVO: Record<MotivoRechazo, string> = {
  RED_INCORRECTA: "La dirección no es de esa red",
  DATOS_BANCARIOS: "Los datos bancarios no funcionan",
  CUENTA_NO_VERIFICADA: "Falta verificar la cuenta",
  SOSPECHA_FRAUDE: "En revisión por actividad sospechosa",
  OTRO: "Otro (lo escribo yo)",
};

export function AccionesRetirada({
  retiradaId,
  siguientes,
  importe,
}: {
  retiradaId: string;
  siguientes: readonly EstadoRetirada[];
  /** Ya formateado: el texto de la confirmación tiene que decir CUÁNTO vuelve. */
  importe: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<EstadoRetirada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRechazo | "">("");
  const [motivoTexto, setMotivoTexto] = useState("");

  const libre = motivo === MOTIVO_RECHAZO_LIBRE;
  const puedeRechazar = validarMotivoRechazo(motivo || null, libre ? motivoTexto : null).ok;

  async function mover(hasta: EstadoRetirada) {
    setError(null);
    setOcupado(hasta);
    const r = await postJsonCsrf("/api/panel/monedero/transicion", {
      retiradaId,
      hasta,
      // El motivo SOLO viaja al rechazar: en el resto el servidor lo rechazaría, y con razón —una
      // razón de rechazo colgando de un "aceptar" acabaría en la pantalla de la persona—.
      ...(hasta === "REJECTED"
        ? { motivo, ...(libre ? { motivoTexto: motivoTexto.trim() } : {}) }
        : {}),
    });
    setOcupado(null);
    if (!r.ok) {
      setError(mensajeDe(r.data) || "No hemos podido mover esa retirada.");
      return;
    }
    setConfirmando(false);
    router.refresh();
  }

  if (siguientes.length === 0) {
    // Estado FINAL: no hay nada que ofrecer, y un botón desactivado sugeriría que sí.
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {siguientes.map((hasta) =>
        hasta === "REJECTED" ? null : (
          <Boton
            key={hasta}
            variante="secundario"
            onClick={() => void mover(hasta)}
            disabled={ocupado !== null}
          >
            {ocupado === hasta ? "…" : ETIQUETA[hasta]}
          </Boton>
        ),
      )}

      {siguientes.includes("REJECTED") ? (
        confirmando ? (
          /* EL MOTIVO SE ELIGE DE UNA LISTA, y es la decisión de la pieza: esta frase la lee la
             persona a la que le estás rechazando su dinero. Un campo libre acaba, un martes con
             prisa, en un "datos mal". La lista garantiza una frase clara y que dice QUÉ HACER;
             "Otro" cubre el caso raro sin abrir la puerta a que lo habitual sea un garabato. */
          <span className="flex w-full flex-col gap-2">
            <span className="text-xs text-text-dim">
              ¿Rechazar y devolver {importe} al monedero? Dile por qué: se lo vamos a enseñar.
            </span>
            <select
              aria-label="Motivo del rechazo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as MotivoRechazo | "")}
              className="min-h-[40px] w-full max-w-md rounded-sm border border-line bg-raised px-3 text-sm text-text"
            >
              <option value="">Elige un motivo…</option>
              {MotivoRechazoSchema.options.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MOTIVO[m]}
                </option>
              ))}
            </select>
            {libre ? (
              <textarea
                aria-label="Motivo escrito"
                value={motivoTexto}
                rows={2}
                maxLength={AJUSTE_NOTA_MAX}
                onChange={(e) => setMotivoTexto(e.target.value)}
                placeholder="Escríbelo como se lo dirías a la persona: lo va a leer tal cual."
                className="w-full max-w-md rounded-sm border border-line bg-raised px-3 py-2 text-sm text-text"
              />
            ) : (
              motivo && (
                // Lo que la persona va a leer, ANTES de pulsar. Es la única forma de que quien
                // rechaza sepa qué está enviando: la lista enseña etiquetas cortas, no la frase.
                <span className="max-w-md text-xs leading-relaxed text-text-dim">
                  Le diremos: «{FRASE_RECHAZO[motivo]}»
                </span>
              )
            )}
            <span className="flex flex-wrap items-center gap-2">
              <Boton
                variante="peligro"
                onClick={() => void mover("REJECTED")}
                disabled={ocupado !== null || !puedeRechazar}
              >
                {ocupado === "REJECTED" ? "…" : "Sí, rechazar"}
              </Boton>
              <Boton variante="fantasma" onClick={() => setConfirmando(false)}>
                Cancelar
              </Boton>
            </span>
          </span>
        ) : (
          <Boton
            variante="fantasma"
            onClick={() => setConfirmando(true)}
            disabled={ocupado !== null}
          >
            Rechazar
          </Boton>
        )
      ) : null}

      {error ? (
        <span role="alert" className="text-xs text-alarm">
          {error}
        </span>
      ) : null}
    </div>
  );
}
