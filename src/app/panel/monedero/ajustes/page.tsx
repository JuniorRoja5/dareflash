import Link from "next/link";

import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { importeConMoneda } from "@/lib/dinero";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";

import { requireSeccion } from "../../panel-guard";

export const metadata = { title: "Ajustes de saldo · Panel" };
export const dynamic = "force-dynamic";

const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

function cuando(fecha: Date): string {
  return fecha.toLocaleString("es-ES", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * HISTORIAL DE AJUSTES MANUALES DE SALDO — la evidencia de cada céntimo movido a mano.
 *
 * ┌─ POR QUÉ ESTA PANTALLA EXISTE ────────────────────────────────────────────────────────────────┐
 * │ El ajuste se construyó con su traza en el `AuditLog` desde el primer día, pero sin ninguna    │
 * │ forma de VERLA: había que entrar en la base de datos. Una auditoría que solo se puede         │
 * │ consultar por SQL no la consulta nadie, y entonces no es una auditoría — es una tabla.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SALE DEL `AuditLog` Y NO DEL LEDGER, porque el ledger no tiene dónde guardar el motivo (ver
 * `listarAjustesMonedero`): una lista de importes sin el porqué no sirve para revisar nada.
 *
 * AQUÍ SÍ SE ENSEÑA EL MOTIVO Y QUIÉN LO FIRMÓ. Es la vista del ADMIN; lo que no puede verlos es el
 * dueño de la cuenta, y de eso se encarga el DTO de su historial, no esta pantalla.
 *
 * ES SU PROPIA RUTA y no una pestaña con estado: así la paginación de esta lista no choca con la de
 * la cola de retiradas —dos listas en una página se pelean por el mismo `?cursor=`— y el historial
 * se puede enlazar tal cual. Hereda la sección (y por tanto el rol ADMIN) de `/panel/monedero`.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSeccion("/panel/monedero/ajustes");

  const sp = await searchParams;
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 300) : null,
    pila: leerPila(sp["pila"]),
  };

  const { prisma } = await import("@/server/db/client");
  const { listarAjustesMonedero } = await import("@/server/services/monedero-admin");
  const pagina = await listarAjustesMonedero(prisma, { cursor: aqui.cursor });

  return (
    <div className="space-y-8">
      <header>
        <h1 style={ESTILO_TITULO} className="text-2xl text-text">
          Ajustes de saldo
        </h1>
        <p className="mt-2 max-w-prose text-sm text-text-dim">
          Cada vez que alguien del equipo acredita o descuenta dinero a mano queda una línea aquí,
          con quién lo hizo, a quién, cuánto y por qué. La persona ve el movimiento en su monedero,
          pero no el motivo ni tu nombre.
        </p>
        <Link
          href="/panel/monedero"
          className="mt-3 inline-block min-h-[36px] rounded-sm border border-line px-3 py-1.5 text-sm text-text-dim transition-colors hover:bg-raised"
        >
          ← Volver a las retiradas
        </Link>
      </header>

      {pagina.items.length === 0 ? (
        <p className="text-sm text-text-dim">Todavía no se ha ajustado ningún saldo a mano.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {pagina.items.map((a) => {
            const entra = a.deltaCents > 0;
            return (
              <li key={a.id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    {/* EL SIGNO SIEMPRE: en una lista con ajustes en los dos sentidos, un importe
                        sin signo obliga a deducir la dirección del resto de la fila. */}
                    <span
                      className={`text-base font-medium tabular-nums ${entra ? "text-money" : "text-text"}`}
                    >
                      {entra ? "+" : "−"}
                      {importeConMoneda(Math.abs(a.deltaCents))}
                    </span>
                    <span className="ml-2 text-sm text-text-dim">
                      a @{a.usuarioUsername ?? "(cuenta borrada)"}
                    </span>
                  </span>
                  <span className="text-2xs tracking-widest text-text-dim uppercase">
                    {a.adminUsername ? `por @${a.adminUsername}` : "por (cuenta borrada)"} ·{" "}
                    {cuando(a.createdAt)} UTC
                  </span>
                </div>

                {/* EL SALDO DE ANTES Y EL DE DESPUÉS, que es lo que convierte la línea en auditable:
                    sin ellos hay que recomponer el ledger entero para saber sobre qué se aplicó. */}
                {a.antesCents !== null && a.despuesCents !== null ? (
                  <p className="text-xs tabular-nums text-text-dim">
                    {importeConMoneda(a.antesCents)} → {importeConMoneda(a.despuesCents)}
                  </p>
                ) : null}

                <p className="max-w-prose rounded-sm border border-line bg-raised/40 p-3 text-xs text-text">
                  {a.nota ?? <span className="text-text-dim">(sin motivo registrado)</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* Fuera del `if`: una página sin filas tiene que conservar su "Anterior". */}
      <PasosKeyset
        base="/panel/monedero/ajustes"
        aqui={aqui}
        proximoCursor={pagina.proximoCursor}
      />
    </div>
  );
}
