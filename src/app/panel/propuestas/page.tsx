import Link from "next/link";

import {
  DEFAULT_CURRENCY,
  EstadoRetoSolicitudSchema,
  type EstadoRetoSolicitud,
} from "@/config/constants";
import { importeConMoneda } from "@/lib/dinero";
import {
  anterior,
  escribirPila,
  leerPila,
  siguiente,
  type Paginacion,
} from "@/lib/paginacion-pila";

import { requireSeccion } from "../panel-guard";
import { seccionPorHref } from "../secciones";

import { ETIQUETA_SOLICITUD_PANEL as ETIQUETA } from "./etiquetas";
import { FichaPropuesta } from "./ficha-propuesta";
import { IDIOMA_PANEL, fechaPanel } from "@/app/panel/formato-panel";

const S = seccionPorHref("/panel/propuestas")!;

export const metadata = { title: "Propuestas · Panel" };
// Lee la sesión y consulta según el filtro: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/** Los mismos controles, cabeceras y título que `/panel/empresas`: es su sección hermana. */
const CONTROL =
  "min-h-[44px] lg:min-h-[38px] rounded-sm border border-line bg-surface px-3 text-sm text-text focus:outline-none";
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;
/** Las fechas en UTC y diciéndolo: la propuesta se escribió en la hora local de la empresa. */
const fecha = (ms: number) => fechaPanel(ms, "numericaFija");
const PILDORA =
  "inline-block whitespace-nowrap rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";
const TH = `px-4 py-3 whitespace-nowrap ${CABECERA}`;
const PASO =
  "inline-block min-h-[44px] lg:min-h-[38px] rounded-sm border border-line px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised";

/** El valor de `?estado=` que pide TODAS: sin él, la cola es la de pendientes. */
const TODAS = "TODAS";

/**
 * LA COLA POR DEFECTO ES LA DE PENDIENTES DE VERDAD —las que se pueden decidir—: sin `?estado=`, o
 * con uno manipulado, se ven las pendientes con el cierre por delante, que es lo mismo que cuenta la
 * insignia. Una caducada no se puede aprobar, así que no se le ofrece al admin como trabajo.
 * «Todas» es una elección explícita (`?estado=TODAS`).
 */
function estadoDe(v: string | string[] | undefined): EstadoRetoSolicitud | null {
  if (v === TODAS) return null;
  const r = EstadoRetoSolicitudSchema.safeParse(typeof v === "string" ? v : undefined);
  return r.success ? r.data : "PENDIENTE";
}

const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 80) : "";

/** El enlace de esta pantalla. Abrir una ficha (`p`) conserva el filtro y la página. */
function enlace(
  estado: EstadoRetoSolicitud | null,
  paginacion: Paginacion,
  ficha: string | null = null,
): string {
  const p = new URLSearchParams();
  p.set("estado", estado ?? TODAS);
  if (ficha) p.set("p", ficha);
  if (paginacion.cursor) p.set("cursor", paginacion.cursor);
  const pila = escribirPila(paginacion.pila);
  if (pila) p.set("pila", pila);
  const s = p.toString();
  return s ? `/panel/propuestas?${s}` : "/panel/propuestas";
}

function TextoVacio({
  estado,
  paginando,
}: {
  estado: EstadoRetoSolicitud | null;
  paginando: boolean;
}) {
  if (paginando) return <>No quedan más propuestas por aquí.</>;
  if (estado === "PENDIENTE") {
    return (
      <>
        No hay ninguna propuesta esperando. Cuando una empresa verificada proponga un reto aparecerá
        aquí, y te enterarás sin buscarla: por el número junto a «Propuestas», por el indicador de
        la cabecera y por un correo.
      </>
    );
  }
  if (estado) return <>Ninguna propuesta en estado «{ETIQUETA[estado].toLowerCase()}».</>;
  return (
    <>
      Todavía ninguna empresa ha propuesto un reto. Las que lo hagan desde su portal llegarán aquí
      pendientes, y no se publicará nada hasta que las apruebes.
    </>
  );
}

/**
 * /panel/propuestas — LOS RETOS PATROCINADOS QUE PROPONEN LAS EMPRESAS (Fase 9 · P3).
 *
 * COLA + FICHA, como `/panel/empresas` (fase9-diseno). Antes cada tarjeta llevaba la propuesta
 * entera para ahorrar un clic, y la cola era una pila de tarjetas altas donde comparar dos era hacer
 * scroll. Ahora la cola es una TABLA en escritorio (tarjetas en móvil) con lo que sirve para elegir
 * —qué, quién, premio, cierre, estado— y `?p=` abre la FICHA arriba, con la propuesta entera y sus
 * acciones (`FichaPropuesta`). Abrir una ficha conserva el filtro y la página.
 *
 * Solo ADMIN (lo exige `requireSeccion`): aprobar crea un reto, y crear retos es del admin.
 */
