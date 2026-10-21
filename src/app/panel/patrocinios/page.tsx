import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { bpsAPorcentaje } from "@/lib/comision";
import { centimosAImporte } from "@/lib/dinero";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";

import { requireSeccion } from "../panel-guard";

import { ExportarContabilidad } from "./exportar-contabilidad";

export const metadata = { title: "Patrocinios · Panel" };
export const dynamic = "force-dynamic";

const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

function cuando(ms: number): string {
  return new Date(ms).toLocaleDateString("es-ES", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * PATROCINIOS (Fase 9 · P1) — qué le toca pagar a cada marca.
 *
 * ┌─ ESTA PANTALLA NO MUEVE DINERO ──────────────────────────────────────────────────────────────┐
 * │ El sponsor paga POR FUERA y el ganador cobra el premio íntegro por el rail de siempre. Aquí   │
 * │ solo se LEE, y el trabajo que hace es que cobrar sea leer una cifra en vez de reconstruirla a │
 * │ mano reto a reto. Ni un botón que escriba nada.                                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Y NO HAY UN TOTAL GENERAL, QUE ES UNA DECISIÓN ─────────────────────────────────────────────┐
 * │ La tabla está paginada por keyset, así que un "total" calculado sobre la página visible diría │
 * │ 3.000 € donde hay 30.000 — y esa es justo la cifra que alguien copiaría a una factura. Sumar  │
 * │ TODO exigiría una consulta aparte con la comisión calculada fila a fila en SQL (el % es de    │
 * │ cada reto, no una constante). Mientras eso no exista, la suma la da el CSV, que sale entero.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LA COMISIÓN SE CALCULA con `lib/comision`, la misma función que el formulario usa al pactarla:
 * pactar y facturar no pueden dar cifras distintas.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSeccion("/panel/patrocinios");

  const sp = await searchParams;
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 300) : null,
    pila: leerPila(sp["pila"]),
  };

  const { prisma } = await import("@/server/db/client");
  const { listarPatrocinios } = await import("@/server/services/patrocinios");
  const pagina = await listarPatrocinios(prisma, { cursor: aqui.cursor });

  return (
    <div className="space-y-8">
      <header>
        <h1 style={ESTILO_TITULO} className="text-2xl text-text">
          Patrocinios
        </h1>
        <p className="mt-2 max-w-prose text-sm text-text-dim">
          Lo que se le factura a cada marca: el premio que pone más la comisión pactada en ese reto.
          El ganador cobra el premio <span className="text-text">íntegro</span> por el monedero,
          como en cualquier otro reto; la comisión se cobra aparte y no sale de aquí.
        </p>
      </header>

      <section aria-labelledby="tabla" className="space-y-3">
        <h2 id="tabla" className="text-sm font-semibold tracking-widest text-text-dim uppercase">
          Retos patrocinados
        </h2>

        {pagina.filas.length === 0 ? (
          <p className="rounded-sm border border-line bg-surface/60 p-6 text-sm text-text-dim">
            Todavía no hay ningún reto patrocinado. Al crear uno, marca &laquo;Lo paga una
            marca&raquo; y aparecerá aquí.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-line bg-surface/60">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <thead className="border-b border-line text-2xs tracking-widest text-text-dim uppercase">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reto</th>
                  <th className="px-4 py-3 font-semibold">Marca</th>
                  <th className="px-4 py-3 text-right font-semibold">Premio</th>
                  <th className="px-4 py-3 text-right font-semibold">Comisión</th>
                  <th className="px-4 py-3 text-right font-semibold">A cobrar</th>
                  <th className="px-4 py-3 font-semibold">Cierre</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pagina.filas.map((f) => (
                  <tr key={f.id} className="align-middle transition-colors hover:bg-raised/40">
                    <td className="max-w-[26ch] px-4 py-3">
                      <p className="truncate font-medium text-text">{f.titulo}</p>
                      <p className="mt-0.5 font-mono text-2xs tracking-wider text-text-dim">
                        {f.publicCode}
                        {f.soloVip ? " · solo VIP" : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-text">{f.marca}</td>
                    {/* EL PREMIO, en el token del dinero: es dinero. */}
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-money">
                      {centimosAImporte(f.premioCents)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-text-dim">
                      {centimosAImporte(f.comisionCents)}
                      <span className="ml-1 text-2xs">({bpsAPorcentaje(f.comisionBps)}%)</span>
                    </td>
                    {/* LA CIFRA QUE SE FACTURA. Es la que se copia a la factura, así que va en
                        negrita y con el token del dinero: el resto de la fila la explica. */}
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums text-money">
                      {centimosAImporte(f.totalCents)} {f.moneda}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-text-dim tabular-nums">
                      {cuando(f.deadlineMs)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-text-dim">
                      {f.cerrado ? "Cerrado" : "Abierto"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* FUERA del `if` de la lista: si una página posterior se queda vacía, "Anterior" tiene que
            seguir ahí o el admin se queda encerrado. */}
        <PasosKeyset base="/panel/patrocinios" aqui={aqui} proximoCursor={pagina.proximoCursor} />
      </section>

      <ExportarContabilidad />
    </div>
  );
}
