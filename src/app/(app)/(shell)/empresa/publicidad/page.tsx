import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { Tarjeta } from "@/components/ui/tarjeta";
import { ETIQUETA_ESTADO_PUBLICIDAD, MSG_PUBLICIDAD_AUN_NO_SALE } from "@/config/constants";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";
import { fraseSaldo } from "@/lib/publicidad";

import { ambitoDelPortal } from "../ambito-portal";
import { AvisoVerificar } from "../aviso-verificar";

export const metadata = { title: "Publicidad · DareFlash" };
// Lee la sesión y las campañas de la empresa: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/** Fechas en UTC y diciéndolo: los días de una campaña son días UTC. */
const FECHA = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } as const;
const fecha = (ms: number) => new Date(ms).toLocaleDateString("es-ES", FECHA);
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const PILDORA =
  "inline-block whitespace-nowrap rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";
const CAJA_TABLA = "rounded-sm border border-line bg-surface";
const TH = `py-3 pr-4 whitespace-nowrap ${CABECERA}`;
const ENLACE = "font-medium text-text underline underline-offset-2 hover:no-underline";
const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 80) : "";

/** El calendario en una línea: «1 dic – 7 dic 2026» o, en un borrador, desde cuándo y cuántos días. */
function calendario(c: {
  estado: string;
  inicioMs: number;
  finMs: number | null;
  diasContratados: number;
}) {
  if (c.estado === "BORRADOR" || c.finMs === null) {
    return `Desde ${fecha(c.inicioMs)} · ${c.diasContratados} ${c.diasContratados === 1 ? "día" : "días"}`;
  }
  return `${fecha(c.inicioMs)} – ${fecha(c.finMs)}`;
}

/**
 * /empresa/publicidad — LAS CAMPAÑAS DE LA EMPRESA (Fase 9 · P6), con el ámbito del chokepoint
 * (`ambitoDelPortal`), nunca de la URL. Su estado es el CALCULADO (programada, activa, finalizada), y el
 * calendario, el que de verdad tiene ocupado.
 *
 * Tabla en escritorio (para comparar de un vistazo) y tarjetas en móvil.
 */
export default async function PaginaPublicidad({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ambito = await ambitoDelPortal();
  if (ambito === null) {
    return (
      <div className="df-rise">
        <h1 className="text-2xl text-text">Publicidad</h1>
        <div className="mt-6">
          <AvisoVerificar />
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const aqui: Paginacion = { cursor: texto(sp["cursor"]) || null, pila: leerPila(sp["pila"]) };

  const { prisma } = await import("@/server/db/client");
  const { misPublicidades, saldoCreditosDe } = await import("@/server/services/publicidad");
  const [pagina, saldo] = await Promise.all([
    misPublicidades(prisma, ambito.empresaId, { cursor: aqui.cursor }),
    saldoCreditosDe(prisma, ambito.empresaId),
  ]);
  const verificada = ambito.estado === "VERIFICADA";

  return (
    <div className="df-rise space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text">Publicidad</h1>
          <p className="mt-1 max-w-prose text-sm text-text-dim">
            Tus campañas y los días que tiene reservados cada una.
          </p>
          <p className="mt-1 max-w-prose text-sm text-text">
            {fraseSaldo(saldo.saldo, saldo.comprometido, "todas")}
          </p>
        </div>
        {/* SECUNDARIO: el acento de la pantalla es el CTA del cromo, y uno solo por pantalla. */}
        {verificada ? (
          <Boton href="/empresa/publicidad/nueva" variante="secundario">
            Nueva campaña
          </Boton>
        ) : null}
      </div>

      <p
        role="status"
        className="max-w-prose rounded-sm border border-line bg-surface p-3 text-sm text-text"
      >
        {MSG_PUBLICIDAD_AUN_NO_SALE}
      </p>

      {!verificada ? (
        <p className="max-w-prose rounded-sm border border-line bg-surface p-4 text-sm text-text-dim">
          Podrás crear campañas en cuanto verifiquemos tu empresa.
        </p>
      ) : null}

      <section aria-labelledby="campanas" className="space-y-3">
        <h2 id="campanas" className={CABECERA}>
          Tus campañas
        </h2>
        {pagina.items.length === 0 ? (
          <Tarjeta className="p-5">
            <p className="max-w-prose text-sm text-text-dim">
              {aqui.cursor !== null
                ? "No quedan más campañas por aquí."
                : verificada
                  ? "Todavía no tienes ninguna campaña. Crea la primera: es un borrador hasta que tú la actives."
                  : "Aquí verás tus campañas y los días de cada una."}
            </p>
          </Tarjeta>
        ) : (
          <>
            <div className={`hidden overflow-x-auto md:block ${CAJA_TABLA}`}>
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className={`pl-5 ${TH}`}>Campaña</th>
                    <th className={TH}>Zona</th>
                    <th className={TH}>Días (UTC)</th>
                    <th className={`text-right ${TH}`}>Cr./día</th>
                    <th className={`pr-5 ${TH}`}>Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pagina.items.map((c) => (
                    <tr key={c.id} data-campana={c.id} className="align-middle">
                      <td className="max-w-[16rem] py-3 pr-4 pl-5">
                        <Link
                          href={`/empresa/publicidad/${c.id}`}
                          className={`break-words ${ENLACE}`}
                        >
                          {c.nombre}
                        </Link>
                      </td>
                      <td className="max-w-[16rem] py-3 pr-4 break-words text-text-dim">
                        {c.zona}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-text-dim tabular-nums">
                        {calendario(c)}
                      </td>
                      <td className="py-3 pr-4 text-right text-text tabular-nums">
                        {c.creditosPorDia}
                      </td>
                      <td className="py-3 pr-5">
                        <span className={PILDORA}>{ETIQUETA_ESTADO_PUBLICIDAD[c.estado]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 md:hidden">
              {pagina.items.map((c) => (
                <li key={c.id} data-campana-movil={c.id}>
                  <Link href={`/empresa/publicidad/${c.id}`} className="block min-h-[44px]">
                    <Tarjeta>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 text-sm font-semibold break-words text-text">
                          {c.nombre}
                        </h3>
                        <span className={PILDORA}>{ETIQUETA_ESTADO_PUBLICIDAD[c.estado]}</span>
                      </div>
                      <p className="mt-1 text-2xs break-words text-text-dim">{c.zona}</p>
                      <p className="mt-1 text-2xs text-text-dim tabular-nums">
                        {calendario(c)} (UTC) · {c.creditosPorDia} cr./día
                      </p>
                    </Tarjeta>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <PasosKeyset base="/empresa/publicidad" aqui={aqui} proximoCursor={pagina.nextCursor} />
      </section>
    </div>
  );
}
