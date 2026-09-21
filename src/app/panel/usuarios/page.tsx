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
import {
  anterior,
  escribirPila,
  leerPila,
  siguiente,
  type Paginacion,
} from "@/lib/paginacion-pila";

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

/** El título de sección del panel, igual que en Notificaciones y DareUp. */
const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

/** Los parámetros que SOBREVIVEN a una navegación dentro de la pantalla. La PAGINACIÓN no. */
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
 * LA PAGINACIÓN ES OBLIGATORIA, no opcional con un valor por defecto. Un `?? PRIMERA` habría sido
 * más cómodo, pero entonces "me olvidé de pensar dónde estoy" y "quiero volver al principio" se
 * escriben igual, y el compilador no puede distinguirlos. Exigiéndola, cada enlace DECLARA su
 * intención: `aqui` para quedarse donde se está, o `PRIMERA` (de `lib/paginacion-pila`) para volver
 * al principio. Un enlace nuevo que se olvide no compila, en vez de heredar en silencio el cursor de
 * una lista que ya no existe. Hoy los tres que hay se quedan, así que `PRIMERA` no aparece abajo.
 *
 * Abrir una FICHA (`u`) conserva la página: mirar a alguien de la página 3 no es cambiar de lista, y
 * devolver al moderador al principio cada vez que pincha una fila es perderle el sitio. (Aunque un
 * cursor se colara donde no toca, `decodificarCursorCuentas` lo rechazaría por no ser de ese orden —
 * esto es el cinturón, aquello los tirantes.)
 *
 * El FORMULARIO de filtros no pasa por aquí: es un GET normal, y lo que no es un campo suyo se cae
 * solo. Eso es lo que hace que aplicar un filtro empiece por la primera página.
 */
function enlace(e: Estado, cambios: Partial<Estado> & { paginacion: Paginacion }): string {
  const p = new URLSearchParams();
  const v = { ...e, ...cambios };
  const nav = cambios.paginacion;
  if (v.q) p.set("q", v.q);
  if (v.orden) p.set("orden", v.orden);
  if (v.rol) p.set("rol", v.rol);
  if (v.estado) p.set("estado", v.estado);
  if (v.u) p.set("u", v.u);
  if (nav.cursor) p.set("cursor", nav.cursor);
  const pila = escribirPila(nav.pila);
  if (pila) p.set("pila", pila);
  const s = p.toString();
  return s ? `/panel/usuarios?${s}` : "/panel/usuarios";
}

const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 100) : "";

const PASO =
  "inline-block min-h-[38px] rounded-sm border border-line px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised";

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
 *
 * SE PASA DE PÁGINA, NO SE "CARGA MÁS": dos controles, Anterior y Siguiente, y ninguno numerado —
 * numerar exige un `COUNT` y un `OFFSET`, que es el diseño que la lista evitó—. Volver atrás no
 * cuesta más que ir: la pila de cursores ya vistos viaja en la URL (ver `lib/paginacion-pila`).
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
  const u = texto(sp["u"]) || null;
  const e: Estado = { q, orden, rol, estado, u };
  // Dónde estamos: la página que se ve y por dónde se llegó. `leerPila` sanea lo que venga de fuera.
  const aqui: Paginacion = { cursor: texto(sp["cursor"]) || null, pila: leerPila(sp["pila"]) };

  const { prisma } = await import("@/server/db/client");
  const { fichaCuenta, listarCuentas } = await import("@/server/services/cuentas-panel");

  const [pagina, ficha] = await Promise.all([
    listarCuentas(prisma, { q, cursor: aqui.cursor, orden, rol, estado }),
    u ? fichaCuenta(prisma, u) : Promise.resolve(null),
  ]);

  // Los DOS controles se derivan de lo que hay, no de un contador: "Anterior" existe si hay de dónde
  // desapilar, y "Siguiente" solo si el servicio dijo que queda algo. Así ninguno lleva a una página
  // vacía, que es lo que pasa cuando la navegación se calcula con un total que puede cambiar.
  const atras = anterior(aqui);
  const adelante = pagina.proximoCursor ? siguiente(aqui, pagina.proximoCursor) : null;

  return (
    <div className="df-rise space-y-8">
      <div>
        <h1 className="text-2xl leading-none text-text" style={ESTILO_TITULO}>
          {S.label}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-text-dim">{S.descripcion}</p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-2">
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

      {ficha ? <Ficha ficha={ficha} rolMira={quienMira.role} /> : null}
      {u && !ficha ? <p className="text-sm text-text-dim">Esa cuenta no existe.</p> : null}

      <section aria-label="Cuentas">
        {/* Buscando, el orden es la RELEVANCIA: decirlo evita el parte de error que no lo es. */}
        <p className="text-2xs text-text-dim">
          {pagina.modo === "busqueda"
            ? "Resultados por relevancia. Aquí salen también las cuentas suspendidas."
            : `Ordenado por: ${ETIQUETA_ORDEN[orden].toLowerCase()}.`}
        </p>

        {pagina.items.length === 0 ? (
          <p className="mt-6 text-sm text-text-dim">
            {/* Estar en una página posterior y no encontrar nada NO es "no hay cuentas": es que se
                acabaron (o que alguien ha cambiado de sitio mientras se hojeaba). Decirlo distinto
                evita que el moderador crea que su filtro no vale. */}
            {aqui.cursor !== null
              ? "No quedan más cuentas por aquí."
              : q === ""
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
                    href={enlace(e, { u: c.id, paginacion: aqui })}
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
                        <span className="block truncate text-2xs text-text-dim">
                          {c.displayName}
                        </span>
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
          </>
        )}

        {/* PASAR DE PÁGINA, no "cargar más": la lista se REEMPLAZA, no se acumula, y la etiqueta lo
            dice. Los controles viven FUERA del `if` de la lista a propósito: si una página posterior
            se queda vacía (alguien dejó de encajar en el filtro mientras se hojeaba), "Anterior"
            tiene que seguir ahí — si no, el moderador se queda encerrado en una pantalla vacía. */}
        {atras || adelante ? (
          <nav aria-label="Paginación" className="mt-6 flex items-center justify-between gap-3">
            {atras ? (
              <Link href={enlace(e, { paginacion: atras })} rel="prev" className={PASO}>
                <span aria-hidden="true">←</span> Anterior
              </Link>
            ) : (
              // Hueco: mantiene "Siguiente" a la derecha en la primera página, sin un botón muerto.
              <span />
            )}
            {adelante ? (
              <Link href={enlace(e, { paginacion: adelante })} rel="next" className={PASO}>
                Siguiente <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
