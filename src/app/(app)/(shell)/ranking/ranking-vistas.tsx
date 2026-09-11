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
  /** Top del último reto cerrado CON participaciones, o `null` si no hay ninguno. */
  reto: { titulo: string; codigo: string; top: FilaTopReto[] } | null;
  /** El usuario de la sesión, para resaltar su fila. `null` si no ha entrado. */
  yo: string | null;
}

type Vista = "mensual" | "reto";

/**
 * Etiquetas del conmutador: FUENTE ÚNICA, cortas y FIJAS. El título del reto NO va aquí: metido en el
 * botón hacía una pestaña de ancho variable que enseñaba títulos largos y de prueba. "De qué reto" lo
 * responde la cabecera dentro de su vista (`cabeceraReto`). El copy final es de Junior/Sergio.
 */
export const ETIQUETAS_VISTA: Record<Vista, string> = {
  mensual: "Este mes",
  reto: "Último reto",
};

/**
 * Cabecera de la vista del reto: aquí SÍ va su título, que es donde contesta "de cuál".
 *
 * "Clasificación de", no "Ganadores de": un reto cerrado con participaciones puede no tener ganador
 * (no alcanzó el mínimo, o hay un empate esperando al admin), y aun con ganador la lista es el top por
 * votos, no la lista de premiados. "Ganadores" mentiría en los dos casos.
 */
export function cabeceraReto(titulo: string): string {
  return `Clasificación de «${titulo}»`;
}

/**
 * CLASIFICACIÓN — conmutador (Este mes / Último reto) + PODIO + lista.
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

  // La vista del reto existe SI Y SOLO SI su top tiene a alguien. El servidor ya no manda un reto vacío
  // (ver la página); esto es la segunda guarda, para que ningún dato que llegue pueda producir una
  // pestaña que lleve a la nada.
  const reto = datos.reto && datos.reto.top.length > 0 ? datos.reto : null;

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

        {/* Conmutador NEUTRO (no hay acción: nada de magenta), con etiquetas fijas de fuente única.
            Ancho predecible: no depende de ningún dato. */}
        {reto ? (
          <div
            role="group"
            aria-label="Vista de la clasificación"
            className="inline-flex rounded-sm border border-line bg-surface/60 p-1 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
          >
            {(["mensual", "reto"] as const).map((clave) => (
              <button
                key={clave}
                type="button"
                aria-pressed={vista === clave}
                onClick={() => setVista(clave)}
                className={`min-h-[44px] rounded-xs px-4 text-sm whitespace-nowrap transition-colors duration-150 ease-mechanical ${
                  vista === clave
                    ? "bg-raised font-medium text-text"
                    : "text-text-dim hover:text-text"
                }`}
              >
                {ETIQUETAS_VISTA[clave]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {vista === "mensual" || !reto ? (
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
      ) : (
        <section aria-label={cabeceraReto(reto.titulo)} className="df-rise mt-8">
          {/* Aquí, y solo aquí, el título REAL: la cabecera contesta "de qué reto". Puede ser largo:
              se parte en líneas en vez de estirar nada. */}
          <h2 className="text-lg font-semibold text-balance break-words text-text">
            {cabeceraReto(reto.titulo)}
          </h2>
          <div className="mt-4 overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-md)] backdrop-blur-md">
            {reto.top.length === 0 ? (
              // DEFENSA MUDA: inalcanzable desde el conmutador (sin top no hay pestaña). Se conserva por
              // si otro camino llegara a pintar esta vista con un top vacío: mejor decirlo que un hueco.
              <p className="p-6 text-center text-sm text-text-dim">
                Ese reto cerró sin participaciones publicadas.
              </p>
            ) : (
              reto.top.map((f) => (
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
        </section>
      )}
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
