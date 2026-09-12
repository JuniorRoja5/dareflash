import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";
import { nombreMostrado } from "@/lib/identidad";

import { AjustarPuntos } from "./ajustar-puntos";
import { HistorialPuntos } from "./historial-puntos";
import { RankingMesPanel } from "./ranking-mes-panel";

export const metadata = { title: "DareUp y ranking · Panel" };
export const dynamic = "force-dynamic";

const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

const ESTILO_CIFRA = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 780, "wdth" 118',
} as const;

const TITULO_SECCION = "mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase";

/**
 * DAREUP Y RANKING (Fase 4): ver el ranking del mes, inspeccionar la puntuación de un usuario y
 * ajustarla.
 *
 *  - VER: el ranking del mes sale del mismo `rankingMensual` que la página pública (keyset).
 *  - INSPECTOR: buscar (la búsqueda de usuarios de siempre) -> ficha con puntos y nivel -> historial
 *    real del ledger por keyset. Todo por URL (`?q=` busca, `?u=` abre la ficha): sin estado de cliente
 *    que se desincronice, y el enlace a una ficha se puede compartir.
 *  - AJUSTAR: una fila NUEVA de ledger con motivo, nunca una mutación (ver `dareup-admin.ts`).
 *
 * LA REGLA QUE EVITA EL MALENTENDIDO va arriba y a la vista: el ranking se ordena por VICTORIAS, y
 * ajustar puntos no las toca. Sin ella, el primer "le subí puntos y no sube en el ranking" es un parte
 * de error que no lo es.
 *
 * SEGURIDAD heredada: cuelga de /panel, cuyo layout llama a `protegerPanel()`. Aquí no se comprueba el
 * rol a mano. Los endpoints que usa (ajustar, historial) se protegen ellos mismos.
 */
export default async function DareUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp["q"] === "string" ? sp["q"].trim().slice(0, 100) : "";
  const u = typeof sp["u"] === "string" ? sp["u"] : null;

  const { prisma } = await import("@/server/db/client");
  const { rankingMensual } = await import("@/server/services/ranking");
  const { buscarUsuarios } = await import("@/server/services/buscar");
  const { fichaDareUp, historialPuntos } = await import("@/server/services/dareup-admin");

  const [ranking, resultados, ficha] = await Promise.all([
    rankingMensual(prisma, { limite: 20 }),
    q.length >= 2 ? buscarUsuarios(prisma, q, null, 10) : Promise.resolve(null),
    u ? fichaDareUp(prisma, u) : Promise.resolve(null),
  ]);
  const historial = ficha ? await historialPuntos(prisma, ficha.id) : null;

  return (
    <div className="df-rise space-y-10">
      <div>
        <h1 className="text-2xl leading-none text-text" style={ESTILO_TITULO}>
          DareUp y ranking
        </h1>
        <p className="mt-2 text-sm text-text-dim">
          El ranking del mes y la puntuación de juego (DareUp) de cada usuario.
        </p>
      </div>

      <p
        role="note"
        className="max-w-3xl rounded-sm border border-line bg-surface/60 p-4 text-sm text-text-dim"
      >
        <strong className="font-semibold text-text">Puntos no son victorias.</strong> El ranking del
        mes se ordena por las victorias del mes (retos ganados). Ajustar los puntos de alguien
        cambia su saldo y su nivel, pero no sus victorias ni su puesto en el ranking.
      </p>

      <section>
        <h2 className={TITULO_SECCION}>Ranking del mes</h2>
        <RankingMesPanel filasIniciales={ranking.filas} cursorInicial={ranking.cursor} />
      </section>

      <section id="inspector">
        <h2 className={TITULO_SECCION}>Inspector DareUp</h2>
        <form
          method="get"
          action="/panel/ranking#inspector"
          role="search"
          className="flex max-w-xl flex-wrap gap-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            minLength={2}
            maxLength={100}
            placeholder="Buscar por @usuario o nombre"
            aria-label="Buscar usuario"
            className="min-h-[40px] min-w-0 flex-1 rounded-sm border border-line bg-raised px-3 text-sm text-text"
          />
          <button
            type="submit"
            className="min-h-[40px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors hover:bg-raised"
          >
            Buscar
          </button>
        </form>
        <p className="mt-1 text-2xs text-text-dim">
          Busca entre las cuentas activas (sin borradas ni baneadas).
        </p>

        {resultados ? (
          resultados.items.length === 0 ? (
            <p className="mt-4 text-sm text-text-dim">Nadie coincide con «{q}».</p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-2">
              {resultados.items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/panel/ranking?q=${encodeURIComponent(q)}&u=${encodeURIComponent(r.id)}#inspector`}
                    aria-current={r.id === u ? "true" : undefined}
                    className={`flex items-center gap-2 rounded-sm border border-line px-3 py-1.5 text-sm transition-colors hover:bg-raised ${
                      r.id === u ? "bg-raised text-text" : "text-text-dim"
                    }`}
                  >
                    <Avatar nombre={r.username ?? "?"} imagen={r.image} tamano="sm" />@{r.username}
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {u && !ficha ? <p className="mt-4 text-sm text-text-dim">Ese usuario no existe.</p> : null}

        {ficha && historial ? (
          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center gap-4 rounded-sm border border-line bg-surface/60 p-5">
              <Avatar nombre={ficha.username} imagen={ficha.image} tamano="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-text">
                  {nombreMostrado(ficha.displayName, ficha.username)}
                </p>
                <p className="text-sm text-text-dim">@{ficha.username}</p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-4">
                <p className="text-text-dim">
                  <span
                    className="text-3xl leading-none text-text tabular-nums"
                    style={ESTILO_CIFRA}
                  >
                    {ficha.puntos.toLocaleString("es-ES")}
                  </span>{" "}
                  <span className="text-2xs font-semibold tracking-widest uppercase">puntos</span>
                </p>
                <InsigniaNivel puntos={ficha.puntos} />
              </div>
            </div>

            <AjustarPuntos userId={ficha.id} username={ficha.username} puntos={ficha.puntos} />

            <section aria-label="Historial de puntos">
              <h3 className={TITULO_SECCION}>Historial de puntos</h3>
              {/* La clave cambia con el movimiento más nuevo: tras un ajuste, la lista se rehace. */}
              <HistorialPuntos
                key={`${ficha.id}:${historial.items[0]?.id ?? "vacio"}`}
                userId={ficha.id}
                inicial={historial.items}
                cursorInicial={historial.nextCursor}
              />
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
