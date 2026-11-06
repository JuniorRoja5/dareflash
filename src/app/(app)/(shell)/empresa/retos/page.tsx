import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { Tarjeta } from "@/components/ui/tarjeta";
import { TarjetaMetrica } from "@/components/ui/tarjeta-metrica";
import {
  DEFAULT_CURRENCY,
  ETIQUETA_ESTADO_SOLICITUD,
  MSG_ESTADO_SOLICITUD,
  MSG_MOTIVO_RECHAZO_RETO,
  MSG_PAGO_PATROCINIO,
} from "@/config/constants";
import { nombreCategoria } from "@/lib/categorias";
import { importeConMoneda } from "@/lib/dinero";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";

import { ambitoDelPortal } from "../ambito-portal";
import { AvisoVerificar } from "../aviso-verificar";

export const metadata = { title: "Mis retos · DareFlash" };
// Lee la sesión y las filas de la empresa: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/** Fechas en UTC y diciéndolo: el servidor no sabe en qué zona está quien mira. */
const FECHA = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } as const;
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const PILDORA =
  "inline-block whitespace-nowrap rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";
/** La caja de una tabla: la de `Tarjeta`, sin su relleno (la tabla pone el suyo por celda). */
const CAJA_TABLA = "rounded-sm border border-line bg-surface";

const dinero = (cents: number, moneda = DEFAULT_CURRENCY) => importeConMoneda(cents, moneda);
const fecha = (ms: number) => new Date(ms).toLocaleDateString("es-ES", FECHA);
const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 80) : "";
const ENLACE = "text-sm font-medium text-text underline underline-offset-2 hover:no-underline";
const TH = `py-3 pr-4 whitespace-nowrap ${CABECERA}`;

