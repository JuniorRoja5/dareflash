import Link from "next/link";

import {
  ETIQUETA_ALCANCE_PUBLICIDAD,
  ETIQUETA_ESTADO_PUBLICIDAD,
  MOTIVOS_DENUNCIA,
} from "@/config/constants";
import {
  anterior,
  escribirPila,
  leerPila,
  siguiente,
  type Paginacion,
} from "@/lib/paginacion-pila";
import type {
  FichaPublicidadPanel,
  FiltroPublicidadPanel,
} from "@/server/services/publicidad-moderacion";

import { requireSeccion } from "../panel-guard";
import { seccionPorHref } from "../secciones";

import { AccionesPublicidad } from "./acciones-publicidad";

const S = seccionPorHref("/panel/publicidad")!;

export const metadata = { title: "Publicidad · Panel" };
// Lee la sesión y consulta según el filtro: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/** Los mismos controles, cabeceras y título que Empresas y Propuestas: son secciones hermanas. */
const CONTROL =
  "min-h-[44px] lg:min-h-[38px] rounded-sm border border-line bg-surface px-3 text-sm text-text focus:outline-none";
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;
const FECHA = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" } as const;
const fecha = (ms: number) => new Date(ms).toLocaleDateString("es-ES", FECHA);
const PILDORA =
  "inline-block whitespace-nowrap rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";
const TH = `px-4 py-3 whitespace-nowrap ${CABECERA}`;
const PASO =
  "inline-block min-h-[44px] lg:min-h-[38px] rounded-sm border border-line px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised";

const FILTROS: readonly FiltroPublicidadPanel[] = [
  "REVISION",
  "DENUNCIADAS",
  "ACTIVAS",
  "RETIRADAS",
  "TODAS",
];
const ETIQUETA_FILTRO: Record<FiltroPublicidadPanel, string> = {
  REVISION: "En revisión",
  DENUNCIADAS: "Con denuncias",
  ACTIVAS: "Activas",
  RETIRADAS: "Retiradas",
  TODAS: "Todas",
};

/** La cola por defecto es «En revisión» (lo que espera decisión, lo mismo que cuenta la insignia). */
function filtroDe(v: string | string[] | undefined): FiltroPublicidadPanel {
  return typeof v === "string" && (FILTROS as readonly string[]).includes(v)
    ? (v as FiltroPublicidadPanel)
    : "REVISION";
}

const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 80) : "";

/** El enlace de esta pantalla. Abrir una ficha (`p`) conserva el filtro y la página. */
function enlace(
  filtro: FiltroPublicidadPanel,
  paginacion: Paginacion,
  ficha: string | null = null,
) {
  const p = new URLSearchParams();
  p.set("filtro", filtro);
  if (ficha) p.set("p", ficha);
  if (paginacion.cursor) p.set("cursor", paginacion.cursor);
  const pila = escribirPila(paginacion.pila);
  if (pila) p.set("pila", pila);
  return `/panel/publicidad?${p.toString()}`;
}

function TextoVacio({ filtro, paginando }: { filtro: FiltroPublicidadPanel; paginando: boolean }) {
  if (paginando) return <>No quedan más campañas por aquí.</>;
  if (filtro === "REVISION") {
    return (
      <>
        No hay ninguna campaña esperando decisión. Cuando una llegue a las denuncias que la pausan
        sola aparecerá aquí, y te enterarás sin buscarla: por el número junto a «Publicidad» y por
        un correo.
      </>
    );
  }
  if (filtro === "DENUNCIADAS") return <>Ninguna campaña tiene denuncias abiertas.</>;
  return <>Ninguna campaña en «{ETIQUETA_FILTRO[filtro].toLowerCase()}».</>;
}

const textoMotivo = (clave: string) =>
  MOTIVOS_DENUNCIA.find((m) => m.clave === clave)?.texto ?? clave;

