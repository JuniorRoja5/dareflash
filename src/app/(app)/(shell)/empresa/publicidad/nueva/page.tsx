import Link from "next/link";

import { Tarjeta } from "@/components/ui/tarjeta";
import {
  fraseQueEsUnCredito,
  CREDITOS_POR_DIA,
  MSG_SALDO_NO_RETENIDO,
  PUBLICIDAD_MAX_POR_ZONA,
  PUBLICIDAD_RESERVA_MAX_DIAS,
} from "@/config/constants";
import { alcancesPermitidos } from "@/lib/empresa";
import { paisesParaElegir } from "@/lib/paises";
import { claveDia, diaDe, sumarDias } from "@/lib/publicidad";
import { fraseInicioDelDia } from "@/lib/zona-horaria-pais";

import { ambitoDelPortal } from "../../ambito-portal";
import { AvisoVerificar } from "../../aviso-verificar";
import { FormularioCampana } from "./formulario-campana";

export const metadata = { title: "Nueva campaña · DareFlash" };
// Lee la sesión, el saldo y el catálogo: por petición.
export const dynamic = "force-dynamic";

const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/** Lo que pasa con una campaña, en orden. Lo que de verdad hace el flujo, ni un paso más. */
const PASOS = [
  "Creas el borrador: todavía no ocupa días ni gasta créditos.",
  "En su ficha ves cuánta gente la verá al día y cuánto cuesta.",
  "La activas (o la programas para otro día) y reserva sus días.",
] as const;

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

  const cabecera = (
    <div>
      <Link
        href="/empresa/publicidad"
        className="inline-flex min-h-[44px] items-center text-sm text-text-dim underline underline-offset-2 hover:text-text"
      >
        <span aria-hidden="true">←&nbsp;</span>Publicidad
      </Link>
      <h1 className="text-2xl text-text">Nueva campaña</h1>
      <p className="mt-1 max-w-prose text-sm text-text-dim">
        {fraseQueEsUnCredito(empresa?.tipoNegocio)} Sin revisión previa: la activas tú.
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
            <p className="text-sm text-text-dim">
              Podrás crear campañas en cuanto verifiquemos tu empresa. Te escribiremos cuando esté.
            </p>
          </Tarjeta>
        )}
      </div>
    );
  }

  const { paisesDelCatalogo, regionesDePais, saldoCreditosDe } =
    await import("@/server/services/publicidad");

  if (!empresa) return null;
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
          <FormularioCampana
            alcances={alcances}
            pais={empresa.paisIso}
            regiones={regiones}
            paises={paises}
            saldo={saldo.saldo}
            comprometido={saldo.comprometido}
            hoy={claveDia(hoy)}
            ultimoInicio={claveDia(sumarDias(hoy, PUBLICIDAD_RESERVA_MAX_DIAS))}
            inicioDelDia={fraseInicioDelDia(empresa.paisIso, hoy)}
          />
        </div>
        <aside aria-label="Cómo funciona" className="space-y-4 lg:sticky lg:top-24">
          <Tarjeta className="p-5">
            <h2 className={CABECERA}>Cómo funciona</h2>
            <ol className="mt-3 space-y-2 text-sm text-text-dim">
              {PASOS.map((p, i) => (
                <li key={p} className="flex gap-3">
                  <span className="w-4 shrink-0 font-semibold text-text tabular-nums">{i + 1}</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
          </Tarjeta>
          <Tarjeta className="p-5">
            <h2 className={CABECERA}>Lo que cuesta un día</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {alcances.map((a) => (
                <div key={a} className="flex justify-between gap-3">
                  <dt className="text-text-dim">
                    {a === "CIUDAD"
                      ? "Ciudad (y 100 km)"
                      : a === "ESTADO"
                        ? "Región"
                        : a === "PAIS"
                          ? "Cada país"
                          : "Todo el mundo"}
                  </dt>
                  <dd className="text-text tabular-nums">{CREDITOS_POR_DIA[a]} cr.</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-2xs text-text-dim">
              Como mucho {PUBLICIDAD_MAX_POR_ZONA} campañas por zona y día, para que cada una se
              vea. Puedes empezar hasta dentro de {PUBLICIDAD_RESERVA_MAX_DIAS} días.
            </p>
          </Tarjeta>
          <p className="text-2xs text-text-dim">{MSG_SALDO_NO_RETENIDO}</p>
        </aside>
      </div>
    </div>
  );
}
