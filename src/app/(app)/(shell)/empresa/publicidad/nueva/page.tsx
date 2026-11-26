import { Enlace } from "@/components/enlace";

import { TextosProvider } from "@/components/textos-provider";
import { Tarjeta } from "@/components/ui/tarjeta";
import {
  CREDITOS_POR_DIA,
  PUBLICIDAD_MAX_POR_ZONA,
  PUBLICIDAD_RESERVA_MAX_DIAS,
} from "@/config/constants";
import { alcancesPermitidos } from "@/lib/empresa";
import { paisesParaElegir } from "@/lib/paises";
import { formatearNumero } from "@/lib/formato";
import { claveDia, diaDe, sumarDias } from "@/lib/publicidad";
import { creditoDia, queEsUnCredito } from "@/textos/empresa";
import { fraseInicioDelDia } from "@/textos/publicidad";
import { textos, textosClienteDeLaPeticion } from "@/textos/servidor";

import { ambitoDelPortal } from "../../ambito-portal";
import { AvisoVerificar } from "../../aviso-verificar";
import { FormularioCampana } from "./formulario-campana";

export async function generateMetadata() {
  return { title: (await textos("nuevaCampana"))("titulo") };
}
// Lee la sesión, el saldo y el catálogo: por petición.
export const dynamic = "force-dynamic";

const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/** Lo que pasa con una campaña, en orden (`nuevaCampana.paso1..3`). Lo que de verdad hace el flujo. */
const PASOS = ["paso1", "paso2", "paso3"] as const;

/**
 * /empresa/publicidad/nueva — CREAR UNA CAMPAÑA (Fase 9 · P6).
 *
 * Solo una empresa VERIFICADA ve el formulario; a las demás se les dice por qué no (la pantalla no
 * promete lo que el servidor niega). Lo que el formulario necesita del catálogo —las regiones de su
 * país, los países que existen— se lee AQUÍ, en el servidor, y la lista de países llega ya ordenada:
 * ordenarla en el cliente con Intl no hidrata igual que en el servidor.
 *
 * DOS COLUMNAS EN ESCRITORIO: el formulario y, pegado al lado, cómo funciona y lo que cuesta. En móvil,
 * ese panel va debajo.
 */
