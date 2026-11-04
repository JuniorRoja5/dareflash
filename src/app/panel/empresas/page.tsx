import { PasosKeyset } from "@/components/ui/pasos-keyset";
import {
  ETIQUETA_ESTADO_EMPRESA,
  ETIQUETA_TIPO_CUENTA,
  ETIQUETA_TIPO_NEGOCIO,
  EstadoEmpresaSchema,
  MSG_MOTIVO_RECHAZO_EMPRESA,
  type EstadoEmpresa,
} from "@/config/constants";
import { alcancesPermitidos } from "@/lib/empresa";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";

import { requireSeccion } from "../panel-guard";
import { seccionPorHref } from "../secciones";

import { AccionesEmpresa } from "./acciones-empresa";

const S = seccionPorHref("/panel/empresas")!;

export const metadata = { title: "Empresas · Panel" };
// Lee la sesión y consulta según el filtro: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;
const FECHA = { day: "2-digit", month: "2-digit", year: "numeric" } as const;

/** Un `?estado=` manipulado no revienta la consulta: se queda en «todas». */
function estadoDe(v: string | string[] | undefined): EstadoEmpresa | null {
  const r = EstadoEmpresaSchema.safeParse(typeof v === "string" ? v : undefined);
  return r.success ? r.data : null;
}

const PILDORA = "rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";

/**
 * /panel/empresas — LA COLA DE VERIFICACIÓN.
 *
 * TODO POR URL, como el resto del panel: `?estado=` filtra y `?cursor=`/`?pila=` paginan. Sin estado
 * de cliente no hay nada que se desincronice y un enlace a la cola se puede pegar en una
 * conversación.
 *
 * PAGINADO POR KEYSET, nunca `OFFSET`: la lista crece y «Anterior» tiene que costar lo mismo que
 * «Siguiente» (ver `lib/paginacion-pila`). Los controles van FUERA del `if` de la lista, para que
 * una página posterior que se quede vacía no encierre a nadie.
 *
 * LO QUE SÍ SE VE AQUÍ y no en el portal: la nota interna. Y lo que NO se ve en ningún sitio: el
 * correo del dueño. El panel no pinta direcciones en un listado de veinticinco (su única puerta es
 * la ficha de la cuenta, que escribe `AuditLog`), y una lista de empresas no puede ser la rendija
 * que se lo salta.
 *
 * QUÉ PUEDE COMPRAR cada una sale de `alcancesPermitidos`, la misma función pura que aplicará la
 * ruta que cree campañas. Está aquí porque es lo que necesita saber quien verifica: una marca
 * personal que pide verificarse para anunciar «su ciudad» no va a poder, y conviene verlo antes.
 */
export default async function PaginaEmpresas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSeccion("/panel/empresas");
  const sp = await searchParams;

  const estado = estadoDe(sp["estado"]);
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 80) : null,
    pila: leerPila(sp["pila"]),
  };

  const { prisma } = await import("@/server/db/client");
  const { listarEmpresas } = await import("@/server/services/empresas");
  const pagina = await listarEmpresas(prisma, { estado, cursor: aqui.cursor });

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
          <select
            name="estado"
            defaultValue={estado ?? ""}
            className="min-h-[38px] rounded-sm border border-line bg-surface px-3 text-sm text-text focus:outline-none"
          >
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
          className="min-h-[38px] rounded-sm border border-line bg-surface px-3 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised"
        >
          Aplicar
        </button>
      </form>

      <section aria-label="Empresas">
        {pagina.items.length === 0 ? (
          <p className="text-sm text-text-dim">
            {/* Estar en una página posterior y no encontrar nada NO es «no hay empresas»: es que se
                acabaron. Decirlo distinto evita que el admin crea que su filtro no vale. */}
            {aqui.cursor !== null
              ? "No quedan más empresas por aquí."
              : estado
                ? "Ninguna empresa en ese estado."
                : "Todavía no se ha registrado ninguna empresa."}
          </p>
        ) : (
          <ul className="space-y-3">
            {pagina.items.map((e) => (
              <li
                key={e.id}
                data-empresa={e.id}
                className="rounded-sm border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-medium text-text">{e.nombre}</h2>
                  <span className={PILDORA}>{ETIQUETA_ESTADO_EMPRESA[e.estado]}</span>
                  <span className={PILDORA}>{ETIQUETA_TIPO_CUENTA[e.tipoCuenta]}</span>
                  <span className={PILDORA}>{ETIQUETA_TIPO_NEGOCIO[e.tipoNegocio]}</span>
                  <span className="ml-auto text-2xs text-text-dim tabular-nums">
                    {new Date(e.creadaMs).toLocaleDateString("es-ES", FECHA)}
                  </span>
                </div>

                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-text-dim">Dueño</dt>
                    <dd className="text-text">{e.dueno ? `@${e.dueno}` : "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-text-dim">Puede comprar</dt>
                    <dd className="text-text">
                      {alcancesPermitidos(e.tipoNegocio)
                        .map((a) => a.toLowerCase())
                        .join(", ")}
                    </dd>
                  </div>
                  {e.webUrl ? (
                    <div className="flex min-w-0 gap-2">
                      <dt className="text-text-dim">Web</dt>
                      <dd className="min-w-0 truncate text-text">{e.webUrl}</dd>
                    </div>
                  ) : null}
                  {e.direccion ? (
                    <div className="flex min-w-0 gap-2">
                      <dt className="text-text-dim">Dirección</dt>
                      <dd className="min-w-0 truncate text-text">{e.direccion}</dd>
                    </div>
                  ) : null}
                  {e.verificadaMs !== null ? (
                    <div className="flex gap-2">
                      <dt className="text-text-dim">Verificada</dt>
                      <dd className="text-text tabular-nums">
                        {new Date(e.verificadaMs).toLocaleDateString("es-ES", FECHA)}
                        {e.verificadaPor ? ` · @${e.verificadaPor}` : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {e.motivoRechazo ? (
                  <p className="mt-2 text-sm text-text">
                    <span className="text-text-dim">Motivo (lo ve la empresa): </span>
                    {MSG_MOTIVO_RECHAZO_EMPRESA[e.motivoRechazo]}
                  </p>
                ) : null}
                {e.notaInterna ? (
                  <p className="mt-1 text-sm text-text-dim">
                    <span className={CABECERA}>Nota interna</span> {e.notaInterna}
                  </p>
                ) : null}

                <AccionesEmpresa id={e.id} nombre={e.nombre} />
              </li>
            ))}
          </ul>
        )}

        <PasosKeyset
          base="/panel/empresas"
          aqui={aqui}
          proximoCursor={pagina.proximoCursor}
          filtro={{ estado }}
        />
      </section>
    </div>
  );
}
