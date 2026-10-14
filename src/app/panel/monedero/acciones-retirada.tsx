"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import type { EstadoRetirada } from "@/lib/retirada";

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

  async function mover(hasta: EstadoRetirada) {
    setError(null);
    setOcupado(hasta);
    const r = await postJsonCsrf("/api/panel/monedero/transicion", { retiradaId, hasta });
    setOcupado(null);
    setConfirmando(false);
    if (!r.ok) {
      setError(mensajeDe(r.data) || "No hemos podido mover esa retirada.");
      return;
    }
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
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-dim">
              ¿Rechazar y devolver {importe} al monedero?
            </span>
            <Boton
              variante="peligro"
              onClick={() => void mover("REJECTED")}
              disabled={ocupado !== null}
            >
              {ocupado === "REJECTED" ? "…" : "Sí, rechazar"}
            </Boton>
            <Boton variante="fantasma" onClick={() => setConfirmando(false)}>
              Cancelar
            </Boton>
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
