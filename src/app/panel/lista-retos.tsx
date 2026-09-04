"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CATEGORIES } from "@/config/constants";
import { postJsonCsrf } from "@/lib/cliente-http";
import { centimosAImporte } from "@/lib/dinero";
import {
  type EstadoRetoAdmin,
  estadoRetoAdmin,
  type RetoAdminFila,
} from "@/server/services/retos-admin";

const NOMBRE_CATEGORIA = new Map<string, string>(
  CATEGORIES.map((c) => [c.key, `${c.emoji} ${c.es}`]),
);
function Publicar({ id }: { id: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "enviando" | "error">("idle");

  async function publicar(): Promise<void> {
    setEstado("enviando");
    try {
      const r = await postJsonCsrf(`/api/panel/retos/${id}/publicar`, {});
      if (r.ok) {
        router.refresh();
        return;
      }
      setEstado("error");
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={publicar}
        disabled={estado === "enviando"}
        className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
      >
        {estado === "enviando" ? "Publicando…" : "Publicar"}
      </button>
      {estado === "error" ? (
        <span role="alert" className="text-xs text-alarm">
          No se pudo publicar.
        </span>
      ) : null}
    </div>
  );
}

function BotonEditar({ onEditar }: { onEditar: () => void }) {
  return (
    <button
      type="button"
      onClick={onEditar}
      className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised"
    >
      Editar
    </button>
  );
}

/**
 * ESTADO REAL, no el de la columna. `status` dice qué QUISO el admin; no en qué punto está el reto
 * ahora. Un reto PUBLISHED cuyo plazo venció seguía pintándose "Publicado" en esta lista, que es
 * justo lo que el admin miraba y no cuadraba con la realidad.
 *
 * El cálculo vive en el servicio (`estadoRetoAdmin`), compartido: si la lista lo dedujera por su
 * cuenta volvería a divergir a la primera.
 */
const PINTURA_ESTADO: Record<EstadoRetoAdmin, { texto: string; clase: string }> = {
  borrador: { texto: "Borrador", clase: "bg-raised text-text-dim" },
  programado: { texto: "Programado", clase: "bg-raised text-text" },
  abierto: { texto: "Abierto", clase: "bg-ok/15 text-ok" },
  cerrado: { texto: "Cerrado", clase: "bg-raised text-text-dim" },
  "en-borrado": { texto: "Se borrará", clase: "bg-alarm/15 text-alarm" },
  borrado: { texto: "Borrado", clase: "bg-alarm/10 text-alarm" },
};

function PildoraEstado({ estado }: { estado: EstadoRetoAdmin }) {
  const { texto, clase } = PINTURA_ESTADO[estado];
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-2xs font-semibold tracking-widest uppercase ${clase}`}
    >
      {texto}
    </span>
  );
}

/** Días que quedan de la gracia, para que el admin sepa cuánto le queda para arrepentirse. */
function diasRestantes(eliminaEnMs: number): number {
  return Math.max(0, Math.ceil((eliminaEnMs - Date.now()) / (24 * 60 * 60 * 1000)));
}

/**
 * BORRAR un reto. La UI PREGUNTA cuál de los dos borrados quiere, en vez de elegir por él: uno es
 * reversible durante 7 días y el otro no, y esa diferencia no puede quedar escondida detrás de un
 * único botón "Eliminar".
 */
function Borrar({ id, onHecho }: { id: string; onHecho: () => void }) {
  const [fase, setFase] = useState<"idle" | "elegir" | "enviando" | "error">("idle");

  async function borrar(forzar: boolean): Promise<void> {
    setFase("enviando");
    try {
      const r = await postJsonCsrf(`/api/panel/retos/${id}/borrar`, { forzar });
      if (r.ok) {
        onHecho();
        return;
      }
      setFase("error");
    } catch {
      setFase("error");
    }
  }

  if (fase === "elegir") {
    return (
      <span className="flex flex-wrap items-center justify-end gap-2 text-2xs">
        <button
          type="button"
          onClick={() => void borrar(false)}
          className="min-h-[32px] rounded-sm border border-line px-2 font-medium text-text transition-colors hover:bg-raised"
        >
          Dejarlo 7 días y borrar
        </button>
        <button
          type="button"
          onClick={() => void borrar(true)}
          className="min-h-[32px] rounded-sm border border-line px-2 font-medium text-alarm transition-colors hover:bg-raised"
        >
          Borrar ya
        </button>
        <button
          type="button"
          onClick={() => setFase("idle")}
          className="min-h-[32px] rounded-sm border border-line px-2 text-text-dim transition-colors hover:bg-raised"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setFase("elegir")}
      disabled={fase === "enviando"}
      className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text-dim transition-colors duration-150 ease-mechanical hover:bg-raised hover:text-alarm disabled:opacity-40"
    >
      {fase === "enviando" ? "Borrando…" : fase === "error" ? "No se pudo" : "Borrar"}
    </button>
  );
}

/** RESTAURAR: solo mientras corre la gracia. Consumado el borrado, el admin ya tuvo su plazo. */
function Restaurar({ id, onHecho }: { id: string; onHecho: () => void }) {
  const [fase, setFase] = useState<"idle" | "enviando" | "error">("idle");
  return (
    <button
      type="button"
      disabled={fase === "enviando"}
      onClick={() => {
        setFase("enviando");
        void postJsonCsrf(`/api/panel/retos/${id}/restaurar`, {})
          .then((r) => (r.ok ? onHecho() : setFase("error")))
          .catch(() => setFase("error"));
      }}
      className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
    >
      {fase === "enviando" ? "Restaurando…" : fase === "error" ? "No se pudo" : "Restaurar"}
    </button>
  );
}

/**
 * Lista de retos del panel como TABLA a ancho completo (pensada para muchos retos, no filas estrechas):
 * columnas Reto, Categoría, Premio (en lima), Cierre, Estado y Acciones (Editar siempre; Publicar en los
 * borradores). En pantallas estrechas la tabla scrollea en su propio contenedor (`overflow-x-auto`), sin
 * romper el layout de la página. Editar delega en el padre (`onEditar`), que precarga el formulario.
 */
export function ListaRetos({
  retos,
  onEditar,
  onCambio,
}: {
  retos: RetoAdminFila[];
  onEditar: (reto: RetoAdminFila) => void;
  /** Tras borrar/restaurar: recarga los datos del servidor (no se adivina el estado en cliente). */
  onCambio: () => void;
}) {
  /** La fila viaja con ms planos (serializables); el cálculo compartido pide Date. */
  const fila = (r: RetoAdminFila) => ({
    status: r.status,
    startsAt: r.startsAt,
    deadline: r.deadline,
    eliminacionProgramadaEn: r.eliminaEnMs === null ? null : new Date(r.eliminaEnMs),
    deletedAt: r.borradoMs === null ? null : new Date(r.borradoMs),
  });

  if (retos.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-surface/40 p-6 text-center text-sm text-text-dim">
        Todavía no hay retos. Crea el primero arriba.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-sm border border-line bg-surface/60">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-2xs tracking-widest text-text-dim uppercase">
            <th className="px-4 py-3 font-semibold">Reto</th>
            <th className="px-4 py-3 font-semibold">Categoría</th>
            <th className="px-4 py-3 text-right font-semibold">Premio</th>
            <th className="px-4 py-3 font-semibold">Cierre</th>
            <th className="px-4 py-3 font-semibold">Estado</th>
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {retos.map((r) => (
            <tr key={r.id} className="align-middle transition-colors hover:bg-raised/40">
              <td className="max-w-[28ch] px-4 py-3">
                <p className="truncate font-medium text-text">{r.title}</p>
                <p className="mt-0.5 font-mono text-2xs tracking-wider text-text-dim">
                  {r.publicCode}
                </p>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-text-dim">
                {NOMBRE_CATEGORIA.get(r.category) ?? r.category}
              </td>
              <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums text-money">
                {centimosAImporte(r.prizeAmountCents)} {r.prizeCurrency}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-text-dim tabular-nums">
                {r.deadline.toLocaleDateString("es-ES", { timeZone: "UTC" })}
              </td>
              <td className="px-4 py-3">
                <PildoraEstado estado={estadoRetoAdmin(fila(r))} />
                {r.eliminaEnMs !== null ? (
                  <p className="mt-1 text-2xs text-text-dim">
                    Quedan {diasRestantes(r.eliminaEnMs)} d
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  {/* Gestionar = moderar sus participaciones y ver sus estadísticas. Va PRIMERO
                      porque es lo que más se hace con un reto ya creado. */}
                  <Link
                    href={`/panel/retos/${r.id}`}
                    className="inline-flex min-h-[36px] items-center rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised"
                  >
                    Gestionar
                  </Link>
                  <BotonEditar onEditar={() => onEditar(r)} />
                  {r.status === "DRAFT" && r.eliminaEnMs === null && r.borradoMs === null ? (
                    <Publicar id={r.id} />
                  ) : null}
                  {/* Un reto EN GRACIA se puede recuperar; uno ya borrado, no: el admin tuvo su plazo
                      y deshacerlo sería otra decisión, con otras consecuencias. */}
                  {r.eliminaEnMs !== null ? (
                    <Restaurar id={r.id} onHecho={onCambio} />
                  ) : r.borradoMs === null ? (
                    <Borrar id={r.id} onHecho={onCambio} />
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
