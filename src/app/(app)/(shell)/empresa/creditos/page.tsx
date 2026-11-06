import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { Tarjeta } from "@/components/ui/tarjeta";
import { TarjetaMetrica } from "@/components/ui/tarjeta-metrica";
import { fraseQueEsUnCredito } from "@/config/constants";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";

import { ambitoDelPortal } from "../ambito-portal";
import { AvisoVerificar } from "../aviso-verificar";
import { MovimientosCreditos } from "../movimientos-creditos";

export const metadata = { title: "Créditos de publicidad · DareFlash" };
// Lee la sesión y el ledger de la empresa: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

const texto = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v.trim().slice(0, 80) : "";

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
  if (ambito === null) {
    return (
      <div className="df-rise">
        <h1 className="text-2xl text-text">Créditos de publicidad</h1>
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
  const creditos = await misCreditos(prisma, ambito.empresaId, { cursor: aqui.cursor });

  return (
    <div className="df-rise space-y-6">
      <div>
        <h1 className="text-2xl text-text">Créditos de publicidad</h1>
        <p className="mt-1 max-w-prose text-sm text-text-dim">
          {fraseQueEsUnCredito()} Aquí tienes todos tus movimientos.
        </p>
      </div>

      {/* EN ESCRITORIO, EL SALDO AL LADO DE SU HISTORIAL (y pegado al hacer scroll); en móvil, encima. */}
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <TarjetaMetrica
            etiqueta="Saldo"
            valor={creditos.saldo.toLocaleString("es-ES")}
            pie={creditos.saldo === 1 ? "crédito de publicidad" : "créditos de publicidad"}
          />
        </div>

        <section aria-labelledby="movimientos" className="min-w-0">
          <Tarjeta className="p-5 lg:p-6">
            <h2 id="movimientos" className="text-base font-semibold text-text">
              Movimientos
            </h2>
            <div className="mt-3">
              <MovimientosCreditos movimientos={creditos.movimientos} />
            </div>
          </Tarjeta>
          {/* Fuera del `if` de la lista: una página posterior vacía no encierra a nadie. */}
          <PasosKeyset base="/empresa/creditos" aqui={aqui} proximoCursor={creditos.nextCursor} />
        </section>
      </div>
    </div>
  );
}
