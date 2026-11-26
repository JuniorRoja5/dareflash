import { Enlace } from "@/components/enlace";
import { notFound } from "next/navigation";

import { Tarjeta } from "@/components/ui/tarjeta";
import { TarjetaAnuncio } from "@/components/ui/tarjeta-anuncio";
import { TextosProvider } from "@/components/textos-provider";
import { accionesPublicidad, costeTotal, diasPorDelante } from "@/lib/publicidad";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";
import type { Estimacion } from "@/server/services/publicidad";
import type { FuncionT } from "@/textos/plantilla";
import type { FuncionTRico } from "@/textos/rico";
import { alcanceCampana, estadoCampana, fraseInicioDelDia, fraseSaldo } from "@/textos/publicidad";
import { textos, textosClienteDeLaPeticion, textosRicos, type Textos } from "@/textos/servidor";

import { ambitoDelPortal } from "../../ambito-portal";
import { AvisoVerificar } from "../../aviso-verificar";
import { AccionesCampana } from "./acciones-campana";
import { InformeCampana } from "./informe-campana";
import { formatearNumero, formatearDiaClave, type Idioma } from "@/lib/formato";

export async function generateMetadata() {
  return { title: (await textos("publicidad"))("tituloFicha") };
}
// Lee la sesión, la campaña y el aforo: por petición.
export const dynamic = "force-dynamic";

/** Los días de una campaña son CLAVES de día UTC: etiquetas de calendario, sin zona (Fase 11). */
const fecha = (ms: number, idioma: Idioma) => formatearDiaClave(new Date(ms), idioma, "diaMesAno");
/** Sin año: el tramo «6 nov – 12 nov 2026» lo dice una vez y cabe en una línea a 390. */
const fechaSinAno = (ms: number, idioma: Idioma) =>
  formatearDiaClave(new Date(ms), idioma, "diaMes");
const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const ID_VALIDO = /^[a-z0-9]{10,40}$/;

/**
 * LA FRASE DE LA ESTIMACIÓN (§3.5 bis). Con «unas» y redondeada a la baja; si la zona no tiene tráfico
 * medido, la cifra de un nivel más amplio DICIENDO DE CUÁL; y si tampoco, se dice. Nunca un 0 sin
 * explicar: «menos de una persona al día» es lo que significa un 0 con datos.
 */
