"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  EMPRESA_NOTA_MAX,
  MSG_MOTIVO_RECHAZO_RETO,
  MotivoRechazoRetoSchema,
  type MotivoRechazoReto,
} from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

/** La MISMA clase que los botones de la ficha de una empresa (`empresas/acciones-empresa`). */
const BOTON =
  "min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:opacity-40";
const CONTROL =
  "min-h-[36px] rounded-sm border border-line bg-raised px-2 text-sm text-text focus:outline-none";

type Panel = "botones" | "rechazo";

/**
 * APROBAR O RECHAZAR UNA PROPUESTA (Fase 9 · P3). Gemelo de `AccionesEmpresa`: mismos botones, mismo
 * formulario de rechazo (motivo que SÍ lee la empresa, nota que NO), mismo tratamiento del doble clic.
 *
 * APROBAR NO PUBLICA, y el botón lo dice: crea el BORRADOR, y el aviso enlaza a él para que el admin
 * ponga lo que es de DareFlash (comisión, nivel, portada) y lo publique con la acción de siempre.
 */
export function AccionesPropuesta({ id, titulo }: { id: string; titulo: string }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("botones");
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRechazoReto>("DATOS_INSUFICIENTES");
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function llamar(url: string, cuerpo: unknown, hecho: string): Promise<void> {
    setEnviando(true);
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ ok?: boolean; cambiado?: boolean }>(url, cuerpo);
      if (r.ok) {
        setAviso({
          tipo: "ok",
          texto: r.data.cambiado ? hecho : "Ya estaba decidida: no se ha vuelto a escribir nada.",
        });
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

  return (
    <div className="w-full sm:w-auto">
      {panel === "rechazo" ? (
        <div role="group" aria-label={`Rechazar «${titulo}»`} className="space-y-2">
          <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
            Motivo (lo verá la empresa)
            <select
              value={motivo}
              className={`mt-1 block w-full font-normal tracking-normal normal-case ${CONTROL}`}
              onChange={(e) => setMotivo(MotivoRechazoRetoSchema.parse(e.target.value))}
            >
              {MotivoRechazoRetoSchema.options.map((m) => (
                <option key={m} value={m}>
                  {MSG_MOTIVO_RECHAZO_RETO[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
            Nota interna (NO la ve la empresa)
            <textarea
              value={nota}
              rows={2}
              maxLength={EMPRESA_NOTA_MAX}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Para el equipo: qué viste."
              className="mt-1 w-full rounded-sm border border-line bg-raised px-2 py-1.5 text-sm font-normal tracking-normal text-text normal-case"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={enviando}
              className={BOTON}
              onClick={() =>
                void llamar(
                  `/api/panel/propuestas/${id}/rechazar`,
                  { motivo, ...(nota.trim() ? { nota: nota.trim() } : {}) },
                  "Rechazada. La empresa ya puede leer el motivo.",
                )
              }
            >
              {enviando ? "Rechazando…" : "Confirmar rechazo"}
            </button>
            <button
              type="button"
              disabled={enviando}
              className={`${BOTON} text-text-dim`}
              onClick={() => setPanel("botones")}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={enviando}
            className={BOTON}
            onClick={() =>
              void llamar(
                `/api/panel/propuestas/${id}/aprobar`,
                {},
                "Aprobada: el borrador del reto ya está creado. Revísalo y publícalo desde su ficha.",
              )
            }
          >
            {enviando ? "Aprobando…" : "Aprobar y crear borrador"}
          </button>
          <button
            type="button"
            disabled={enviando}
            className={`${BOTON} text-text-dim`}
            onClick={() => setPanel("rechazo")}
          >
            Rechazar…
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