export default async function PaginaNuevaCampana() {
  const ambito = await ambitoDelPortal();

  const { prisma } = await import("@/server/db/client");
  const { miEmpresa } = await import("@/server/services/empresas");
  // SU tipo de negocio, ANTES de la cabecera: la tarifa que se le cuenta es solo la de lo que puede
  // comprar. Sin correo confirmado (`ambito === null`) aún no se sabe, y va la horquilla general.
  const empresa = ambito ? await miEmpresa(prisma, ambito.empresaId) : null;
  const { idiomaDeLaPeticion } = await import("@/server/formato-peticion");
  const idioma = await idiomaDeLaPeticion();
  const [t, tn, tc] = await Promise.all([
    textos("nuevaCampana"),
    textos("negocio"),
    textos("campanaComun"),
  ]);

  const cabecera = (
    <div>
      <Enlace
        href="/empresa/publicidad"
        className="inline-flex min-h-[44px] items-center text-sm text-text-dim underline underline-offset-2 hover:text-text"
      >
        <span aria-hidden="true">←&nbsp;</span>
        {tc("volver")}
      </Enlace>
      <h1 className="text-2xl text-text">{t("titulo")}</h1>
      <p className="mt-1 max-w-prose text-sm text-text-dim">
        {/* DECIDIDO, no por defecto: sin empresa resuelta (correo sin confirmar) o con un tipo fuera
            del catálogo no se sabe qué puede comprar, y va la horquilla pública, que es verdad para
            cualquiera. Con tipo, solo sus alcances. */}
        {empresa?.tipoNegocio
          ? queEsUnCredito(tn, empresa.tipoNegocio, idioma)
          : creditoDia(tn, idioma)}{" "}
        {t("sinRevision")}
      </p>
    </div>
  );

  if (ambito === null || ambito.estado !== "VERIFICADA") {
    return (
      <div className="df-rise space-y-6">
        {cabecera}
        {ambito === null ? (
          <AvisoVerificar />
        ) : (
          <Tarjeta className="max-w-prose p-5">
            <p className="text-sm text-text-dim">{t("sinVerificar")}</p>
          </Tarjeta>
        )}
      </div>
    );
  }

  const { paisesDelCatalogo, regionesDePais, saldoCreditosDe } =
    await import("@/server/services/publicidad");

  if (!empresa) return null;
  // UN TIPO DE NEGOCIO FUERA DEL CATÁLOGO (no debería pasar: el alta lo valida) deja la pantalla sin
  // saber qué alcances ofrecer. Se dice, en vez de pintar un formulario sin opciones o romper.
  if (!empresa.tipoNegocio) {
    return (
      <div className="df-rise space-y-6">
        {cabecera}
        <Tarjeta className="max-w-prose p-5">
          <p className="text-sm text-text-dim">{t("tipoNegocioDesconocido")}</p>
        </Tarjeta>
      </div>
    );
  }
  const alcances = alcancesPermitidos(empresa.tipoNegocio);
  const local = alcances.includes("CIUDAD") || alcances.includes("ESTADO");
  const [regiones, catalogo, saldo] = await Promise.all([
    local ? regionesDePais(prisma, empresa.paisIso) : Promise.resolve([]),
    local ? Promise.resolve(new Set<string>()) : paisesDelCatalogo(prisma),
    saldoCreditosDe(prisma, ambito.empresaId),
  ]);
  const paises = local ? [] : paisesParaElegir().filter((p) => catalogo.has(p.iso));
  const hoy = diaDe(new Date());

  return (
    <div className="df-rise space-y-6">
      {cabecera}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <div className="min-w-0">
          <TextosProvider
            textos={await textosClienteDeLaPeticion([
              "campanaFormulario",
              "campanaComun",
              "buscadorCiudad",
            ] as const)}
          >
            <FormularioCampana
              alcances={alcances}
              pais={empresa.paisIso}
              regiones={regiones}
              paises={paises}
              saldo={saldo.saldo}
              comprometido={saldo.comprometido}
              hoy={claveDia(hoy)}
              ultimoInicio={claveDia(sumarDias(hoy, PUBLICIDAD_RESERVA_MAX_DIAS))}
              inicioDelDia={fraseInicioDelDia(tc, empresa.paisIso, hoy)}
            />
          </TextosProvider>
        </div>
        <aside aria-label={t("comoFunciona")} className="space-y-4 lg:sticky lg:top-24">
          <Tarjeta className="p-5">
            <h2 className={CABECERA}>{t("comoFunciona")}</h2>
            <ol className="mt-3 space-y-2 text-sm text-text-dim">
              {PASOS.map((p, i) => (
                <li key={p} className="flex gap-3">
                  <span className="w-4 shrink-0 font-semibold text-text tabular-nums">{i + 1}</span>
                  <span>{t(p)}</span>
                </li>
              ))}
            </ol>
          </Tarjeta>
          <Tarjeta className="p-5">
            <h2 className={CABECERA}>{t("loQueCuesta")}</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {alcances.map((a) => (
                <div key={a} className="flex justify-between gap-3">
                  <dt className="text-text-dim">{t(`tarifa_${a}`)}</dt>
                  <dd className="text-text tabular-nums">
                    {t("cr", { creditos: formatearNumero(CREDITOS_POR_DIA[a], idioma) })}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-2xs text-text-dim">
              {t("limites", {
                max: String(PUBLICIDAD_MAX_POR_ZONA),
                dias: String(PUBLICIDAD_RESERVA_MAX_DIAS),
              })}
            </p>
          </Tarjeta>
          <p className="text-2xs text-text-dim">{tc("saldoNoRetenido")}</p>
        </aside>
      </div>
    </div>
  );
}
