import Link from "next/link";

import { ETIQUETA_ESTADO_EMPRESA, type EstadoEmpresa } from "@/config/constants";
import { EstadoEmpresaSchema } from "@/config/esquemas";
import {
  anterior,
  escribirPila,
  leerPila,
  siguiente,
  type Paginacion,
} from "@/lib/paginacion-pila";
import { etiquetaTipoNegocio } from "@/lib/empresa";
import { nombrePais } from "@/lib/paises";

import { requireSeccion } from "../panel-guard";
import { seccionPorHref } from "../secciones";

import { FichaEmpresa } from "./ficha";
import { fechaPanel } from "@/app/panel/formato-panel";

const S = seccionPorHref("/panel/empresas")!;

export const metadata = { title: "Empresas · Panel" };
// Lee la sesión y consulta según el filtro: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/** Los mismos controles, cabeceras y título que `/panel/usuarios`: es la sección hermana (cola + ficha). */
const CONTROL =
  "min-h-[44px] lg:min-h-[38px] rounded-sm border border-line bg-surface px-3 text-sm text-text focus:outline-none";
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;
const PILDORA =
  "inline-block whitespace-nowrap rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";
const TH = `px-4 py-3 whitespace-nowrap ${CABECERA}`;
const PASO =
  "inline-block min-h-[44px] lg:min-h-[38px] rounded-sm border border-line px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised";

/** Un `?estado=` manipulado no revienta la consulta: se queda en «todas». */
function estadoDe(v: string | string[] | undefined): EstadoEmpresa | null {
  const r = EstadoEmpresaSchema.safeParse(typeof v === "string" ? v : undefined);
  return r.success ? r.data : null;
}

const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 80) : "";

/**
 * El enlace de esta pantalla conservando el estado. La PAGINACIÓN es obligatoria (no opcional con
 * un valor por defecto): así cada enlace DECLARA si se queda donde está o vuelve al principio, en
 * vez de heredar en silencio un cursor que ya no corresponde. Abrir una ficha conserva la página.
 */
function enlace(
  e: { estado: EstadoEmpresa | null; ficha: string | null },
  cambios: { estado?: EstadoEmpresa | null; ficha?: string | null; paginacion: Paginacion },
): string {
  const p = new URLSearchParams();
  const v = { ...e, ...cambios };
  if (v.estado) p.set("estado", v.estado);
  if (v.ficha) p.set("e", v.ficha);
  if (cambios.paginacion.cursor) p.set("cursor", cambios.paginacion.cursor);
  const pila = escribirPila(cambios.paginacion.pila);
  if (pila) p.set("pila", pila);
  const s = p.toString();
  return s ? `/panel/empresas?${s}` : "/panel/empresas";
}

/**
 * EL ESTADO VACÍO DICE QUÉ APARECERÁ AQUÍ Y CUÁNDO, no solo que no hay nada. Una cola vacía sin
 * explicación se lee como «esto no funciona»; una que dice de dónde vienen las filas y cómo te vas a
 * enterar se lee como «todavía no ha pasado».
 */
function TextoVacio({ estado, paginando }: { estado: EstadoEmpresa | null; paginando: boolean }) {
  // En una página posterior, "vacío" es que se acabaron (o que alguien cambió de estado mientras se
  // hojeaba). Decirlo distinto evita que el admin crea que su filtro no vale.
  if (paginando) return <>No quedan más empresas por aquí.</>;
  if (estado === "PENDIENTE") {
    return (
      <>
        No hay ninguna empresa esperando. Cuando alguien se registre desde «Para empresas» aparecerá
        aquí, y te enterarás sin buscarla: por el número junto a «Empresas» en la barra, por el
        indicador de la cabecera y por un correo.
      </>
    );
  }
  if (estado)
    return <>Ninguna empresa en estado «{ETIQUETA_ESTADO_EMPRESA[estado].toLowerCase()}».</>;
  return (
    <>
      Todavía no se ha registrado ninguna empresa. Las que lo hagan desde «Para empresas» llegarán
      pendientes, y no podrán hacer nada en su portal hasta que las verifiques aquí.
    </>
  );
}

/**
 * /panel/empresas — LA COLA DE VERIFICACIÓN y la FICHA de cada empresa.
 *
 * MISMA ESTRUCTURA QUE `/panel/usuarios`, que es la sección hermana: título y descripción de la
 * sección, filtro por GET, la ficha arriba cuando se abre una (`?e=`), la lista, y la paginación. Y
 * los mismos controles y clases. Un admin no tiene que reaprender cada pantalla del panel.
 *
 * TODO POR URL: `?estado=` filtra, `?cursor=`/`?pila=` paginan y `?e=` abre una ficha. Sin estado
 * de cliente no hay nada que se desincronice y un enlace a una ficha se puede pegar en una
 * conversación. La tarjeta del Resumen enlaza aquí con `?estado=PENDIENTE`.
 *
 * LA COLA ES UNA TABLA EN ESCRITORIO y tarjetas en móvil (fase9-diseno): una columna por dato para
 * comparar de un vistazo; a 390 px, cinco columnas no caben sin cortar el nombre.
 *
 * LA DECISIÓN SE TOMA EN LA FICHA, no en la lista: ahí están todos los datos con los que se
 * verifica. La identificación fiscal tampoco sale en la ficha: se pide, y pedirla deja rastro.
 *
 * PAGINADO POR KEYSET, nunca `OFFSET`: «Anterior» tiene que costar lo mismo que «Siguiente» (ver
 * `lib/paginacion-pila`), y los controles viven fuera del `if` de la lista para que una página
 * vacía no encierre a nadie.
 */
