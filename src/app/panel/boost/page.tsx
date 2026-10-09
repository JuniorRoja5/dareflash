import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { BOOST_DAILY_LIMIT, BOOST_DURACION_MIN } from "@/config/constants";
import { duracionBoostHumana } from "@/lib/boost-duracion";
import { nombreMostrado } from "@/lib/identidad";

import { requireSeccion } from "../panel-guard";

import { AjustarCreditos } from "./ajustar-creditos";
import { RetirarDestacado } from "./retirar-destacado";

export const metadata = { title: "Boost · Panel" };
export const dynamic = "force-dynamic";

const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

const TITULO_SECCION = "mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase";

/** Fecha y hora en UTC, como todos los plazos del producto (la zona solo al presentar). */
function cuando(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * BOOST (Fase 6, última pieza): ver quién está destacado, retirar a alguien y ajustar sus créditos.
 *
 * ┌─ LA LISTA NO ES LA DEL ESCAPARATE, Y NO ES UN DETALLE ────────────────────────────────────────┐
 * │ `destacadosVigentes` (portada y /destacados) deduplica por persona. Reusarla aquí haría que   │
 * │ el panel enseñara una aparición de quien encadenó dos y que "retirar" cortara solo esa: el     │
 * │ perfil seguiría en la portada por la otra, sin que nada fallara, y el moderador se iría        │
 * │ convencido de haberlo retirado. Por eso la lista viene de `destacadosPanel`, que agrupa por    │
 * │ persona y trae el RECUENTO, y la acción opera sobre la persona.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL RECUENTO SE ENSEÑA. No es ruido: es lo que explica por qué "retirar" va a expirar tres cosas.
 *
 * LAS CUENTAS SUSPENDIDAS SALEN, MARCADAS. La portada las esconde; si el panel también las
 * escondiera, un moderador que acaba de banear a alguien no tendría forma de ver que el baneo ya lo
 * sacó del escaparate — y la seguiría buscando aquí.
 *
 * SEGURIDAD: `requireSeccion("/panel/boost")`, que lee el rol de `secciones.ts`. Nunca un
 * `requireRole("ADMIN")` escrito aquí: sería una segunda verdad frente a la nav. Los dos endpoints
 * que usa derivan el rol del MISMO sitio.
 */
export default async function BoostPanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSeccion("/panel/boost");

  const sp = await searchParams;
  // TODO POR URL, como el inspector de puntos: `?q=` busca y `?u=` abre la ficha. Sin estado de
  // cliente que se desincronice, y el enlace a una ficha se puede pegar en un hilo.
  const q = typeof sp["q"] === "string" ? sp["q"].trim().slice(0, 100) : "";
  const u = typeof sp["u"] === "string" ? sp["u"] : null;

  const { prisma } = await import("@/server/db/client");
  const { destacadosPanel, fichaBoost } = await import("@/server/services/boost-admin");
  const { buscarUsuarios } = await import("@/server/services/buscar");

  const [destacados, resultados, ficha] = await Promise.all([
    destacadosPanel(prisma),
    q.length >= 2 ? buscarUsuarios(prisma, q, null, 10) : Promise.resolve(null),
    u ? fichaBoost(prisma, u) : Promise.resolve(null),
  ]);

  return (
    <div className="df-rise space-y-10">
      <div>
        <h1 className="text-2xl leading-none text-text" style={ESTILO_TITULO}>
          Boost
        </h1>
        <p className="mt-2 text-sm text-text-dim">
          Las apariciones destacadas que están vigentes ahora mismo, y los créditos de cada usuario.
        </p>
      </div>

      {/* LAS DOS REGLAS QUE EVITAN EL MALENTENDIDO, arriba y a la vista. La primera es la que esta
          pieza existe para no romper; la segunda, el límite de la acción. */}
      <p
        role="note"
        className="max-w-3xl rounded-sm border border-line bg-surface/60 p-4 text-sm text-text-dim"
      >
        <strong className="font-semibold text-text">Retirar actúa sobre la persona.</strong> Expira
        todas sus apariciones vigentes de una vez, no solo la última: alguien puede tener varias si
        ha gastado más de un Boost (hasta {BOOST_DAILY_LIMIT} al día, de{" "}
        {duracionBoostHumana(BOOST_DURACION_MIN)} cada una).{" "}
        <strong className="font-semibold text-text">
          No impide que vuelva a destacarse ni le devuelve el Boost.
        </strong>{" "}
        Para frenar a alguien de verdad, su cuenta se gestiona en{" "}
        <Link href="/panel/usuarios" className="underline underline-offset-2 hover:text-text">
          Usuarios
        </Link>
        .
      </p>

      <section>
        <h2 className={TITULO_SECCION}>Destacados ahora mismo</h2>

        {destacados.length === 0 ? (
          <p className="rounded-sm border border-line bg-surface/40 p-6 text-sm text-text-dim">
            Nadie está destacado en este momento.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-sm border border-line bg-surface/60">
            {destacados.map((d) => (
              <li
                key={d.userId}
                data-destacado-panel={d.username}
                className="flex flex-wrap items-center gap-4 p-4"
              >
                <Avatar nombre={d.username} imagen={d.imagen} tamano="sm" puntos={d.puntos} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">
                    {nombreMostrado(d.displayName, d.username)}{" "}
                    <span className="font-normal text-text-dim">@{d.username}</span>
                  </p>
                  <p className="text-2xs text-text-dim">
                    {/* El RECUENTO primero: es lo que cambia el significado de "retirar". */}
                    <span data-apariciones={d.apariciones} className="tabular-nums text-text">
                      {d.apariciones} {d.apariciones === 1 ? "aparición" : "apariciones"}
                    </span>{" "}
                    · desde {cuando(d.desdeMs)} · se le ve hasta {cuando(d.hastaMs)} (UTC)
                  </p>
                  {d.visible ? null : (
                    <p data-oculto className="text-2xs" style={{ color: "var(--df-time)" }}>
                      No se le ve en la portada: su cuenta está suspendida o borrada.
                    </p>
                  )}
                </div>
                {/* Atajo a su ajuste de créditos: quien está en esta lista está delante, y
                    obligar a buscarlo en el formulario de abajo sería fricción gratis. */}
                <Link
                  href={`/panel/boost?u=${encodeURIComponent(d.userId)}#creditos`}
                  className="text-2xs text-text-dim underline underline-offset-2 hover:text-text"
                >
                  <span className="tabular-nums text-text">{d.saldo}</span> sin gastar
                </Link>
                <RetirarDestacado
                  userId={d.userId}
                  username={d.username}
                  apariciones={d.apariciones}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* AJUSTAR CRÉDITOS A CUALQUIERA, no solo a quien esté destacado. Atarlo a la lista de
          vigientes habría sido cómodo y arbitrario: regalar un Boost a alguien de soporte es justo
          lo que se hace con quien NO está destacado todavía — no tiene con qué. El buscador es el
          mismo motor que el del inspector de puntos. */}
      <section id="creditos">
        <h2 className={TITULO_SECCION}>Créditos de Boost</h2>
        <form
          method="get"
          action="/panel/boost#creditos"
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
                    href={`/panel/boost?q=${encodeURIComponent(q)}&u=${encodeURIComponent(r.id)}#creditos`}
                    aria-current={r.id === u ? "true" : undefined}
                    className={`flex items-center gap-2 rounded-sm border border-line px-3 py-1.5 text-sm transition-colors hover:bg-raised ${
                      r.id === u ? "bg-raised text-text" : "text-text-dim"
                    }`}
                  >
                    <Avatar
                      nombre={r.username ?? "?"}
                      imagen={r.image}
                      tamano="sm"
                      puntos={r.puntos}
                    />
                    @{r.username}
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {u && !ficha ? <p className="mt-4 text-sm text-text-dim">Ese usuario no existe.</p> : null}

        {ficha ? (
          <div className="mt-6">
            <AjustarCreditos
              // La clave incluye el saldo: tras un ajuste, el formulario se rehace limpio en vez de
              // quedarse con la cantidad escrita sobre un saldo que ya cambió.
              key={`${ficha.id}:${ficha.saldo}`}
              userId={ficha.id}
              username={ficha.username}
              saldo={ficha.saldo}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
