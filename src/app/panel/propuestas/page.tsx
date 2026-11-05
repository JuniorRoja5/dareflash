import Link from "next/link";

import {
  DEFAULT_CURRENCY,
  EstadoRetoSolicitudSchema,
  type EstadoRetoSolicitud,
  MSG_MOTIVO_RECHAZO_RETO,
} from "@/config/constants";
import { nombreCategoria } from "@/lib/categorias";
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

import { AccionesPropuesta } from "./acciones-propuesta";

const S = seccionPorHref("/panel/propuestas")!;

export const metadata = { title: "Propuestas · Panel" };
// Lee la sesión y consulta según el filtro: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/** Los mismos controles, cabeceras y título que `/panel/empresas`: es su sección hermana. */
const CONTROL =
  "min-h-[38px] rounded-sm border border-line bg-surface px-3 text-sm text-text focus:outline-none";
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;
/** Las fechas en UTC y diciéndolo: la propuesta se escribió en la hora local de la empresa. */
const FECHA_HORA = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
} as const;
const PILDORA = "rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";
const PASO =
  "inline-block min-h-[38px] rounded-sm border border-line px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised";

/** La palabra del estado, en el panel (el portal tiene la suya, que sabe si ya está publicada). */
const ETIQUETA: Record<EstadoRetoSolicitud, string> = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

/** Un `?estado=` manipulado no revienta la consulta: se queda en «todas». */
function estadoDe(v: string | string[] | undefined): EstadoRetoSolicitud | null {
  const r = EstadoRetoSolicitudSchema.safeParse(typeof v === "string" ? v : undefined);
  return r.success ? r.data : null;
}

const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 80) : "";

function enlace(estado: EstadoRetoSolicitud | null, paginacion: Paginacion): string {
  const p = new URLSearchParams();
  if (estado) p.set("estado", estado);
  if (paginacion.cursor) p.set("cursor", paginacion.cursor);
  const pila = escribirPila(paginacion.pila);
  if (pila) p.set("pila", pila);
  const s = p.toString();
  return s ? `/panel/propuestas?${s}` : "/panel/propuestas";
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className={CABECERA}>{etiqueta}</dt>
      <dd className="mt-0.5 text-sm break-words text-text">{valor}</dd>
    </div>
  );
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
 * Cada tarjeta lleva la propuesta ENTERA —qué, premio, fechas, reglas, logo— porque es lo que hay que
 * leer para decidir, y abrir una ficha aparte sería un clic más por propuesta. Una pendiente lleva sus
 * botones; una aprobada, el enlace a su BORRADOR (que es donde se pone lo de DareFlash y se publica);
 * una rechazada, el motivo que leyó la empresa y la nota del equipo.
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
  const { listarSolicitudesReto } = await import("@/server/services/retos-empresa");
  const pagina = await listarSolicitudesReto(prisma, { estado, cursor: aqui.cursor });

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
          <select name="estado" defaultValue={estado ?? ""} className={CONTROL}>
            <option value="">Todas</option>
            {EstadoRetoSolicitudSchema.options.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA[e]}
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

      <section aria-label="Propuestas">
        {pagina.items.length === 0 ? (
          <p className="max-w-prose text-sm text-text-dim">
            <TextoVacio estado={estado} paginando={aqui.cursor !== null} />
          </p>
        ) : (
          <ul className="space-y-4">
            {pagina.items.map((s) => (
              <li
                key={s.id}
                data-propuesta={s.id}
                className="rounded-sm border border-line bg-surface"
              >
                <div className="flex flex-wrap items-start gap-3 p-4">
                  {s.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- fichero del volumen de portadas, ya saneado a WebP
                    <img
                      src={s.logo}
                      alt={`Logo de ${s.empresa}`}
                      className="h-12 w-12 shrink-0 rounded-xs border border-line bg-raised object-contain"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold break-words text-text">{s.titulo}</p>
                    <p className="text-2xs text-text-dim">
                      Propuesto por {s.empresa} ·{" "}
                      {new Date(s.creadaMs).toLocaleDateString("es-ES", FECHA_HORA)} UTC
                    </p>
                  </div>
                  <span className={PILDORA}>{ETIQUETA[s.estado]}</span>
                </div>

                <dl className="grid gap-4 border-t border-line p-4 sm:grid-cols-3">
                  <Dato
                    etiqueta="Premio"
                    valor={importeConMoneda(s.premioCents, DEFAULT_CURRENCY)}
                  />
                  <Dato
                    etiqueta="Ganadores"
                    valor={s.ganadores === 1 ? "1 ganador" : `${s.ganadores} ganadores`}
                  />
                  <Dato etiqueta="Categoría" valor={nombreCategoria(s.categoria) ?? s.categoria} />
                  <Dato
                    etiqueta="Abre"
                    valor={`${new Date(s.aperturaMs).toLocaleString("es-ES", FECHA_HORA)} UTC`}
                  />
                  <Dato
                    etiqueta="Cierra"
                    valor={`${new Date(s.cierreMs).toLocaleString("es-ES", FECHA_HORA)} UTC`}
                  />
                </dl>

                {s.descripcion || s.reglas ? (
                  <div className="space-y-3 border-t border-line p-4">
                    {s.descripcion ? (
                      <div>
                        <p className={CABECERA}>Descripción</p>
                        <p className="mt-1 text-sm whitespace-pre-line text-text-dim">
                          {s.descripcion}
                        </p>
                      </div>
                    ) : null}
                    {s.reglas ? (
                      <div>
                        <p className={CABECERA}>Reglas</p>
                        <p className="mt-1 text-sm whitespace-pre-line text-text-dim">{s.reglas}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-start justify-between gap-3 border-t border-line p-4">
                  {s.estado === "PENDIENTE" ? (
                    <>
                      <p className="max-w-prose text-2xs text-text-dim">
                        Aprobarla crea el reto en BORRADOR, patrocinado por {s.empresa}. Ahí pones
                        la comisión, el nivel y la portada, y lo publicas.
                      </p>
                      <AccionesPropuesta id={s.id} titulo={s.titulo} />
                    </>
                  ) : s.estado === "APROBADA" && s.challengeId ? (
                    <Link
                      href={`/panel/retos/${s.challengeId}`}
                      className="text-sm font-medium text-text underline underline-offset-2"
                    >
                      Ver el reto que salió de ella
                    </Link>
                  ) : s.estado === "RECHAZADA" ? (
                    <div className="space-y-1 text-sm">
                      <p className="text-text">
                        Motivo (lo leyó la empresa):{" "}
                        {s.motivoRechazo ? MSG_MOTIVO_RECHAZO_RETO[s.motivoRechazo] : "—"}
                      </p>
                      {s.notaInterna ? (
                        <p className="text-text-dim">Nota interna: {s.notaInterna}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
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