function fraseEstimacion(
  t: FuncionT<Textos["publicidad"]>,
  tr: FuncionTRico<Textos["publicidad"]>,
  e: Estimacion,
  idioma: Idioma,
): React.ReactNode {
  // La cifra va resaltada DENTRO de su frase (una clave; antes, dos trozos con la etiqueta en medio).
  const cifra = { resaltado: { className: "text-2xl font-semibold tabular-nums" } };
  if (e.tipo === "zona") {
    return e.personas === 0
      ? t("estMenosDeUna")
      : tr("estZona", cifra, { personas: formatearNumero(e.personas, idioma) });
  }
  if (e.tipo === "respaldo") {
    return tr("estRespaldo", cifra, {
      personas: formatearNumero(e.personas, idioma),
      nivel: e.nivelNombre,
      zona: e.zonaSinDatos,
    });
  }
  return t("estSinDatos", { zona: e.zonaSinDatos });
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
export default async function PaginaCampana({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ambito = await ambitoDelPortal();
  const { idiomaDeLaPeticion } = await import("@/server/formato-peticion");
  const idioma = await idiomaDeLaPeticion();
  const [t, tr, tc] = await Promise.all([
    textos("publicidad"),
    textosRicos("publicidad"),
    textos("campanaComun"),
  ]);
  if (ambito === null) {
    return (
      <div className="df-rise">
        <h1 className="text-2xl text-text">{t("tituloFicha")}</h1>
        <div className="mt-6">
          <AvisoVerificar />
        </div>
      </div>
    );
  }
  const { id } = await params;
  if (!ID_VALIDO.test(id)) notFound();
  const sp = await searchParams;
  const cursor = typeof sp["cursor"] === "string" ? sp["cursor"].trim().slice(0, 20) : "";
  const aqui: Paginacion = { cursor: cursor || null, pila: leerPila(sp["pila"]) };

  const { prisma } = await import("@/server/db/client");
  const { miPublicidad, estimacionDeMiPublicidad, saldoCreditosDe } =
    await import("@/server/services/publicidad");
  const { miEmpresa } = await import("@/server/services/empresas");
  const { informeDeMiCampana } = await import("@/server/services/publicidad-metricas");
  const { piezaDeCampana } = await import("@/server/services/publicidad-entrega");
  const [c, estimacion, saldo, empresa, informe] = await Promise.all([
    miPublicidad(prisma, ambito.empresaId, id),
    estimacionDeMiPublicidad(prisma, ambito.empresaId, id),
    // Lo comprometido SIN esta campaña: es lo que se le restará al activarla o reanudarla.
    saldoCreditosDe(prisma, ambito.empresaId, { excluirPublicidadId: id }),
    miEmpresa(prisma, ambito.empresaId),
    // P10: sus resultados por día (un borrador no tiene: se pinta sin la sección).
    informeDeMiCampana(prisma, ambito.empresaId, id, aqui.cursor),
  ]);
  if (!c) notFound();

  const acciones = ambito.estado === "VERIFICADA" ? accionesPublicidad(c.estado) : [];
  const porDelante = diasPorDelante(c.estado, c.diasContratados, c.diasTenidos);
  const coste = costeTotal(c.creditosPorDia, porDelante);
  const hoyMs = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  const est = estimacion ? fraseEstimacion(t, tr, estimacion, idioma) : null;
  // A qué hora de SU país empieza cada día (los días son UTC; decir «UTC» a una empresa es jerga).
  const inicioDelDia = empresa ? fraseInicioDelDia(tc, empresa.paisIso, new Date()) : null;

  return (
    <div className="df-rise space-y-6">
      <div>
        <Enlace
          href="/empresa/publicidad"
          className="inline-flex min-h-[44px] items-center text-sm text-text-dim underline underline-offset-2 hover:text-text"
        >
          <span aria-hidden="true">←&nbsp;</span>
          {tc("volver")}
        </Enlace>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl break-words text-text">{c.nombre}</h1>
          <span className="rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim">
            {estadoCampana(t, c.estado)}
          </span>
        </div>
        <p className="mt-1 max-w-prose text-sm text-text-dim">{t(`relato_${c.estado}`)}</p>
        {/* P8: EL MOTIVO de la retirada, el de la lista cerrada (la nota interna no viaja al portal). */}
        {c.motivoRetirada ? (
          <p className="mt-2 max-w-prose rounded-sm border border-line bg-surface p-3 text-sm text-text">
            {t("motivoRetirada", { motivo: c.motivoRetirada })}
          </p>
        ) : null}
      </div>

      {/* LA PIEZA, como se verá. NO es un dibujo aparte: es `TarjetaAnuncio` con la pieza que hace
          `piezaDeCampana`, las dos mismas que usa el reparto. Lo que la empresa ve es lo que se publica
          (un test lo exige). A todo el ancho: así se ve la disposición de escritorio de la portada, y
          en móvil, la de móvil. `previa`: «Visitar» no navega ni cuenta un clic. */}
      <section aria-labelledby="pieza" className="space-y-2">
        <h2 id="pieza" className={CABECERA}>
          {t("asiSeVera")}
        </h2>
        <TarjetaAnuncio pieza={piezaDeCampana(c)} previa />
        <p className="max-w-prose text-2xs break-words text-text-dim">
          {tr("llevaA", { resaltado: { className: "text-text" } }, { url: c.destinoUrl })}
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-6">
          {est ? (
            <Tarjeta className="p-5">
              <h2 className={CABECERA}>{t("cuantaGente")}</h2>
              <p className="mt-2 text-sm text-text">{est}</p>
              <p className="mt-2 text-2xs text-text-dim">{t("estComo")}</p>
            </Tarjeta>
          ) : null}

          <Tarjeta className="p-5">
            <h2 className={CABECERA}>{t("laCampana")}</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-2xs text-text-dim">{t("dato_alcance")}</dt>
                <dd className="text-text">{alcanceCampana(tc, c.alcance)}</dd>
              </div>
              <div>
                <dt className="text-2xs text-text-dim">{t("dato_zona")}</dt>
                <dd className="break-words text-text">{c.zona}</dd>
              </div>
              <div>
                <dt className="text-2xs text-text-dim">
                  {c.estado === "BORRADOR" ? t("dato_empezaria") : t("dato_dias")}
                </dt>
                <dd className="text-text tabular-nums">
                  {c.estado === "BORRADOR" || c.finMs === null
                    ? t("borradorDias", {
                        fecha: fecha(c.inicioMs, idioma),
                        dias: String(c.diasContratados),
                      })
                    : t("tramo", {
                        desde: fechaSinAno(c.inicioMs, idioma),
                        hasta: fecha(c.finMs, idioma),
                      })}
                </dd>
              </div>
              <div>
                <dt className="text-2xs text-text-dim">{t("dato_crDia")}</dt>
                <dd className="text-text tabular-nums">{c.creditosPorDia}</dd>
              </div>
              {porDelante > 0 ? (
                <div className="sm:col-span-2">
                  <dt className="text-2xs text-text-dim">
                    {c.estado === "BORRADOR" ? t("dato_coste") : t("dato_quedan")}
                  </dt>
                  <dd className="text-text tabular-nums">
                    {c.estado === "BORRADOR"
                      ? tr(
                          "costeBorrador",
                          { resaltado: { className: "font-semibold" } },
                          { coste: String(coste) },
                        )
                      : tr(
                          "costeQuedan",
                          { resaltado: { className: "font-semibold" } },
                          { coste: String(coste), dias: String(porDelante) },
                        )}
                  </dd>
                  {/* Antes de comprometer (borrador o pausada): contra lo DISPONIBLE se comprobará. */}
                  {c.estado === "BORRADOR" || c.estado === "PAUSADA" ? (
                    <dd className="mt-1 text-2xs text-text-dim">
                      {fraseSaldo(tc, saldo.saldo, saldo.comprometido)}
                    </dd>
                  ) : null}
                </div>
              ) : null}
            </dl>
            {inicioDelDia ? <p className="mt-3 text-2xs text-text-dim">{inicioDelDia}</p> : null}
          </Tarjeta>
        </div>

        <div className="min-w-0 space-y-6">
          {acciones.length > 0 ? (
            <Tarjeta className="p-5">
              <h2 className={CABECERA}>{t("queHacer")}</h2>
              <div className="mt-3">
                <TextosProvider
                  textos={await textosClienteDeLaPeticion(["accionesCampana"] as const)}
                >
                  <AccionesCampana id={c.id} acciones={acciones} empiezaHoy={c.inicioMs <= hoyMs} />
                </TextosProvider>
              </div>
              {c.estado === "BORRADOR" || c.estado === "PAUSADA" ? (
                <p className="mt-3 text-2xs text-text-dim">{tc("saldoNoRetenido")}</p>
              ) : null}
            </Tarjeta>
          ) : null}
        </div>
      </div>

      {informe && c.estado !== "BORRADOR" ? (
        <InformeCampana
          informe={informe}
          aqui={aqui}
          base={`/empresa/publicidad/${c.id}`}
          idioma={idioma}
        />
      ) : null}
    </div>
  );
}