export default async function PaginaPropuestas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSeccion("/panel/propuestas");
  const sp = await searchParams;

  const estado = estadoDe(sp["estado"]);
  const aqui: Paginacion = { cursor: texto(sp["cursor"]) || null, pila: leerPila(sp["pila"]) };

  const { prisma } = await import("@/server/db/client");
  const fichaId = texto(sp["p"]) || null;
  const { listarSolicitudesReto, solicitudDelPanel } =
    await import("@/server/services/retos-empresa");
  const [pagina, ficha] = await Promise.all([
    listarSolicitudesReto(prisma, { estado, cursor: aqui.cursor }),
    fichaId ? solicitudDelPanel(prisma, fichaId) : Promise.resolve(null),
  ]);

  const atras = anterior(aqui);
  const adelante = pagina.nextCursor ? siguiente(aqui, pagina.nextCursor) : null;

  return (
    <div className="df-rise space-y-8">
      <div>
        <h1 className="text-2xl leading-none text-text" style={ESTILO_TITULO}>
          {S.label}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-text-dim">{S.descripcion}</p>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className={CABECERA}>Estado</span>
          <select name="estado" defaultValue={estado ?? TODAS} className={CONTROL}>
            {EstadoRetoSolicitudSchema.options.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA[e]}
              </option>
            ))}
            <option value={TODAS}>Todas</option>
          </select>
        </label>
        <button
          type="submit"
          className={`${CONTROL} font-medium transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised`}
        >
          Aplicar
        </button>
      </form>

      {ficha ? <FichaPropuesta s={ficha} /> : null}
      {fichaId && !ficha ? <p className="text-sm text-text-dim">Esa propuesta no existe.</p> : null}

      <section aria-label="Propuestas">
        {pagina.items.length === 0 ? (
          <p className="max-w-prose text-sm text-text-dim">
            <TextoVacio estado={estado} paginando={aqui.cursor !== null} />
          </p>
        ) : (
          <>
            {/* ESCRITORIO: TABLA. El enlace a la ficha va en el título; la fila entera se ilumina
                para decir que es una sola cosa. */}
            <div className="hidden overflow-x-auto rounded-sm border border-line bg-surface/60 md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className={TH}>Propuesta</th>
                    <th className={TH}>Empresa</th>
                    <th className={`text-right ${TH}`}>Premio</th>
                    <th className={TH}>Cierra (UTC)</th>
                    <th className={TH}>Enviada</th>
                    <th className={TH}>Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pagina.items.map((s) => (
                    <tr
                      key={s.id}
                      data-propuesta={s.id}
                      aria-current={s.id === fichaId ? "true" : undefined}
                      className={`transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised ${
                        s.id === fichaId ? "bg-raised" : ""
                      }`}
                    >
                      <td className="max-w-[26ch] px-4 py-3">
                        <Link
                          href={enlace(estado, aqui, s.id)}
                          className="block truncate font-medium text-text underline-offset-2 hover:underline"
                        >
                          {s.titulo}
                        </Link>
                      </td>
                      <td className="max-w-[20ch] truncate px-4 py-3 text-text-dim">{s.empresa}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-text tabular-nums">
                        {importeConMoneda(s.premioCents, IDIOMA_PANEL, DEFAULT_CURRENCY)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-text-dim tabular-nums">
                        {fecha(s.cierreMs)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-text-dim tabular-nums">
                        {fecha(s.creadaMs)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={PILDORA}>{ETIQUETA[s.estado]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MÓVIL: TARJETAS, cada una un enlace a su ficha. */}
            <ul className="space-y-3 md:hidden">
              {pagina.items.map((s) => (
                <li key={s.id} data-propuesta-movil={s.id}>
                  <Link
                    href={enlace(estado, aqui, s.id)}
                    aria-current={s.id === fichaId ? "true" : undefined}
                    className={`block rounded-sm border border-line p-4 transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised ${
                      s.id === fichaId ? "bg-raised" : "bg-surface"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-sm font-semibold break-words text-text">
                        {s.titulo}
                      </span>
                      <span className={PILDORA}>{ETIQUETA[s.estado]}</span>
                    </span>
                    <span className="mt-1 block text-2xs text-text-dim tabular-nums">
                      {s.empresa} ·{" "}
                      {importeConMoneda(s.premioCents, IDIOMA_PANEL, DEFAULT_CURRENCY)} · cierra{" "}
                      {fecha(s.cierreMs)} (UTC)
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {atras || adelante ? (
          <nav aria-label="Paginación" className="mt-6 flex items-center justify-between gap-3">
            {atras ? (
              <Link href={enlace(estado, atras)} rel="prev" className={PASO}>
                <span aria-hidden="true">←</span> Anterior
              </Link>
            ) : (
              <span />
            )}
            {adelante ? (
              <Link href={enlace(estado, adelante)} rel="next" className={PASO}>
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
