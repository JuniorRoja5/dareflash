"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ETIQUETA_MOTIVO_RETIRADA_PUBLICIDAD,
  MSG_MOTIVO_RETIRADA_PUBLICIDAD,
  type MotivoRetiradaPublicidad,
  VALORES_MOTIVO_RETIRADA_PUBLICIDAD,
} from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

/** Los mismos botones y controles que las fichas de Empresas y Propuestas: 44 px en móvil. */
const BOTON =
  "min-h-[44px] lg:min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:opacity-40";
const CONTROL =
  "min-h-[44px] lg:min-h-[36px] w-full rounded-sm border border-line bg-raised px-2 text-sm text-text focus:outline-none";

type Panel = "botones" | "retirar";

/**
 * RETIRAR O ABSOLVER UNA CAMPAÑA (Fase 9 · P8). Gemelo de las acciones de Propuestas: un motivo de la
 * lista cerrada que SÍ lee la empresa (se le enseña aquí mismo, tal como lo recibirá) y una nota
 * interna que NO le llega.
 *
 * `puedeRetirar` / `puedeAbsolver` los decide la página con el estado de la campaña: un botón nunca
 * ofrece algo que el servidor va a rechazar.
 */
export function AccionesPublicidad({
  id,
  nombre,
  puedeRetirar,
  puedeAbsolver,
}: {
  id: string;
  nombre: string;
  puedeRetirar: boolean;
  puedeAbsolver: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("botones");
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRetiradaPublicidad>("INCUMPLE_NORMAS");
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function llamar(cuerpo: unknown): Promise<void> {
    setEnviando(true);
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ mensaje?: string }>(`/api/panel/publicidad/${id}`, cuerpo);
      if (r.ok) {
        setAviso({ tipo: "ok", texto: r.data.mensaje ?? "Hecho." });
        setPanel("botones");
        setNota("");
        setEnviando(false);
        router.refresh();
        return;
      }
      setAviso({ tipo: "error", texto: mensajeDe(r.data) || "No se ha podido aplicar." });
    } catch {
      setAviso({ tipo: "error", texto: "No hemos podido conectar. Reinténtalo." });
    }
    setEnviando(false);
  }

  if (!puedeRetirar && !puedeAbsolver) return null;

  return (
    <div className="space-y-3">
      {panel === "botones" ? (
        <div className="flex flex-wrap gap-2">
          {puedeAbsolver ? (
            <button
              type="button"
              className={BOTON}
              disabled={enviando}
              onClick={() => void llamar({ accion: "ABSOLVER" })}
            >
              Absolver
            </button>
          ) : null}
          {puedeRetirar ? (
            <button
              type="button"
              className={`${BOTON} text-alarm`}
              disabled={enviando}
              onClick={() => setPanel("retirar")}
            >
              Retirar…
            </button>
          ) : null}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void llamar({ accion: "RETIRAR", motivo, nota: nota.trim() || undefined });
          }}
        >
          <label className="block space-y-1">
            <span className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
              Motivo (lo recibe la empresa)
            </span>
            <select
              className={CONTROL}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as MotivoRetiradaPublicidad)}
            >
              {VALORES_MOTIVO_RETIRADA_PUBLICIDAD.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MOTIVO_RETIRADA_PUBLICIDAD[m]}
                </option>
              ))}
            </select>
          </label>
          <p className="rounded-sm border border-line bg-raised p-3 text-sm text-text">
            {MSG_MOTIVO_RETIRADA_PUBLICIDAD[motivo]}
          </p>
          <label className="block space-y-1">
            <span className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
              Nota interna (opcional, no la ve la empresa)
            </span>
            <textarea
              className={`${CONTROL} min-h-[88px] py-2`}
              value={nota}
              maxLength={500}
              onChange={(e) => setNota(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${BOTON} text-alarm`} disabled={enviando}>
              {enviando ? "Retirando…" : `Retirar «${nombre}»`}
            </button>
            <button
              type="button"
              className={BOTON}
              disabled={enviando}
              onClick={() => setPanel("botones")}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {aviso ? (
        <p
          role={aviso.tipo === "error" ? "alert" : "status"}
          className={`text-sm ${aviso.tipo === "error" ? "text-alarm" : "text-text"}`}
        >
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
