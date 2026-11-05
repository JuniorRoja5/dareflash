"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  EMPRESA_NOTA_MAX,
  MSG_MOTIVO_RECHAZO_EMPRESA,
  MotivoRechazoEmpresaSchema,
  type EstadoEmpresa,
  type MotivoRechazoEmpresa,
} from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { puedeDecidirEmpresa } from "@/lib/empresa";

/** La MISMA clase que los botones de la ficha de una cuenta (`usuarios/acciones-cuenta`). */
const BOTON =
  "min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:opacity-40";
const CONTROL =
  "min-h-[36px] rounded-sm border border-line bg-raised px-2 text-sm text-text focus:outline-none";

/**
 * QUÉ SE ESTÁ ENSEÑANDO y SI HAY ALGO EN VUELO son dos cosas distintas, y por eso son dos estados.
 * Con uno solo (`"quieta" | "rechazando" | "enviando"`) pulsar «Confirmar rechazo» ponía la fase en
 * "enviando" y el formulario del motivo DESAPARECÍA a mitad del envío: el admin se quedaba mirando
 * los dos botones de antes sin saber si había pasado algo.
 */
type Panel = "botones" | "rechazo";

/**
 * VERIFICAR O RECHAZAR una empresa. La interfaz de las dos rutas del panel.
 *
 * EL MOTIVO ES OBLIGATORIO PARA RECHAZAR, y se elige de la lista: es lo que va a LEER quien se
 * registró, así que no puede ser texto libre de quien tiene prisa. La NOTA es lo contrario: texto
 * libre, para el equipo, y no sale de la base de datos (ver `Empresa.notaInterna`).
 *
 * Verificar no pide confirmación —es reversible: se puede rechazar después— y rechazar sí pide el
 * motivo, que es su confirmación: no hay forma de rechazar sin decir por qué.
 *
 * `router.refresh()` al terminar: la lista es un componente de servidor y lo que cambió está en la
 * base de datos. No hace falta navegación dura — no cambia quién eres, solo lo que se ve.
 */
export function AccionesEmpresa({
  id,
  nombre,
  estado,
}: {
  id: string;
  nombre: string;
  /** Su estado actual: decide qué botones se ofrecen (`puedeDecidirEmpresa`). */
  estado: EstadoEmpresa;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("botones");
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRechazoEmpresa>("DATOS_INSUFICIENTES");
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
          texto: r.data.cambiado ? hecho : "Ya estaba así: no se ha vuelto a escribir nada.",
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
    // Tras un fallo se queda DONDE ESTABA (con el motivo escrito) para poder reintentar sin
    // volver a elegirlo: repetir la misma llamada no escribe dos veces (ver `rechazarEmpresa`).
    setEnviando(false);
  }

  return (
    // El pie con el filete lo pone la ficha; aquí solo el contenido, alineado a la derecha como en
    // la ficha de una cuenta. El formulario del rechazo ocupa todo el ancho porque es un formulario.
    <div className="w-full sm:w-auto">
      {panel === "rechazo" ? (
        <div role="group" aria-label={`Rechazar ${nombre}`} className="space-y-2">
          <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
            Motivo (lo verá la empresa)
            <select
              value={motivo}
              className={`mt-1 block w-full font-normal tracking-normal normal-case ${CONTROL}`}
              onChange={(e) => setMotivo(MotivoRechazoEmpresaSchema.parse(e.target.value))}
            >
              {MotivoRechazoEmpresaSchema.options.map((m) => (
                <option key={m} value={m}>
                  {MSG_MOTIVO_RECHAZO_EMPRESA[m]}
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
              placeholder="Para el equipo: qué comprobaste."
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
                  `/api/panel/empresas/${id}/rechazar`,
                  { motivo, ...(nota.trim() ? { nota: nota.trim() } : {}) },
                  "Rechazada. Ya puede leer el motivo.",
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
        // SOLO LO QUE HARÍA ALGO (Fase 9 · P4): ya verificada, sin «Verificar»; ya rechazada, sin
        // «Rechazar». Lo decide `puedeDecidirEmpresa`, la MISMA regla que aplica el servidor.
        <div className="flex flex-wrap items-center justify-end gap-2">
          {puedeDecidirEmpresa(estado, "VERIFICAR") ? (
            <button
              type="button"
              disabled={enviando}
              className={BOTON}
              onClick={() =>
                void llamar(
                  `/api/panel/empresas/${id}/verificar`,
                  {},
                  "Verificada. Ya puede operar.",
                )
              }
            >
              {enviando ? "Verificando…" : "Verificar"}
            </button>
          ) : null}
          {puedeDecidirEmpresa(estado, "RECHAZAR") ? (
            <button
              type="button"
              disabled={enviando}
              className={`${BOTON} text-text-dim`}
              onClick={() => setPanel("rechazo")}
            >
              Rechazar…
            </button>
          ) : null}
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
