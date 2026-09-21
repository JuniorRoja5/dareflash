import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import {
  ESTADOS_CUENTA,
  ORDENES_CUENTAS,
  ROLES_FILTRO,
  estadoCuentaDe,
  ordenCuentasDe,
  rolFiltroDe,
} from "@/lib/cuentas-listado";

import { requireSeccion } from "../panel-guard";
import { seccionPorHref } from "../secciones";

import {
  ETIQUETA_ACTIVA,
  ETIQUETA_ESTADO_FILTRO,
  ETIQUETA_ORDEN,
  ETIQUETA_ROL,
  ETIQUETA_SUSPENDIDA,
  ETIQUETA_TODAS,
  ETIQUETA_TODOS,
} from "./etiquetas";
import { Ficha } from "./ficha";

const S = seccionPorHref("/panel/usuarios")!;

export const metadata = { title: "Usuarios · Panel" };
// Lee la sesión y consulta según los filtros: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

const CONTROL =
  "min-h-[38px] rounded-sm border border-line bg-surface px-3 text-sm text-text focus:outline-none";
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/** Los parámetros que SOBREVIVEN a una navegación dentro de la pantalla. `cursor` NO está aquí. */
interface Estado {
  q: string;
  orden: string;
  rol: string | null;
  estado: string | null;
  u: string | null;
}

/**
 * Construye un enlace de esta pantalla conservando el estado y cambiando lo que se le diga.
 *
 * `cursor` se pasa SIEMPRE explícitamente y nunca se hereda: cambiar de filtro, de orden o de ficha
 * tiene que volver a la primera página. (Aunque se colara, `decodificarCursorCuentas` rechazaría un
 * cursor de otro orden — esto es el cinturón, aquello los tirantes.)
 */
function enlace(e: Estado, cambios: Partial<Estado & { cursor: string | null }> = {}): string {
  const p = new URLSearchParams();
  const v = { ...e, cursor: null, ...cambios };
  if (v.q) p.set("q", v.q);
  if (v.orden) p.set("orden", v.orden);
  if (v.rol) p.set("rol", v.rol);
  if (v.estado) p.set("estado", v.estado);
  if (v.u) p.set("u", v.u);
  if (v.cursor) p.set("cursor", v.cursor);
  const s = p.toString();
  return s ? `/panel/usuarios?${s}` : "/panel/usuarios";
}

const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 100) : "";

