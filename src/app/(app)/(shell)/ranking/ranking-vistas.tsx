"use client";

import { useState } from "react";

import { FilaPuesto } from "@/components/ui/fila-puesto";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";
import { getJson } from "@/lib/cliente-http";
import { primerPuestoDeLista } from "@/lib/podio";

import { type FilaPodio, PodioRanking } from "./podio-ranking";

/** Una fila del ranking mensual tal y como llega del servidor. */
export interface FilaRanking extends FilaPodio {
  displayName: string | null;
}

/** Una fila del top del reto: aquí la cifra son VOTOS, que es por lo que está ordenado. */
export interface FilaTopReto {
  submissionId: string;
  userId: string;
  username: string;
  votos: number;
  puesto: number;
}

export interface DatosRanking {
  /** Primera página del mensual, ya resuelta en el servidor. */
  mensual: FilaRanking[];
  cursorInicial: string | null;
  /** Top del reto más reciente que ya cerró, o `null` si todavía no ha cerrado ninguno. */
  reto: { titulo: string; codigo: string; top: FilaTopReto[] } | null;
  /** El usuario de la sesión, para resaltar su fila. `null` si no ha entrado. */
  yo: string | null;
}

type Vista = "mensual" | "reto";

/**
 * CLASIFICACIÓN — conmutador (Mensual / el reto más reciente) + PODIO + lista.
 *
 * PAGINACIÓN POR CURSOR, no por número de página. La versión de maqueta tenía "‹ Página 2 de 7 ›",
 * que es OFFSET disfrazado: exige contar el total y saltar N elementos, y si alguien gana un reto
 * entre página y página los elementos se desplazan y se repiten o se saltan. El servicio pagina por
 * keyset, así que la UI acumula con "Ver más" — el mismo patrón que ya usan el feed y las
 * participaciones de un reto.
 *
 * La CIFRA de cada fila es siempre aquello por lo que está ordenada la lista: victorias en el
 * mensual, votos en el del reto. Los puntos no aparecen como número — alimentan la insignia de nivel,
 * que dice lo mismo sin contradecir el orden.
 */
export function RankingVistas({ datos }: { datos: DatosRanking }) {
  const [vista, setVista] = useState<Vista>("mensual");
  const [filas, setFilas] = useState<FilaRanking[]>(datos.mensual);
  const [cursor, setCursor] = useState<string | null>(datos.cursorInicial);
  const [cargando, setCargando] = useState(false);

  const verMas = async (): Promise<void> => {
    if (!cursor || cargando) return;
    setCargando(true);
    const r = await getJson<{ filas?: FilaRanking[]; cursor?: string | null }>(
      `/api/ranking?cursor=${encodeURIComponent(cursor)}`,
    );
    setCargando(false);
    if (!r.ok || !r.data.filas) return; // un fallo de red no borra lo ya cargado
    setFilas((prev) => [...prev, ...(r.data.filas ?? [])]);
    setCursor(r.data.cursor ?? null);
  };

  const enPodio = vista === "mensual" ? filas.slice(0, 3) : [];
  const desde = primerPuestoDeLista(filas.length);
  const enLista = vista === "mensual" ? filas.slice(desde - 1) : [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1
          className="text-2xl leading-none text-text"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wght" 780, "wdth" 118',
          }}
        >
          Clasificación
        </h1>

        {/* El segundo botón nombra el reto REAL. Un "Top del reto" a secas no dice de cuál, y con
            datos de verdad hay muchos: la etiqueta sin nombre solo funcionaba con una maqueta. */}
        {datos.reto ? (
          <div
            role="group"
            aria-label="Vista de la clasificación"
            className="inline-flex rounded-sm border border-line bg-surface/60 p-1 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
          >
            {(
              [
                { clave: "mensual" as const, etiqueta: "Este mes" },
                { clave: "reto" as const, etiqueta: datos.reto.titulo },
              ] satisfies { clave: Vista; etiqueta: string }[]
            ).map((v) => (
              <button
                key={v.clave}
                type="button"
                aria-pressed={vista === v.clave}
                onClick={() => setVista(v.clave)}
                className={`min-h-[44px] max-w-[16ch] truncate rounded-xs px-4 text-sm transition-colors duration-150 ease-mechanical ${
                  vista === v.clave
                    ? "bg-raised font-medium text-text"
                    : "text-text-dim hover:text-text"
                }`}
              >
                {v.etiqueta}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {vista === "mensual" ? (
        filas.length === 0 ? (
          <VacioHonesto
            titulo="Aún no ha ganado nadie este mes"
            detalle="La clasificación se llena cuando cierra el primer reto. Participa y sé el primero en ganar."
          />
        ) : (
          <>
            <PodioRanking top={enPodio} />
            {enLista.length > 0 ? (
              <div
                aria-label={`Clasificación (del ${desde}º en adelante)`}
                className="df-rise mt-8 overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-md)] backdrop-blur-md"
              >
                {enLista.map((fila, i) => (
                  <FilaPuesto
                    key={fila.userId}
                    puesto={desde + i}
                    username={fila.username}
                    cifra={fila.victorias}
                    unidad={fila.victorias === 1 ? "victoria" : "victorias"}
                    activo={fila.userId === datos.yo}
                    insignia={<InsigniaNivel puntos={fila.puntos} />}
                  />
                ))}
              </div>
            ) : null}
            {cursor ? (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => void verMas()}
                  disabled={cargando}
                  className="min-h-[44px] rounded-sm border border-line bg-surface/60 px-6 text-sm text-text backdrop-blur-md transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-50"
                >
                  {cargando ? "Cargando…" : "Ver más"}
                </button>
              </div>
            ) : null}
          </>
        )
      ) : datos.reto ? (
        <div
          aria-label={`Clasificación de ${datos.reto.titulo}`}
          className="df-rise mt-8 overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-md)] backdrop-blur-md"
        >
          {datos.reto.top.length === 0 ? (
            <p className="p-6 text-center text-sm text-text-dim">
              Ese reto cerró sin participaciones publicadas.
            </p>
          ) : (
            datos.reto.top.map((f) => (
              <FilaPuesto
                key={f.submissionId}
                puesto={f.puesto}
                username={f.username}
                cifra={f.votos}
                unidad={f.votos === 1 ? "voto" : "votos"}
                activo={f.userId === datos.yo}
              />
            ))
          )}
        </div>
      ) : null}
    </>
  );
}

/** Vacío HONESTO: dice que no hay dato y qué hacer, en vez de rellenar con nadie. */
function VacioHonesto({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="df-rise mt-8 rounded-sm border border-line bg-surface/60 p-10 text-center backdrop-blur-md">
      <p className="text-lg font-semibold text-text">{titulo}</p>
      <p className="mx-auto mt-2 max-w-prose text-sm text-text-dim">{detalle}</p>
    </div>
  );
}
