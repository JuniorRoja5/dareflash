import { Avatar } from "@/components/ui/avatar";

import { requireSeccion } from "../panel-guard";
import { seccionPorHref } from "../secciones";

import { AccionesCuenta } from "./acciones-cuenta";
import { ETIQUETA_ACTIVA, ETIQUETA_ROL, ETIQUETA_SUSPENDIDA } from "./etiquetas";

const S = seccionPorHref("/panel/usuarios")!;

export const metadata = { title: "Usuarios · Panel" };
// Lee la sesión y consulta según el término: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/**
 * /panel/usuarios — BUSCAR una cuenta y gobernarla.
 *
 * A DIFERENCIA del resto del panel, esta página sí resuelve la sesión: no para comprobar el rol a mano
 * —eso sigue siendo `protegerPanel`, que además es el guard—, sino porque necesita saber QUIÉN MIRA
 * para decidir qué controles ofrecer (`controlesCuenta`). Cuando el panel se abra a los moderadores,
 * esta página ya es correcta: lo que cambia entonces es el rol que llega aquí, no el código.
 *
 * LA BÚSQUEDA ES DIRIGIDA: sin término no se lista nada. Y usa el buscador del PANEL, que encuentra
 * también a las cuentas suspendidas —el buscador público las esconde, que es su trabajo, pero aquí son
 * justo a quienes hay que encontrar—.
 *
 * El formulario es un GET normal: funciona sin JavaScript y la búsqueda queda en la URL, así que se
 * puede compartir o recargar. Las acciones sí son una isla de cliente (`AccionesCuenta`).
 */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const quienMira = await requireSeccion("/panel/usuarios");
  const q = (await searchParams).q?.trim() ?? "";

  const { prisma } = await import("@/server/db/client");
  const { buscarCuentasAdmin } = await import("@/server/services/gobierno-cuentas");
  const cuentas = q === "" ? [] : await buscarCuentasAdmin(prisma, q);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-2xl font-semibold text-text">{S.label}</h1>
      <p className="mt-1 max-w-prose text-sm text-text-dim">{S.descripcion}</p>

      <form method="GET" className="mt-6 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar una cuenta por su nombre de usuario</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por @usuario o nombre…"
            className="block w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="min-h-[38px] shrink-0 rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised"
        >
          Buscar
        </button>
      </form>

      {q === "" ? (
        <p className="mt-8 text-sm text-text-dim">
          Escribe un nombre de usuario para encontrar su cuenta. Aquí salen también las cuentas
          suspendidas, que es donde se les levanta la suspensión.
        </p>
      ) : cuentas.length === 0 ? (
        <p className="mt-8 text-sm text-text-dim">No encontramos ninguna cuenta con «{q}».</p>
      ) : (
        <ul className="mt-6 divide-y divide-line border border-line rounded-sm bg-surface">
          {cuentas.map((c) => (
            <li key={c.id} data-cuenta={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar nombre={c.username} imagen={c.image} tamano="sm" perezosa />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">@{c.username}</p>
                {c.displayName ? (
                  <p className="truncate text-2xs text-text-dim">{c.displayName}</p>
                ) : null}
              </div>
              <span className="rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim">
                {ETIQUETA_ROL[c.rol as keyof typeof ETIQUETA_ROL] ?? ETIQUETA_ROL.USER}
              </span>
              <span
                className={`rounded-xs px-2 py-0.5 text-2xs ${
                  c.suspendida ? "bg-alarm/15 text-alarm" : "text-text-dim"
                }`}
              >
                {c.suspendida ? ETIQUETA_SUSPENDIDA : ETIQUETA_ACTIVA}
              </span>
              <AccionesCuenta
                userId={c.id}
                handle={c.username}
                rolMira={quienMira.role}
                rolDestino={c.rol}
                suspendida={c.suspendida}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