/** LA FICHA de una campaña: la pieza como se ve, de quién es, sus denuncias y la decisión. */
function Ficha({ f }: { f: FichaPublicidadPanel }) {
  const decidible =
    f.estado === "ACTIVA" ||
    f.estado === "PROGRAMADA" ||
    f.estado === "PAUSADA" ||
    f.estado === "EN_REVISION";
  return (
    <section
      aria-label={`Campaña «${f.nombre}»`}
      className="grid gap-6 rounded-sm border border-line bg-surface/60 p-5 lg:grid-cols-[16rem_minmax(0,1fr)_18rem] lg:p-6"
    >
      <div className="overflow-hidden rounded-sm border border-line bg-raised">
        {f.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element -- fichero del volumen de portadas
          <img src={f.imagen} alt="" className="block max-h-80 w-full bg-void object-contain" />
        ) : null}
        <div className="space-y-1 p-3">
          <p className="text-sm break-words text-text">{f.texto}</p>
          <p className="truncate text-2xs text-text-dim">{f.destinoUrl}</p>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-lg font-semibold break-words text-text">{f.nombre}</p>
          <p className="text-sm text-text-dim">
            De{" "}
            <Link
              href={`/panel/empresas?e=${f.empresa.id}`}
              className="text-text underline underline-offset-2"
            >
              {f.empresa.nombre}
            </Link>{" "}
            · {ETIQUETA_ALCANCE_PUBLICIDAD[f.alcance]} · {f.zona}
          </p>
          <p className="mt-2">
            <span className={PILDORA}>{ETIQUETA_ESTADO_PUBLICIDAD[f.estado]}</span>
          </p>
        </div>
        <div>
          <h3 className={CABECERA}>Denuncias abiertas</h3>
          {f.motivos.length === 0 ? (
            <p className="mt-1 text-sm text-text-dim">Ninguna.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {f.motivos.map((m) => (
                <li key={m.motivo} className="flex justify-between gap-3">
                  <span className="text-text">{textoMotivo(m.motivo)}</span>
                  <span className="text-text-dim tabular-nums">{m.cuantas}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {f.retirada ? (
          <div>
            <h3 className={CABECERA}>Retirada el {fecha(f.retirada.en)} (UTC)</h3>
            <p className="mt-1 text-sm text-text">Motivo: {f.retirada.motivo}</p>
            {f.retirada.nota ? (
              <p className="mt-1 text-sm text-text-dim">Nota interna: {f.retirada.nota}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className={CABECERA}>Decidir</h3>
        {decidible ? (
          <AccionesPublicidad
            id={f.id}
            nombre={f.nombre}
            puedeRetirar
            puedeAbsolver={f.estado === "EN_REVISION" || f.denunciasAbiertas > 0}
          />
        ) : (
          <p className="text-sm text-text-dim">Ya no hay nada que decidir sobre esta campaña.</p>
        )}
      </div>
    </section>
  );
}

/**
 * /panel/publicidad — LAS CAMPAÑAS DE LAS EMPRESAS (Fase 9 · P8). COLA + FICHA, como Empresas y
 * Propuestas: la cola es una TABLA en escritorio (tarjetas en móvil) con lo que sirve para elegir, y
 * `?p=` abre la FICHA arriba, con la pieza, sus denuncias y la decisión. Por defecto, «En revisión»: lo
 * que espera decisión, que es lo mismo que cuenta la insignia del menú.
 *
 * Solo ADMIN (lo exige `requireSeccion`): retirar una campaña es una decisión comercial.
 */
export default async function PaginaPublicidadPanel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSeccion("/panel/publicidad");
  const sp = await searchParams;
  const filtro = filtroDe(sp["filtro"]);
  const aqui: Paginacion = { cursor: texto(sp["cursor"]) || null, pila: leerPila(sp["pila"]) };
  const fichaId = texto(sp["p"]) || null;

  const { prisma } = await import("@/server/db/client");
  const { listarPublicidadPanel, fichaPublicidadPanel } =
    await import("@/server/services/publicidad-moderacion");
  const [pagina, ficha] = await Promise.all([
    listarPublicidadPanel(prisma, { filtro, cursor: aqui.cursor }),
    fichaId ? fichaPublicidadPanel(prisma, fichaId) : Promise.resolve(null),
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
          <span className={CABECERA}>Mostrar</span>
          <select name="filtro" defaultValue={filtro} className={CONTROL}>
            {FILTROS.map((f) => (
              <option key={f} value={f}>
                {ETIQUETA_FILTRO[f]}
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

      {ficha ? <Ficha f={ficha} /> : null}
      {fichaId && !ficha ? <p className="text-sm text-text-dim">Esa campaña no existe.</p> : null}

      <section aria-label="Campañas">
        {pagina.items.length === 0 ? (
          <p className="max-w-prose text-sm text-text-dim">
            <TextoVacio filtro={filtro} paginando={aqui.cursor !== null} />
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-sm border border-line bg-surface/60 md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className={TH}>Campaña</th>
                    <th className={TH}>Empresa</th>
                    <th className={TH}>Zona</th>
                    <th className={`text-right ${TH}`}>Denuncias</th>
                    <th className={TH}>Creada</th>
                    <th className={TH}>Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pagina.items.map((c) => (
                    <tr
                      key={c.id}
                      data-campana-panel={c.id}
                      aria-current={c.id === fichaId ? "true" : undefined}
                      className={`transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised ${
                        c.id === fichaId ? "bg-raised" : ""
                      }`}
                    >
                      <td className="max-w-[24ch] px-4 py-3">
                        <Link
                          href={enlace(filtro, aqui, c.id)}
                          className="block truncate font-medium text-text underline-offset-2 hover:underline"
                        >
                          {c.nombre}
                        </Link>
                      </td>
                      <td className="max-w-[20ch] truncate px-4 py-3 text-text-dim">
                        {c.empresa.nombre}
                      </td>
                      <td className="max-w-[24ch] truncate px-4 py-3 text-text-dim">{c.zona}</td>
                      <td className="px-4 py-3 text-right text-text tabular-nums">
                        {c.denunciasAbiertas}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-text-dim tabular-nums">
                        {fecha(c.creadaMs)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={PILDORA}>{ETIQUETA_ESTADO_PUBLICIDAD[c.estado]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 md:hidden">
              {pagina.items.map((c) => (
                <li key={c.id} data-campana-panel-movil={c.id}>
                  <Link
                    href={enlace(filtro, aqui, c.id)}
                    aria-current={c.id === fichaId ? "true" : undefined}
                    className={`block rounded-sm border border-line p-4 transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised ${
                      c.id === fichaId ? "bg-raised" : "bg-surface"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-sm font-semibold break-words text-text">
                        {c.nombre}
                      </span>
                      <span className={PILDORA}>{ETIQUETA_ESTADO_PUBLICIDAD[c.estado]}</span>
                    </span>
                    <span className="mt-1 block text-2xs break-words text-text-dim">
                      {c.empresa.nombre} · {c.zona} · {c.denunciasAbiertas}{" "}
                      {c.denunciasAbiertas === 1 ? "denuncia" : "denuncias"}
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
              <Link href={enlace(filtro, atras)} rel="prev" className={PASO}>
                <span aria-hidden="true">←</span> Anterior
              </Link>
            ) : (
              <span />
            )}
            {adelante ? (
              <Link href={enlace(filtro, adelante)} rel="next" className={PASO}>
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
