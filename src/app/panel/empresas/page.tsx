import Link from "next/link";

import {
  ETIQUETA_ESTADO_EMPRESA,
  ETIQUETA_TIPO_CUENTA,
  ETIQUETA_TIPO_NEGOCIO,
  EstadoEmpresaSchema,
  MSG_MOTIVO_RECHAZO_EMPRESA,
  type EstadoEmpresa,
} from "@/config/constants";
import { alcancesPermitidos } from "@/lib/empresa";
import {
  anterior,
  escribirPila,
  leerPila,
  siguiente,
  type Paginacion,
} from "@/lib/paginacion-pila";
import { nombrePais } from "@/lib/paises";

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
const PILDORA = "rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";
const PASO =
  "inline-block min-h-[38px] rounded-sm border border-line px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised";

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

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-text-dim">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-text">{valor}</dd>
    </div>
  );
}

/**
 * /panel/empresas — LA COLA DE VERIFICACIÓN y la FICHA de cada empresa.
 *
 * TODO POR URL, como el resto del panel: `?estado=` filtra, `?cursor=`/`?pila=` paginan y `?e=`
 * abre una ficha. Sin estado de cliente no hay nada que se desincronice y un enlace a una ficha se
 * puede pegar en una conversación.
 *
 * LA DECISIÓN SE TOMA EN LA FICHA, no en la lista, y por una razón concreta: la IDENTIFICACIÓN
 * FISCAL solo se enseña ahí, de una en una. En una marca personal es el documento de una persona,
 * así que no entra en un listado de veinticinco, ni en ningún correo, ni en el `AuditLog`.
 * Tampoco el correo del dueño, que sigue teniendo su única puerta en la ficha de la cuenta.
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

  const [pagina, ficha] = await Promise.all([
    listarEmpresas(prisma, { estado, cursor: aqui.cursor }),
    fichaId ? fichaEmpresa(prisma, fichaId) : Promise.resolve(null),
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

      {ficha ? (
        <section
          aria-label={`Ficha de ${ficha.nombre}`}
          className="rounded-sm border border-line bg-surface p-5"
          data-ficha={ficha.id}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg text-text">{ficha.nombre}</h2>
            <span className={PILDORA}>{ETIQUETA_ESTADO_EMPRESA[ficha.estado]}</span>
            <span className={PILDORA}>{ETIQUETA_TIPO_CUENTA[ficha.tipoCuenta]}</span>
            <span className={PILDORA}>{ETIQUETA_TIPO_NEGOCIO[ficha.tipoNegocio]}</span>
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Dato etiqueta="Dueño" valor={ficha.dueno ? `@${ficha.dueno}` : "—"} />
            <Dato etiqueta="Contacto" valor={ficha.personaContacto} />
            <Dato etiqueta="País" valor={nombrePais(ficha.paisIso)} />
            {ficha.ciudadTexto ? <Dato etiqueta="Ciudad" valor={ficha.ciudadTexto} /> : null}
            {ficha.webUrl ? <Dato etiqueta="Web" valor={ficha.webUrl} /> : null}
            {ficha.redes ? <Dato etiqueta="Redes" valor={ficha.redes} /> : null}
            {ficha.direccion ? <Dato etiqueta="Dirección" valor={ficha.direccion} /> : null}
            <Dato
              etiqueta="Puede comprar"
              valor={alcancesPermitidos(ficha.tipoNegocio)
                .map((a) => a.toLowerCase())
                .join(", ")}
            />
            {/* EL ÚNICO SITIO donde sale la identificación fiscal. */}
            {ficha.fiscalId ? (
              <Dato
                etiqueta="Id. fiscal"
                valor={`${ficha.fiscalId}${ficha.fiscalPaisIso ? ` (${nombrePais(ficha.fiscalPaisIso)})` : ""}`}
              />
            ) : null}
            {ficha.verificadaMs !== null ? (
              <Dato
                etiqueta="Verificada"
                valor={`${new Date(ficha.verificadaMs).toLocaleDateString("es-ES", FECHA)}${
                  ficha.verificadaPor ? ` · @${ficha.verificadaPor}` : ""
                }`}
              />
            ) : null}
          </dl>

          {ficha.motivoRechazo ? (
            <p className="mt-3 text-sm text-text">
              <span className="text-text-dim">Motivo (lo ve la empresa): </span>
              {MSG_MOTIVO_RECHAZO_EMPRESA[ficha.motivoRechazo]}
            </p>
          ) : null}
          {ficha.notaInterna ? (
            <p className="mt-1 text-sm text-text-dim">
              <span className={CABECERA}>Nota interna</span> {ficha.notaInterna}
            </p>
          ) : null}

          <AccionesEmpresa id={ficha.id} nombre={ficha.nombre} />
        </section>
      ) : null}
      {fichaId && !ficha ? <p className="text-sm text-text-dim">Esa empresa no existe.</p> : null}

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
          <ul className="divide-y divide-line rounded-sm border border-line bg-surface">
            {pagina.items.map((e) => (
              <li key={e.id} data-empresa={e.id}>
                <Link
                  href={enlace(ctx, { ficha: e.id, paginacion: aqui })}
                  aria-current={e.id === fichaId ? "true" : undefined}
                  className={`flex flex-wrap items-center gap-3 p-4 transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised ${
                    e.id === fichaId ? "bg-raised" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{e.nombre}</span>
                    <span className="block truncate text-2xs text-text-dim">
                      {ETIQUETA_TIPO_NEGOCIO[e.tipoNegocio]} · {nombrePais(e.paisIso)} ·{" "}
                      {e.personaContacto}
                    </span>
                  </span>
                  <span className={PILDORA}>{ETIQUETA_ESTADO_EMPRESA[e.estado]}</span>
                  <span className="w-24 text-right text-2xs text-text-dim tabular-nums">
                    {new Date(e.creadaMs).toLocaleDateString("es-ES", FECHA)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

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