export default async function PaginaEmpresas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSeccion("/panel/empresas");
  const sp = await searchParams;

  const estado = estadoDe(sp["estado"]);
  const fichaId = texto(sp["e"]) || null;
  const aqui: Paginacion = { cursor: texto(sp["cursor"]) || null, pila: leerPila(sp["pila"]) };
  const ctx = { estado, ficha: fichaId };

  const { prisma } = await import("@/server/db/client");
  const { fichaEmpresa, listarEmpresas } = await import("@/server/services/empresas");
  const { creditosDeFicha } = await import("@/server/services/creditos");

  // Los créditos de la ficha, en paralelo con ella (Fase 9 · P4): una consulta más solo si hay ficha.
  const [pagina, ficha, creditos] = await Promise.all([
    listarEmpresas(prisma, { estado, cursor: aqui.cursor }),
    fichaId ? fichaEmpresa(prisma, fichaId) : Promise.resolve(null),
    fichaId ? creditosDeFicha(prisma, fichaId) : Promise.resolve(undefined),
  ]);

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

      {/* Un GET normal: aplicar un filtro empieza por la primera página porque el cursor no es un
          campo de este formulario y se cae solo. */}
      <form method="GET" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className={CABECERA}>Estado</span>
          <select name="estado" defaultValue={estado ?? ""} className={CONTROL}>
            <option value="">Todas</option>
            {EstadoEmpresaSchema.options.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_EMPRESA[e]}
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

      {ficha ? <FichaEmpresa ficha={ficha} creditos={creditos} /> : null}
      {fichaId && !ficha ? <p className="text-sm text-text-dim">Esa empresa no existe.</p> : null}

      <section aria-label="Empresas">
        {pagina.items.length === 0 ? (
          <p className="max-w-prose text-sm text-text-dim">
            <TextoVacio estado={estado} paginando={aqui.cursor !== null} />
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-sm border border-line bg-surface/60 md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className={TH}>Empresa</th>
                    <th className={TH}>Contacto</th>
                    <th className={TH}>Negocio</th>
                    <th className={TH}>País</th>
                    <th className={TH}>Alta</th>
                    <th className={TH}>Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pagina.items.map((e) => (
                    <tr
                      key={e.id}
                      data-empresa={e.id}
                      aria-current={e.id === fichaId ? "true" : undefined}
                      className={`transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised ${
                        e.id === fichaId ? "bg-raised" : ""
                      }`}
                    >
                      <td className="max-w-[28ch] px-4 py-3">
                        <Link
                          href={enlace(ctx, { ficha: e.id, paginacion: aqui })}
                          className="block truncate font-medium text-text underline-offset-2 hover:underline"
                        >
                          {e.nombre}
                        </Link>
                      </td>
                      <td className="max-w-[20ch] truncate px-4 py-3 text-text-dim">
                        {e.personaContacto}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-text-dim">
                        {etiquetaTipoNegocio(e.tipoNegocio)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-text-dim">
                        {nombrePais(e.paisIso)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-text-dim tabular-nums">
                        {fechaPanel(e.creadaMs, "numericaFija")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={PILDORA}>{ETIQUETA_ESTADO_EMPRESA[e.estado]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 md:hidden">
              {pagina.items.map((e) => (
                <li key={e.id} data-empresa-movil={e.id}>
                  <Link
                    href={enlace(ctx, { ficha: e.id, paginacion: aqui })}
                    aria-current={e.id === fichaId ? "true" : undefined}
                    className={`block rounded-sm border border-line p-4 transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised ${
                      e.id === fichaId ? "bg-raised" : "bg-surface"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-sm font-medium break-words text-text">
                        {e.nombre}
                      </span>
                      <span className={PILDORA}>{ETIQUETA_ESTADO_EMPRESA[e.estado]}</span>
                    </span>
                    <span className="mt-1 block text-2xs text-text-dim">
                      {etiquetaTipoNegocio(e.tipoNegocio)} · {nombrePais(e.paisIso)} ·{" "}
                      {e.personaContacto} ·{" "}
                      <span className="tabular-nums">{fechaPanel(e.creadaMs, "numericaFija")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* PASAR DE PÁGINA, no "cargar más". Fuera del `if` de la lista a propósito: si una página
            posterior se queda vacía, "Anterior" tiene que seguir ahí. */}
        {atras || adelante ? (
          <nav aria-label="Paginación" className="mt-6 flex items-center justify-between gap-3">
            {atras ? (
              <Link href={enlace(ctx, { paginacion: atras })} rel="prev" className={PASO}>
                <span aria-hidden="true">←</span> Anterior
              </Link>
            ) : (
              <span />
            )}
            {adelante ? (
              <Link href={enlace(ctx, { paginacion: adelante })} rel="next" className={PASO}>
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
