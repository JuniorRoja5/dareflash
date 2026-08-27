"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CATEGORIES } from "@/config/constants";
import { postJsonCsrf } from "@/lib/cliente-http";
import { centimosAImporte } from "@/lib/dinero";
import type { RetoAdminFila } from "@/server/services/retos-admin";

const NOMBRE_CATEGORIA = new Map<string, string>(
  CATEGORIES.map((c) => [c.key, `${c.emoji} ${c.es}`]),
);
const ETIQUETA_ESTADO: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  CLOSED: "Cerrado",
};

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

function PildoraEstado({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-2xs font-semibold tracking-widest uppercase ${
        status === "PUBLISHED" ? "bg-ok/15 text-ok" : "bg-raised text-text-dim"
      }`}
    >
      {ETIQUETA_ESTADO[status] ?? status}
    </span>
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
}: {
  retos: RetoAdminFila[];
  onEditar: (reto: RetoAdminFila) => void;
}) {
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
                <PildoraEstado status={r.status} />
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
                  {r.status === "DRAFT" ? <Publicar id={r.id} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