/**
 * /panel/usuarios — el CENSO y la ficha de una cuenta.
 *
 * TODO POR URL: `?q=` busca, `?orden=`/`?rol=`/`?estado=` filtran y ordenan, `?cursor=` pagina y `?u=`
 * abre la ficha. Es el mismo patrón que `/panel/ranking`, y no por parecido: sin estado de cliente no
 * hay nada que se desincronice, la vista se puede recargar y un enlace a una ficha concreta se puede
 * pegar en una conversación.
 *
 * SIN TÉRMINO ES UN LISTADO, no una pantalla en blanco. Antes esta página exigía escribir un nombre —
 * "un panel de cuentas no es un volcado del censo"—, y era una respuesta a una pregunta que nadie
 * hacía: para moderar hace falta ver quién se ha dado de alta hoy, quién está suspendido, quién tiene
 * el rol. Paginado por keyset, que es lo que hace barato recorrerlo.
 *
 * EL BUSCADOR ES EL DE VERDAD (`buscarCuentas`, el motor de la app en modo panel), no un prefijo
 * tonto: encuentra por palabra dentro del nombre y entiende que «@yuyu» es el handle `yuyu`.
 *
 * LO QUE NO SALE EN LA LISTA: el email. Ni una dirección en una pantalla que enseña veinticinco
 * cuentas de golpe. Se pide desde la ficha, de una en una, y queda registrado.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const quienMira = await requireSeccion("/panel/usuarios");
  const sp = await searchParams;

  const q = texto(sp["q"]);
  const orden = ordenCuentasDe(sp["orden"]);
  const rol = rolFiltroDe(sp["rol"]);
  const estado = estadoCuentaDe(sp["estado"]);
  const cursor = texto(sp["cursor"]) || null;
  const u = texto(sp["u"]) || null;
  const e: Estado = { q, orden, rol, estado, u };

  const { prisma } = await import("@/server/db/client");
  const { fichaCuenta, listarCuentas } = await import("@/server/services/cuentas-panel");

  const [pagina, ficha] = await Promise.all([
    listarCuentas(prisma, { q, cursor, orden, rol, estado }),
    u ? fichaCuenta(prisma, u) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-semibold text-text">{S.label}</h1>
      <p className="mt-1 max-w-prose text-sm text-text-dim">{S.descripcion}</p>

      <form method="GET" className="mt-6 flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Buscar una cuenta por su nombre de usuario</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="Buscar por @usuario o nombre…"
            className={`block w-full ${CONTROL} py-2 placeholder:text-text-dim`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={CABECERA}>Orden</span>
          <select name="orden" defaultValue={orden} className={CONTROL}>
            {ORDENES_CUENTAS.map((o) => (
              <option key={o} value={o}>
                {ETIQUETA_ORDEN[o]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={CABECERA}>Rol</span>
          <select name="rol" defaultValue={rol ?? ""} className={CONTROL}>
            <option value="">{ETIQUETA_TODOS}</option>
            {ROLES_FILTRO.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={CABECERA}>Estado</span>
          <select name="estado" defaultValue={estado ?? ""} className={CONTROL}>
            <option value="">{ETIQUETA_TODAS}</option>
            {ESTADOS_CUENTA.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_ESTADO_FILTRO[s]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className={`${CONTROL} font-medium transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised`}
        >
          Aplicar
        </button>
      </form>

      {/* Buscando, el orden es la RELEVANCIA: decirlo evita el parte de error que no lo es. */}
      <p className="mt-2 text-2xs text-text-dim">
        {pagina.modo === "busqueda"
          ? "Resultados por relevancia. Aquí salen también las cuentas suspendidas."
          : `Ordenado por: ${ETIQUETA_ORDEN[orden].toLowerCase()}.`}
      </p>

      {ficha ? <Ficha ficha={ficha} rolMira={quienMira.role} /> : null}
      {u && !ficha ? <p className="mt-6 text-sm text-text-dim">Esa cuenta no existe.</p> : null}

      {pagina.items.length === 0 ? (
        <p className="mt-8 text-sm text-text-dim">
          {q === ""
            ? "No hay ninguna cuenta con estos filtros."
            : `No encontramos ninguna cuenta con «${q}».`}
        </p>
      ) : (
        <>
          {/* Las cifras de la derecha no se entienden solas. La cabecera se oculta en móvil, donde
              las filas se apilan y una rejilla de columnas no tiene a qué alinearse. */}
          <p className="mt-6 hidden flex-wrap justify-end gap-3 pr-4 sm:flex">
            <span className={`w-24 text-right ${CABECERA}`}>Alta</span>
            <span className={`w-20 text-right ${CABECERA}`}>Puntos</span>
            <span className={`w-16 text-right ${CABECERA}`}>Ganados</span>
          </p>

          <ul className="mt-2 divide-y divide-line rounded-sm border border-line bg-surface">
            {pagina.items.map((c) => (
              <li key={c.id} data-cuenta={c.id}>
                <Link
                  href={enlace(e, { u: c.id })}
                  aria-current={c.id === u ? "true" : undefined}
                  className={`flex flex-wrap items-center gap-3 p-4 transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised ${
                    c.id === u ? "bg-raised" : ""
                  }`}
                >
                  <Avatar nombre={c.username} imagen={c.image} tamano="sm" perezosa />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">
                      @{c.username}
                    </span>
                    {c.displayName ? (
                      <span className="block truncate text-2xs text-text-dim">{c.displayName}</span>
                    ) : null}
                  </span>
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
                  <span className="w-24 text-right text-2xs text-text-dim tabular-nums">
                    {c.alta.toLocaleDateString("es-ES", { timeZone: "UTC" })}
                  </span>
                  <span className="w-20 text-right text-sm text-text tabular-nums">
                    {c.puntos.toLocaleString("es-ES")}
                  </span>
                  <span className="w-16 text-right text-sm text-text tabular-nums">
                    {c.victorias.toLocaleString("es-ES")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {pagina.proximoCursor ? (
            <p className="mt-6 text-center">
              <Link
                href={enlace(e, { cursor: pagina.proximoCursor })}
                className="inline-block min-h-[38px] rounded-sm border border-line px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised"
              >
                Ver más cuentas
              </Link>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
