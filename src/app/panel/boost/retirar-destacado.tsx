"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

type Fase = "reposo" | "confirmar" | "enviando";

/**
 * RETIRAR A ALGUIEN DEL ESCAPARATE (solo admin).
 *
 * ┌─ LA ACCIÓN ES SOBRE LA PERSONA, NO SOBRE UNA FILA ────────────────────────────────────────────┐
 * │ El cuerpo lleva `userId` y nada más — no un id de aparición, que es el parámetro que parecía  │
 * │ natural y era la trampa: quien encadenó dos boosts tiene dos apariciones vigentes, y cortar   │
 * │ "la que el panel pinta" dejaría la otra viva. El perfil seguiría en la portada y nada fallaría│
 * │ (sigue siendo visible por la que queda), así que el único que se enteraría mal sería quien     │
 * │ acaba de pulsar este botón.                                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CONFIRMA ANTES, y dice CUÁNTAS apariciones va a expirar: con dos encadenadas, "retirar" no es lo
 * mismo que con una, y quien modera tiene derecho a saber qué está a punto de hacer.
 *
 * Y DICE SU LÍMITE: expira lo de ahora, no impide volver a activar. Quien tenga saldo y cupo puede
 * destacarse otra vez; el freno permanente son los controles de cuenta, no esto. Dejarlo implícito
 * invitaría a usar este botón para algo que no hace.
 */
export function RetirarDestacado({
  userId,
  username,
  apariciones,
}: {
  userId: string;
  username: string;
  /** Cuántas apariciones vigentes se van a expirar. */
  apariciones: number;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("reposo");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function retirar(): Promise<void> {
    setFase("enviando");
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ expiradas?: number }>("/api/panel/boost/retirar", { userId });
      if (r.ok) {
        const n = r.data.expiradas ?? 0;
        setAviso({
          tipo: "ok",
          // El NÚMERO que devuelve el servidor, no el que este componente creía: si entre pintar la
          // lista y pulsar hubiera activado otro, el servidor expira también ese y lo dice.
          texto:
            n === 0
              ? `@${username} ya no estaba destacado.`
              : `Retirado: ${n} ${n === 1 ? "aparición" : "apariciones"} expiradas.`,
        });
        setFase("reposo");
        router.refresh();
        return;
      }
      setAviso({ tipo: "error", texto: mensajeDe(r.data) || "No se pudo retirar." });
    } catch {
      setAviso({ tipo: "error", texto: "No hemos podido conectar. Inténtalo otra vez." });
    }
    setFase("confirmar");
  }

  return (
    <div>
      {fase === "reposo" ? (
        <button
          type="button"
          onClick={() => setFase("confirmar")}
          className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised"
        >
          Retirar del escaparate
        </button>
      ) : (
        <div
          role="group"
          aria-label={`Confirmar retirar a ${username}`}
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-text">
            ¿Retirar a @{username}? Se expiran sus {apariciones}{" "}
            {apariciones === 1 ? "aparición" : "apariciones"}. No se le devuelve el Boost.
          </span>
          <button
            type="button"
            onClick={() => void retirar()}
            disabled={fase === "enviando"}
            className="min-h-[36px] rounded-sm border border-line px-3 font-medium text-text transition-colors hover:bg-raised disabled:opacity-40"
          >
            {fase === "enviando" ? "Retirando…" : "Sí, retirar"}
          </button>
          <button
            type="button"
            onClick={() => setFase("reposo")}
            disabled={fase === "enviando"}
            className="min-h-[36px] rounded-sm border border-line px-3 text-text-dim transition-colors hover:bg-raised disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      )}

      {aviso ? (
        <p
          role={aviso.tipo === "error" ? "alert" : "status"}
          className={`mt-2 text-sm ${aviso.tipo === "error" ? "text-alarm" : "text-text"}`}
        >
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