/**
 * /empresa/retos — LOS RETOS DE LA EMPRESA (Fase 9 · P3): sus propuestas y su EXTRACTO.
 *
 * DOS COSAS, Y LAS DOS CON EL ÁMBITO DEL CHOKEPOINT (`ambitoDelPortal`), nunca de la URL:
 *  - LAS PROPUESTAS, con su estado calculado (en revisión, rechazada con su motivo, aprobada,
 *    publicada con enlace al reto). La nota interna del equipo no está: el DTO no la trae.
 *  - EL EXTRACTO (`extractoDeEmpresa`): por reto, el premio para quien gane y el total a pagar, y
 *    nada de cómo se reparte el dinero dentro de DareFlash —ese desglose es solo del panel—. Sale de
 *    la MISMA consulta que la contabilidad del panel acotada a su `empresaId`, así que las cifras
 *    cuadran por construcción.
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
  const aqui: Paginacion = { cursor: texto(sp["cursor"]) || null, pila: leerPila(sp["pila"]) };

  const { prisma } = await import("@/server/db/client");
  const { misSolicitudesReto } = await import("@/server/services/retos-empresa");
  const { extractoDeEmpresa } = await import("@/server/services/patrocinios");
  const [solicitudes, extracto] = await Promise.all([
    misSolicitudesReto(prisma, ambito.empresaId, { cursor: aqui.cursor }),
    extractoDeEmpresa(prisma, ambito.empresaId),
  ]);
  const totales = extracto.totales;

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
          <Tarjeta className="p-5">
            <p className="max-w-prose text-sm text-text-dim">
              {aqui.cursor !== null
                ? "No quedan más propuestas por aquí."
                : verificada
                  ? "Todavía no nos has propuesto ningún reto. Cuando lo hagas, aquí verás en qué punto está."
                  : "Aquí verás tus propuestas y en qué punto está cada una."}
            </p>
          </Tarjeta>
        ) : (
          <>
            {/* ESCRITORIO: TABLA. Una fila por propuesta y una columna por dato, para comparar de un
                vistazo en qué punto está cada una. El texto largo del estado va bajo la pastilla. */}
            <div className={`hidden overflow-x-auto md:block ${CAJA_TABLA}`}>
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <th className={`pl-5 ${TH}`}>Reto</th>
                    <th className={`text-right ${TH}`}>Premio</th>
                    <th className={TH}>Abre – cierra</th>
                    <th className={`pr-5 ${TH}`}>Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {solicitudes.items.map((s) => (
                    <tr key={s.id} data-solicitud={s.id} className="align-top">
                      <td className="max-w-[22rem] py-3 pr-4 pl-5">
                        <p className="font-medium break-words text-text">{s.titulo}</p>
                        <p className="text-2xs text-text-dim">
                          {nombreCategoria(s.categoria) ?? s.categoria}
                        </p>
                        {s.reto ? (
                          <Link
                            href={`/retos/${s.reto.publicCode}-${s.reto.slug}`}
                            className={`mt-1 inline-block ${ENLACE}`}
                          >
                            Ver el reto publicado
                          </Link>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-right whitespace-nowrap text-text tabular-nums">
                        {dinero(s.premioCents)}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-text-dim tabular-nums">
                        {fecha(s.aperturaMs)} – {fecha(s.cierreMs)}
                      </td>
                      <td className="w-[18rem] py-3 pr-5">
                        <span className={PILDORA}>{ETIQUETA_ESTADO_SOLICITUD[s.estado]}</span>
                        <p className="mt-1.5 text-2xs text-text-dim">
                          {MSG_ESTADO_SOLICITUD[s.estado]}
                        </p>
                        {/* EL MOTIVO SÍ SE LE ENSEÑA; la nota interna no existe en este DTO. */}
                        {s.motivoRechazo ? (
                          <p className="mt-1 text-2xs text-text">
                            {MSG_MOTIVO_RECHAZO_RETO[s.motivoRechazo]}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MÓVIL: TARJETAS. Cuatro columnas no caben a 390 px sin cortar el título. */}
            <ul className="space-y-3 md:hidden">
              {solicitudes.items.map((s) => (
                <li key={s.id} data-solicitud-movil={s.id}>
                  <Tarjeta>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 flex-1 text-sm font-semibold break-words text-text">
                        {s.titulo}
                      </h3>
                      <span className={PILDORA}>{ETIQUETA_ESTADO_SOLICITUD[s.estado]}</span>
                    </div>
                    <p className="mt-1 text-2xs text-text-dim">
                      {nombreCategoria(s.categoria) ?? s.categoria} · Premio {dinero(s.premioCents)}{" "}
                      · {fecha(s.aperturaMs)} – {fecha(s.cierreMs)}
                    </p>
                    <p className="mt-2 text-sm text-text-dim">{MSG_ESTADO_SOLICITUD[s.estado]}</p>
                    {s.motivoRechazo ? (
                      <p className="mt-1 text-sm text-text">
                        {MSG_MOTIVO_RECHAZO_RETO[s.motivoRechazo]}
                      </p>
                    ) : null}
                    {s.reto ? (
                      <Link
                        href={`/retos/${s.reto.publicCode}-${s.reto.slug}`}
                        className={`mt-2 inline-flex min-h-[44px] items-center ${ENLACE}`}
                      >
                        Ver el reto publicado
                      </Link>
                    ) : null}
                  </Tarjeta>
                </li>
              ))}
            </ul>
          </>
        )}
        {/* Fuera del `if` de la lista: una página posterior vacía no encierra a nadie. */}
        <PasosKeyset base="/empresa/retos" aqui={aqui} proximoCursor={solicitudes.nextCursor} />
      </section>

      <section aria-labelledby="extracto" className="space-y-3">
        <h2 id="extracto" className={CABECERA}>
          Extracto
        </h2>
        {extracto.filas.length === 0 ? (
          <Tarjeta className="p-5">
            <p className="max-w-prose text-sm text-text-dim">
              Cuando aprobemos uno de tus retos, aquí verás el premio para quien gane y el total a
              pagar de cada uno.
            </p>
          </Tarjeta>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
            {/* EL TOTAL DE TODOS, no el de la lista: sale agregado en la base, como en el panel.
                Solo lo que paga: cómo se reparte dentro de DareFlash no se le cuenta a la empresa. */}
            {totales.moneda ? (
              <TarjetaMetrica
                etiqueta="Total a pagar"
                valor={dinero(totales.totalCents, totales.moneda)}
                pie={`${totales.retos} ${totales.retos === 1 ? "reto" : "retos"}`}
              />
            ) : (
              <span className="hidden lg:block" />
            )}
            <div className={`min-w-0 ${CAJA_TABLA}`}>
              {/* Dos cifras por reto y con su nombre: tabla en escritorio, filas apiladas en móvil. */}
              <table className="hidden w-full border-collapse text-left text-sm md:table">
                <thead className="border-b border-line">
                  <tr>
                    <th className={`pl-5 ${TH}`}>Reto</th>
                    <th className={`text-right ${TH}`}>Premio para quien gane</th>
                    <th className={`text-right ${TH}`}>Total a pagar</th>
                    <th className={`pr-5 ${TH}`}>Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {extracto.filas.map((f) => (
                    <tr key={f.id} data-extracto={f.id}>
                      <td className="max-w-[22rem] truncate py-3 pr-4 pl-5 text-text">
                        {f.titulo}
                      </td>
                      <td className="py-3 pr-4 text-right whitespace-nowrap text-text-dim tabular-nums">
                        {dinero(f.premioCents, f.moneda)}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold whitespace-nowrap text-text tabular-nums">
                        {dinero(f.totalCents, f.moneda)}
                      </td>
                      {/* «Sin cerrar» y no «en curso»: un borrador todavía sin publicar tampoco ha cerrado. */}
                      <td className="py-3 pr-5">
                        <span className={PILDORA}>{f.cerrado ? "Cerrado" : "Sin cerrar"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-line px-4 md:hidden">
                {extracto.filas.map((f) => (
                  <li key={f.id} data-extracto-movil={f.id} className="space-y-1 py-3">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-sm break-words text-text">
                        {f.titulo}
                      </span>
                      <span className={PILDORA}>{f.cerrado ? "Cerrado" : "Sin cerrar"}</span>
                    </div>
                    <p className="flex justify-between text-2xs text-text-dim tabular-nums">
                      <span>Premio para quien gane</span>
                      <span>{dinero(f.premioCents, f.moneda)}</span>
                    </p>
                    <p className="flex justify-between text-sm text-text tabular-nums">
                      <span>Total a pagar</span>
                      <span className="font-semibold">{dinero(f.totalCents, f.moneda)}</span>
                    </p>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line px-4 py-3 text-2xs text-text-dim md:px-5">
                {MSG_PAGO_PATROCINIO}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
