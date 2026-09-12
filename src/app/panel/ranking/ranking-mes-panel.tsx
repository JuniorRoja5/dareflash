"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";
import { getJson } from "@/lib/cliente-http";

/** Una fila del ranking del mes, tal cual la da `rankingMensual` (y `/api/ranking`). */
export interface FilaRankingPanel {
  userId: string;
  username: string;
  displayName: string | null;
  image: string | null;
  victorias: number;
  puntos: number;
}

/**
 * RANKING DEL MES en el panel: el mismo `rankingMensual` que la página pública, por KEYSET ("Ver más"
 * pide la página siguiente a `/api/ranking` con su cursor opaco; nunca OFFSET). Aquí, además de las
 * victorias —que son el ORDEN—, se ven los puntos y el nivel, porque el panel es donde se ajustan; y
 * cada fila abre al usuario en el inspector.
 *
 * Neutra: victorias y puntos son recuentos, no dinero. Nada de lima.
 */
export function RankingMesPanel({
  filasIniciales,
  cursorInicial,
}: {
  filasIniciales: FilaRankingPanel[];
  cursorInicial: string | null;
}) {
  const [filas, setFilas] = useState(filasIniciales);
  const [cursor, setCursor] = useState(cursorInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  async function verMas(): Promise<void> {
    if (!cursor || cargando) return;
    setCargando(true);
    setError(false);
    try {
      const r = await getJson<{ filas?: FilaRankingPanel[]; cursor?: string | null }>(
        `/api/ranking?cursor=${encodeURIComponent(cursor)}`,
      );
      if (!r.ok || !r.data.filas) {
        setError(true);
        return;
      }
      setFilas((previas) => [...previas, ...(r.data.filas ?? [])]);
      setCursor(r.data.cursor ?? null);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  if (filas.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-surface/40 p-6 text-center text-sm text-text-dim">
        Aún no ha ganado nadie este mes: el ranking se llena cuando cierra el primer reto.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-sm border border-line bg-surface/60">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-2xs tracking-widest text-text-dim uppercase">
              <th className="px-4 py-3 text-right font-semibold">#</th>
              <th className="px-4 py-3 font-semibold">Usuario</th>
              <th className="px-4 py-3 text-right font-semibold">Victorias</th>
              <th className="px-4 py-3 text-right font-semibold">Puntos</th>
              <th className="px-4 py-3 font-semibold">Nivel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filas.map((f, i) => (
              <tr key={f.userId}>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/panel/ranking?u=${encodeURIComponent(f.userId)}#inspector`}
                    className="flex min-w-0 items-center gap-2 text-text hover:underline"
                  >
                    <Avatar nombre={f.username} imagen={f.image} tamano="sm" />
                    <span className="truncate">@{f.username}</span>
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-text">
                  {f.victorias.toLocaleString("es-ES")}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-dim">
                  {f.puntos.toLocaleString("es-ES")}
                </td>
                <td className="px-4 py-2.5">
                  <InsigniaNivel puntos={f.puntos} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cursor ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void verMas()}
            disabled={cargando}
            className="min-h-[36px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
          >
            {cargando ? "Cargando…" : "Ver más"}
          </button>
          {error ? (
            <span role="alert" className="text-xs text-alarm">
              No se pudo cargar más. Inténtalo de nuevo.
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
