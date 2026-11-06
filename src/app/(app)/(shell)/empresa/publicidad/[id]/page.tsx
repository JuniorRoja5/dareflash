import Link from "next/link";
import { notFound } from "next/navigation";

import { Tarjeta } from "@/components/ui/tarjeta";
import {
  ETIQUETA_ALCANCE_PUBLICIDAD,
  ETIQUETA_ESTADO_PUBLICIDAD,
  MSG_ESTADO_PUBLICIDAD,
  MSG_PUBLICIDAD_AUN_NO_SALE,
  MSG_SALDO_NO_RETENIDO,
} from "@/config/constants";
import { accionesPublicidad, costeTotal } from "@/lib/publicidad";
import type { Estimacion } from "@/server/services/publicidad";

import { ambitoDelPortal } from "../../ambito-portal";
import { AvisoVerificar } from "../../aviso-verificar";
import { AccionesCampana } from "./acciones-campana";

export const metadata = { title: "Campaña · DareFlash" };
// Lee la sesión, la campaña y el aforo: por petición.
export const dynamic = "force-dynamic";

const FECHA = { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" } as const;
const fecha = (ms: number) => new Date(ms).toLocaleDateString("es-ES", FECHA);
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const ID_VALIDO = /^[a-z0-9]{10,40}$/;

/**
 * LA FRASE DE LA ESTIMACIÓN (§3.5 bis). Con «unas» y redondeada a la baja; si la zona no tiene tráfico
 * medido, la cifra de un nivel más amplio DICIENDO DE CUÁL; y si tampoco, se dice. Nunca un 0 sin
 * explicar: «menos de una persona al día» es lo que significa un 0 con datos.
 */
function fraseEstimacion(e: Estimacion): { cifra: string | null; frase: string } {
  if (e.tipo === "zona") {
    return e.personas === 0
      ? { cifra: null, frase: "Con el tráfico de estos días, menos de una persona al día." }
      : {
          cifra: `unas ${e.personas.toLocaleString("es-ES")}`,
          frase: "personas al día la verían, contando con las demás campañas de esas fechas.",
        };
  }
  if (e.tipo === "respaldo") {
    return {
      cifra: `unas ${e.personas.toLocaleString("es-ES")}`,
      frase: `personas al día ven publicidad en ${e.nivelNombre}. Todavía no tenemos tráfico medido en ${e.zonaSinDatos}.`,
    };
  }
  return {
    cifra: null,
    frase: `Todavía no tenemos datos de ${e.zonaSinDatos}: no podemos decirte cuánta gente la verá.`,
  };
}

/**
 * /empresa/publicidad/[id] — LA FICHA DE UNA CAMPAÑA (Fase 9 · P6): la pieza tal como se verá, su zona y
 * su calendario, lo que cuesta, la ESTIMACIÓN antes de pagar (en un borrador o una pausada) y lo que se
 * puede hacer con ella. El ámbito sale del chokepoint: la campaña de otra empresa es un 404, como una
 * que no existe.
 *
 * DOS COLUMNAS EN ESCRITORIO: la pieza a la izquierda (es lo que se compra), las cifras y las acciones a
 * la derecha. En móvil, la pieza arriba y lo demás debajo.
 */
export default async function PaginaCampana({ params }: { params: Promise<{ id: string }> }) {
  const ambito = await ambitoDelPortal();
  if (ambito === null) {
    return (
      <div className="df-rise">
        <h1 className="text-2xl text-text">Campaña</h1>
        <div className="mt-6">
          <AvisoVerificar />
        </div>
      </div>
    );
  }
  const { id } = await params;
  if (!ID_VALIDO.test(id)) notFound();

  const { prisma } = await import("@/server/db/client");
  const { miPublicidad, estimacionDeMiPublicidad, saldoCreditosDe } =
    await import("@/server/services/publicidad");
  const [c, estimacion, saldo] = await Promise.all([
    miPublicidad(prisma, ambito.empresaId, id),
    estimacionDeMiPublicidad(prisma, ambito.empresaId, id),
    saldoCreditosDe(prisma, ambito.empresaId),
  ]);
  if (!c) notFound();

  const acciones = ambito.estado === "VERIFICADA" ? accionesPublicidad(c.estado) : [];
  const diasPorDelante =
    c.estado === "BORRADOR" ? c.diasContratados : Math.max(0, c.diasContratados - c.diasTenidos);
  const coste = costeTotal(c.creditosPorDia, diasPorDelante);
  const hoyMs = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  const est = estimacion ? fraseEstimacion(estimacion) : null;

  return (
    <div className="df-rise space-y-6">
      <div>
        <Link
          href="/empresa/publicidad"
          className="inline-flex min-h-[44px] items-center text-sm text-text-dim underline underline-offset-2 hover:text-text"
        >
          <span aria-hidden="true">←&nbsp;</span>Publicidad
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl break-words text-text">{c.nombre}</h1>
          <span className="rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim">
            {ETIQUETA_ESTADO_PUBLICIDAD[c.estado]}
          </span>
        </div>
        <p className="mt-1 max-w-prose text-sm text-text-dim">{MSG_ESTADO_PUBLICIDAD[c.estado]}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* LA PIEZA, como se verá: imagen, texto y a dónde lleva. Con la marca «Publicidad». */}
        <section aria-labelledby="pieza" className="space-y-2">
          <h2 id="pieza" className={CABECERA}>
            Así se verá
          </h2>
          <Tarjeta className="overflow-hidden p-0">
            {c.imagen ? (
              // eslint-disable-next-line @next/next/no-img-element -- fichero del volumen, servido por Caddy
              <img
                src={c.imagen}
                alt=""
                className="block max-h-[28rem] w-full bg-raised object-contain"
              />
            ) : (
              <div className="grid h-48 place-items-center bg-raised text-sm text-text-dim">
                Sin imagen
              </div>
            )}
            <div className="space-y-2 p-4">
              <span className="text-2xs tracking-widest text-text-dim uppercase">Publicidad</span>
              <p className="text-sm break-words text-text">{c.texto}</p>
              <p className="truncate text-2xs text-text-dim">{c.destinoUrl}</p>
            </div>
          </Tarjeta>
        </section>

        <div className="min-w-0 space-y-6">
          {est ? (
            <Tarjeta className="p-5">
              <h2 className={CABECERA}>Cuánta gente la verá</h2>
              <p className="mt-2 text-sm text-text">
                {est.cifra ? (
                  <span className="text-2xl font-semibold tabular-nums">{est.cifra} </span>
                ) : null}
                {est.frase}
              </p>
              <p className="mt-2 text-2xs text-text-dim">
                Calculado con la gente que ha pasado por el feed en tu zona los últimos días, el
                peor día de tus fechas y redondeado a la baja.
              </p>
            </Tarjeta>
          ) : null}

          <Tarjeta className="p-5">
            <h2 className={CABECERA}>La campaña</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-2xs text-text-dim">Alcance</dt>
                <dd className="text-text">{ETIQUETA_ALCANCE_PUBLICIDAD[c.alcance]}</dd>
              </div>
              <div>
                <dt className="text-2xs text-text-dim">Zona</dt>
                <dd className="break-words text-text">{c.zona}</dd>
              </div>
              <div>
                <dt className="text-2xs text-text-dim">
                  {c.estado === "BORRADOR" ? "Empezaría el" : "Días (UTC)"}
                </dt>
                <dd className="text-text tabular-nums">
                  {c.estado === "BORRADOR" || c.finMs === null
                    ? `${fecha(c.inicioMs)} · ${c.diasContratados} días`
                    : `${fecha(c.inicioMs)} – ${fecha(c.finMs)}`}
                </dd>
              </div>
              <div>
                <dt className="text-2xs text-text-dim">Créditos por día</dt>
                <dd className="text-text tabular-nums">{c.creditosPorDia}</dd>
              </div>
              {diasPorDelante > 0 && c.estado !== "FINALIZADA" && c.estado !== "TERMINADA" ? (
                <div className="sm:col-span-2">
                  <dt className="text-2xs text-text-dim">
                    {c.estado === "BORRADOR" ? "Coste total" : "Le quedan"}
                  </dt>
                  <dd className="text-text tabular-nums">
                    <span className="font-semibold">{coste} créditos</span>
                    {c.estado === "BORRADOR" ? "" : ` (${diasPorDelante} días)`} · tienes {saldo}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Tarjeta>

          {acciones.length > 0 ? (
            <Tarjeta className="p-5">
              <h2 className={CABECERA}>Qué quieres hacer</h2>
              <div className="mt-3">
                <AccionesCampana id={c.id} acciones={acciones} empiezaHoy={c.inicioMs <= hoyMs} />
              </div>
              {c.estado === "BORRADOR" || c.estado === "PAUSADA" ? (
                <p className="mt-3 text-2xs text-text-dim">{MSG_SALDO_NO_RETENIDO}</p>
              ) : null}
            </Tarjeta>
          ) : null}

          <p className="text-2xs text-text-dim">{MSG_PUBLICIDAD_AUN_NO_SALE}</p>
        </div>
      </div>
    </div>
  );
}
