import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { Tarjeta } from "@/components/ui/tarjeta";
import {
  DEFAULT_CURRENCY,
  ETIQUETA_ESTADO_SOLICITUD,
  MSG_ESTADO_SOLICITUD,
  MSG_MOTIVO_RECHAZO_RETO,
  MSG_PAGO_PATROCINIO,
} from "@/config/constants";
import { nombreCategoria } from "@/lib/categorias";
import { importeConMoneda } from "@/lib/dinero";

import { ambitoDelPortal } from "../ambito-portal";
import { AvisoVerificar } from "../aviso-verificar";

export const metadata = { title: "Mis retos · DareFlash" };
// Lee la sesión y las filas de la empresa: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/** Fechas en UTC y diciéndolo: el servidor no sabe en qué zona está quien mira. */
const FECHA = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } as const;
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const PILDORA = "rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";

const dinero = (cents: number, moneda = DEFAULT_CURRENCY) => importeConMoneda(cents, moneda);

/**
 * /empresa/retos — LOS RETOS DE LA EMPRESA (Fase 9 · P3): sus propuestas y su EXTRACTO.
 *
 * DOS COSAS, Y LAS DOS CON EL ÁMBITO DEL CHOKEPOINT (`ambitoDelPortal`), nunca de la URL:
 *  - LAS PROPUESTAS, con su estado calculado (en revisión, rechazada con su motivo, aprobada,
 *    publicada con enlace al reto). La nota interna del equipo no está: el DTO no la trae.
 *  - EL EXTRACTO: lo que la empresa debe por sus retos (premio + comisión), leído con la MISMA
 *    consulta que la contabilidad del panel (`listarPatrocinios` / `totalesPatrocinios`) acotada a su
 *    `empresaId`. Por eso lo que ve la empresa y lo que factura el admin cuadran por construcción.
 */
export default async function PaginaMisRetos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ambito = await ambitoDelPortal();
  if (ambito === null) {
    return (
      <div className="df-rise">
        <h1 className="text-2xl text-text">Mis retos</h1>
        <div className="mt-6">
          <AvisoVerificar />
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const enviada = sp["enviada"] === "1";

  const { prisma } = await import("@/server/db/client");
  const { misSolicitudesReto } = await import("@/server/services/retos-empresa");
  const { listarPatrocinios, totalesPatrocinios } = await import("@/server/services/patrocinios");
  const alcance = { empresaId: ambito.empresaId };
  const [solicitudes, extracto, totales] = await Promise.all([
    misSolicitudesReto(prisma, ambito.empresaId),
    listarPatrocinios(prisma, alcance),
    totalesPatrocinios(prisma, alcance),
  ]);

  const verificada = ambito.estado === "VERIFICADA";

  return (
    <div className="df-rise space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text">Mis retos</h1>
          <p className="mt-1 max-w-prose text-sm text-text-dim">
            Los retos patrocinados que nos propones, y lo que suma cada uno.
          </p>
        </div>
        {/* SECUNDARIO: el acento de la pantalla es el CTA del cromo, y uno solo por pantalla. */}
        {verificada ? (
          <Boton href="/empresa/retos/nuevo" variante="secundario">
            Proponer un reto
          </Boton>
        ) : null}
      </div>

      {enviada ? (
        <p role="status" className="rounded-sm border border-line bg-surface p-3 text-sm text-text">
          Hemos recibido tu propuesta. La revisamos a mano y te escribimos en cuanto la decidamos.
        </p>
      ) : null}

      {!verificada ? (
        <p className="max-w-prose rounded-sm border border-line bg-surface p-4 text-sm text-text-dim">
          Podrás proponer retos en cuanto verifiquemos tu empresa.
        </p>
      ) : null}

      <section aria-labelledby="propuestas" className="space-y-3">
        <h2 id="propuestas" className={CABECERA}>
          Tus propuestas
        </h2>
        {solicitudes.items.length === 0 ? (
          <p className="max-w-prose text-sm text-text-dim">
            {verificada
              ? "Todavía no nos has propuesto ningún reto. Cuando lo hagas, aquí verás en qué punto está."
              : "Aquí verás tus propuestas y en qué punto está cada una."}
          </p>
        ) : (
          <ul className="space-y-3">
            {solicitudes.items.map((s) => (
              <li key={s.id} data-solicitud={s.id}>
                <Tarjeta>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 flex-1 text-sm font-semibold break-words text-text">
                      {s.titulo}
                    </h3>
                    <span className={PILDORA}>{ETIQUETA_ESTADO_SOLICITUD[s.estado]}</span>
                  </div>
                  <p className="mt-1 text-2xs text-text-dim">
                    {nombreCategoria(s.categoria) ?? s.categoria} · Premio {dinero(s.premioCents)} ·{" "}
                    {new Date(s.aperturaMs).toLocaleDateString("es-ES", FECHA)} –{" "}
                    {new Date(s.cierreMs).toLocaleDateString("es-ES", FECHA)} (UTC)
                  </p>
                  <p className="mt-2 text-sm text-text-dim">{MSG_ESTADO_SOLICITUD[s.estado]}</p>
                  {/* EL MOTIVO SÍ SE LE ENSEÑA; la nota interna no existe en este DTO. */}
                  {s.motivoRechazo ? (
                    <p className="mt-1 text-sm text-text">
                      {MSG_MOTIVO_RECHAZO_RETO[s.motivoRechazo]}
                    </p>
                  ) : null}
                  {s.reto ? (
                    <Link
                      href={`/retos/${s.reto.publicCode}-${s.reto.slug}`}
                      className="mt-2 inline-block text-sm font-medium text-text underline underline-offset-2"
                    >
                      Ver el reto publicado
                    </Link>
                  ) : null}
                </Tarjeta>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="extracto" className="space-y-3">
        <h2 id="extracto" className={CABECERA}>
          Extracto
        </h2>
        {extracto.filas.length === 0 ? (
          <p className="max-w-prose text-sm text-text-dim">
            Cuando aprobemos uno de tus retos, aquí verás el premio, nuestra comisión y el total de
            cada uno.
          </p>
        ) : (
          <Tarjeta>
            {/* EL TOTAL DE TODOS, no el de la lista: sale agregado en la base, como en el panel. */}
            {totales.moneda ? (
              <p className="text-sm text-text">
                Total ({totales.retos} {totales.retos === 1 ? "reto" : "retos"}):{" "}
                <span className="font-semibold">{dinero(totales.totalCents, totales.moneda)}</span>{" "}
                <span className="text-text-dim">
                  ({dinero(totales.premiosCents, totales.moneda)} en premios +{" "}
                  {dinero(totales.comisionCents, totales.moneda)} de comisión)
                </span>
              </p>
            ) : null}
            <ul className="mt-3 divide-y divide-line">
              {extracto.filas.map((f) => (
                <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{f.titulo}</span>
                  <span className="text-2xs text-text-dim tabular-nums">
                    {dinero(f.premioCents, f.moneda)} + {f.comisionBps / 100}% ={" "}
                    <span className="text-text">{dinero(f.totalCents, f.moneda)}</span>
                  </span>
                  {/* «Sin cerrar» y no «en curso»: un borrador todavía sin publicar tampoco ha cerrado. */}
                  <span className={PILDORA}>{f.cerrado ? "Cerrado" : "Sin cerrar"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-2xs text-text-dim">{MSG_PAGO_PATROCINIO}</p>
          </Tarjeta>
        )}
      </section>
    </div>
  );
}
