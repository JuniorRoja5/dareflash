import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { Tarjeta } from "@/components/ui/tarjeta";
import { TarjetaMetrica } from "@/components/ui/tarjeta-metrica";
import { TextosProvider } from "@/components/textos-provider";
import { paquetesCreditosEnVenta } from "@/lib/creditos-precio";
import { puedeOperarEmpresa } from "@/lib/empresa";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";

import { ambitoDelPortal } from "../ambito-portal";
import { AvisoVerificar } from "../aviso-verificar";
import { MovimientosCreditos } from "../movimientos-creditos";
import { ComprarCreditos } from "./comprar-creditos";
import { formatearNumero, formatearImporte } from "@/lib/formato";
import { creditoDia, queEsUnCredito } from "@/textos/empresa";
import { textos, textosClienteDeLaPeticion } from "@/textos/servidor";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("creditosEmpresa") };
}
// Lee la sesión y el ledger de la empresa: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 80) : "";

/**
 * Lo que se dice al volver de Stripe (`?compra=`) o de un recibo que no se pudo abrir (`?recibo=`): la
 * clave de su frase en `creditosEmpresa`. Lo que no está aquí no se dice.
 */
const AVISOS = {
  ok: "aviso_ok",
  cancelada: "aviso_cancelada",
  "no-disponible": "aviso_noDisponible",
} as const;
const claveAviso = (v: string) =>
  Object.hasOwn(AVISOS, v) ? AVISOS[v as keyof typeof AVISOS] : null;

/**
 * /empresa/creditos — LOS CRÉDITOS DE PUBLICIDAD: el saldo y el historial ENTERO, paginado por keyset
 * (nunca OFFSET). El Resumen solo enseña el saldo y enlaza aquí.
 *
 * Siempre «créditos de publicidad», nunca «puntos». El ámbito sale del chokepoint, nunca de la URL: la
 * pantalla no sabe pedir el ledger de otra empresa. Y la nota de un ajuste no está: el DTO del dueño no
 * la trae.
 */
export default async function PaginaCreditos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ambito = await ambitoDelPortal();
  // El idioma y la zona de la empresa que mira (Fase 11): cifras y fechas salen de `lib/formato`.
  const { idiomaDeLaPeticion, zonaDeLaPeticion } = await import("@/server/formato-peticion");
  const [idioma, zona] = await Promise.all([idiomaDeLaPeticion(), zonaDeLaPeticion()]);
  const [t, tn] = await Promise.all([textos("creditosEmpresa"), textos("negocio")]);
  if (ambito === null) {
    return (
      <div className="df-rise">
        <h1 className="text-2xl text-text">{t("titulo")}</h1>
        <div className="mt-6">
          <AvisoVerificar />
        </div>
      </div>
    );
  }
  const sp = await searchParams;
  const aqui: Paginacion = { cursor: texto(sp["cursor"]) || null, pila: leerPila(sp["pila"]) };

  const { prisma } = await import("@/server/db/client");
  const { misCreditos } = await import("@/server/services/creditos");
  const { miEmpresa } = await import("@/server/services/empresas");
  // SU tipo de negocio: la tarifa que se le cuenta es solo la de lo que puede comprar.
  const [creditos, empresa] = await Promise.all([
    misCreditos(prisma, ambito.empresaId, { cursor: aqui.cursor }),
    miEmpresa(prisma, ambito.empresaId),
  ]);

  // P11: LA COMPRA. Sin claves de Stripe (o sin verificar) se ven los paquetes pero no se ofrece el
  // botón, y se dice por qué. `env` se lee aquí, por petición (nunca en ámbito de módulo).
  const { env } = await import("@/config/env");
  const pagosConfigurados = Boolean(env.STRIPE_SECRET_KEY);
  const verificada = puedeOperarEmpresa(ambito.estado);
  const tCompra = await textos("creditosCompra");
  const motivoBloqueo = !pagosConfigurados
    ? tCompra("pagoNoDisponible")
    : !verificada
      ? tCompra("sinVerificar")
      : null;
  const paquetes = paquetesCreditosEnVenta().map((p) => ({
    clave: p.clave,
    creditos: p.creditos,
    precioCents: p.precioCents,
    // El precio por crédito se escribe AQUÍ: Intl en el servidor, para que no difiera al hidratar.
    porCredito: formatearImporte(p.porCreditoCents, idioma),
    mejorPrecio: p.mejorPrecio,
  }));
  const clave = claveAviso(texto(sp["compra"]) || texto(sp["recibo"]));
  const aviso = clave ? t(clave) : null;

  return (
    <div className="df-rise space-y-6">
      <div>
        <h1 className="text-2xl text-text">{t("titulo")}</h1>
        <p className="mt-1 max-w-prose text-sm text-text-dim">
          {/* DECIDIDO: sin tipo conocido (o fuera del catálogo), la horquilla pública. */}
          {empresa?.tipoNegocio
            ? queEsUnCredito(tn, empresa.tipoNegocio, idioma)
            : creditoDia(tn, idioma)}{" "}
          {t("todosMovimientos")}
        </p>
      </div>

      {/* LA VUELTA DE STRIPE (o del recibo), arriba: responde a «¿se ha cobrado?» antes que nada. */}
      {aviso ? (
        <p
          role="status"
          className="max-w-prose rounded-sm border border-line bg-surface p-3 text-sm text-text"
        >
          {aviso}
        </p>
      ) : null}

      {/* EN ESCRITORIO, EL SALDO AL LADO DE SU HISTORIAL (y pegado al hacer scroll); en móvil, encima. */}
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <TarjetaMetrica
            etiqueta={t("saldo")}
            valor={formatearNumero(creditos.saldo, idioma)}
            pie={t("saldoPie", { n: creditos.saldo })}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <Tarjeta className="p-5 lg:p-6">
            <TextosProvider textos={await textosClienteDeLaPeticion(["creditosCompra"] as const)}>
              <ComprarCreditos
                paquetes={paquetes}
                puedeComprar={motivoBloqueo === null}
                motivoBloqueo={motivoBloqueo}
              />
            </TextosProvider>
          </Tarjeta>

          <section aria-labelledby="movimientos" className="min-w-0">
            <Tarjeta className="p-5 lg:p-6">
              <h2 id="movimientos" className="text-base font-semibold text-text">
                {t("movimientos")}
              </h2>
              <div className="mt-3">
                <MovimientosCreditos
                  movimientos={creditos.movimientos}
                  idioma={idioma}
                  zona={zona}
                />
              </div>
            </Tarjeta>
            {/* Fuera del `if` de la lista: una página posterior vacía no encierra a nadie. */}
            <PasosKeyset base="/empresa/creditos" aqui={aqui} proximoCursor={creditos.nextCursor} />
          </section>
        </div>
      </div>
    </div>
  );
}
