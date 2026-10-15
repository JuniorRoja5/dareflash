import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { importeConMoneda } from "@/lib/dinero";
import { nombreMostrado } from "@/lib/identidad";
import { enlacePaginado, leerPila, PRIMERA, type Paginacion } from "@/lib/paginacion-pila";
import { ESTADOS_RETIRADA, ETIQUETA_ESTADO, type EstadoRetirada } from "@/lib/retirada";

import { requireSeccion } from "../panel-guard";

import { AccionesRetirada } from "./acciones-retirada";
import { AjustarSaldo } from "./ajustar-saldo";
import { ExportarCsv } from "./exportar-csv";

/**
 * LOS FILTROS DE LA COLA. "Pendientes" PRIMERO y es el que se usa: es lo que espera una decisión.
 * No es el de por defecto, sin embargo — al entrar se ven todas, que es lo que había antes y lo que
 * una persona espera de una lista; el filtro es un atajo, no un escondite.
 */
const FILTROS: readonly { etiqueta: string; estado?: EstadoRetirada }[] = [
  { etiqueta: "Todas" },
  { etiqueta: "Pendientes", estado: "PENDING" },
  { etiqueta: "Aceptadas", estado: "APPROVED" },
  { etiqueta: "En proceso", estado: "PROCESSING" },
  { etiqueta: "Pagadas", estado: "PAID" },
  { etiqueta: "Rechazadas", estado: "REJECTED" },
];

export const metadata = { title: "Monedero y retiradas · Panel" };
export const dynamic = "force-dynamic";

const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

/**
 * El estado, en palabras. El código no se enseña ni aquí.
 *
 * SALE DE `ETIQUETA_ESTADO`, la misma tabla que usa el monedero del usuario: tuvo su copia hasta que
 * el monedero se rehizo, y entonces las dos pantallas decían cosas distintas del mismo estado —aquí
 * "Pendiente", allí "En revisión"—. Quien escribe a soporte cita una palabra que el admin no ve.
 */
const ESTADO_HUMANO = ETIQUETA_ESTADO;

function cuando(fecha: Date): string {
  return fecha.toLocaleString("es-ES", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * MONEDERO Y RETIRADAS (Fase 7) — la cola de cobros y su máquina de estados.
 *
 * ┌─ ES EL ÚNICO SITIO DONDE UN IBAN VUELVE A ESTAR EN CLARO ─────────────────────────────────────┐
 * │ Y es a propósito: sin verlo no se puede hacer la transferencia. Por eso esta pantalla es de   │
 * │ ADMIN —derivado de `secciones.ts`, no de un `requireRole` suelto— y por eso el dato no entra  │
 * │ en el `AuditLog`, ni en un log, ni en la respuesta de la ruta de transición.                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ EL DINERO YA SALIÓ ──────────────────────────────────────────────────────────────────────────┐
 * │ Aceptar, "en proceso" y finalizar NO mueven saldo: son anotaciones de lo que el admin hace    │
 * │ por fuera. La ÚNICA que mueve dinero es RECHAZAR, que lo devuelve entero. La pantalla lo dice │
 * │ en la confirmación, con el importe, porque es lo que de verdad importa de esa acción.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LOS BOTONES SALEN DE LA MÁQUINA DE ESTADOS, no de un `if` por fila: `siguientes` viene del
 * servicio. Una retirada ya pagada o ya rechazada no ofrece NADA — son estados finales, y un botón
 * desactivado sugeriría que hay algo que hacer.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSeccion("/panel/monedero");

  const sp = await searchParams;
  // TODO POR URL, como el inspector de puntos y el de Boost: `?q=` busca y `?u=` abre la ficha. Sin
  // estado de cliente que se desincronice, y el enlace a una ficha se puede pegar en un hilo.
  const q = typeof sp["q"] === "string" ? sp["q"].trim().slice(0, 100) : "";
  const u = typeof sp["u"] === "string" ? sp["u"] : null;
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 300) : null,
    pila: leerPila(sp["pila"]),
  };
  // EL FILTRO SE VALIDA CONTRA LA MÁQUINA DE ESTADOS, no se pasa a la consulta tal cual: un
  // `?estado=` inventado devolvería una lista vacía que parecería "no hay nada".
  const pedido = typeof sp["estado"] === "string" ? sp["estado"] : "";
  const estado = (ESTADOS_RETIRADA as readonly string[]).includes(pedido)
    ? (pedido as EstadoRetirada)
    : null;

  const { prisma } = await import("@/server/db/client");
  const { listarRetiradas } = await import("@/server/services/retirada-admin");
  const { fichaMonedero } = await import("@/server/services/monedero-admin");
  const { buscarUsuarios } = await import("@/server/services/buscar");

  const [pagina, pendientes, resultados, ficha] = await Promise.all([
    listarRetiradas(prisma, { ...(estado ? { estado } : {}), cursor: aqui.cursor }),
    // EL RECUENTO DE PENDIENTES ES SU PROPIA CONSULTA desde que la lista está paginada: contarlas
    // sobre la página visible daría "3 pendientes" cuando hay treinta, y esa cifra es justo la que
    // dice si hay trabajo. Un `count` no se puede derivar de una página.
    prisma.withdrawal.count({ where: { status: "PENDING" } }),
    q.length >= 2 ? buscarUsuarios(prisma, q, null, 10) : Promise.resolve(null),
    u ? fichaMonedero(prisma, u) : Promise.resolve(null),
  ]);
  const retiradas = pagina.items;
  /** El filtro viaja con la posición: sin esto, "Siguiente" salta a la lista sin filtrar. */
  const filtro = { estado: estado ?? undefined, q: q || undefined, u: u ?? undefined };

  return (
    <div className="space-y-8">
      <header>
        <h1 style={ESTILO_TITULO} className="text-2xl text-text">
          Monedero y retiradas
        </h1>
        <p className="mt-2 max-w-prose text-sm text-text-dim">
          El dinero sale del monedero cuando la persona lo pide, no cuando tú lo pagas. Aceptar y
          marcar el envío no mueven saldo:{" "}
          <span className="text-text">la única que mueve dinero es rechazar</span>, que lo devuelve
          entero.
        </p>
        {/* La cifra sale de un RECUENTO de verdad, no de la página que se está viendo. */}
        <p className="mt-3 text-sm text-text-dim">
          {pendientes === 0
            ? "No hay ninguna solicitud pendiente de revisar."
            : `${pendientes} pendiente${pendientes === 1 ? "" : "s"} de revisar`}
        </p>
      </header>

      {/* EL FILTRO, ARRIBA: lo que el admin viene a hacer es despachar PENDIENTES, y en una cola
          con historia acaban debajo de las pagadas. Son enlaces, no estado de cliente: la vista
          filtrada se puede enlazar y el botón "atrás" funciona. */}
      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const activo = (f.estado ?? null) === estado;
          return (
            <Link
              key={f.etiqueta}
              // Sin cursor: cambiar de filtro empieza la lista de cero. Conservar la posición de
              // otra lista llevaría a una página que en esta no existe.
              href={enlacePaginado("/panel/monedero", PRIMERA, {
                estado: f.estado,
                q: q || undefined,
                u: u ?? undefined,
              })}
              aria-current={activo ? "page" : undefined}
              className={`min-h-[36px] rounded-sm border border-line px-3 py-1.5 text-sm transition-colors hover:bg-raised ${
                activo ? "bg-raised font-medium text-text" : "text-text-dim"
              }`}
            >
              {f.etiqueta}
            </Link>
          );
        })}
        <Link
          href="/panel/monedero/ajustes"
          className="ml-auto min-h-[36px] rounded-sm border border-line px-3 py-1.5 text-sm text-text-dim transition-colors hover:bg-raised"
        >
          Historial de ajustes →
        </Link>
      </nav>

      {retiradas.length === 0 ? (
        <p className="text-sm text-text-dim">
          {estado ? "No hay ninguna en ese estado." : "No hay ninguna solicitud todavía."}
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {retiradas.map((r) => (
            <li key={r.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-base font-medium text-text">
                    {importeConMoneda(r.amountCents, r.currency)}
                  </span>
                  <span className="ml-2 text-sm text-text-dim">
                    {nombreMostrado(r.displayName, r.username)} · @{r.username}
                  </span>
                </span>
                <span className="text-2xs uppercase tracking-widest text-text-dim">
                  {ESTADO_HUMANO[r.estado] ?? r.estado} · {cuando(r.createdAt)} UTC
                </span>
              </div>

              {/* EL DESTINO DEL PAGO, descifrado y solo aquí. En `font-mono` porque se va a copiar a
                  mano a un banco o a una cartera, y un IBAN mal leído es dinero perdido. */}
              <dl className="rounded-sm border border-line bg-raised/40 p-3 text-xs">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-text-dim">Método</dt>
                  <dd className="text-text">
                    {r.metodo === "BANK" ? "Banco" : `Cripto · ${r.red}`}
                  </dd>
                </div>
                {Object.entries(r.destino).map(([clave, valor]) => (
                  <div key={clave} className="mt-1 flex gap-2">
                    <dt className="shrink-0 text-text-dim">{clave}</dt>
                    <dd className="font-mono break-all text-text">{valor}</dd>
                  </div>
                ))}
              </dl>

              <AccionesRetirada
                retiradaId={r.id}
                siguientes={r.siguientes}
                importe={importeConMoneda(r.amountCents, r.currency)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* FUERA del `if` de la lista: si una página posterior se queda sin filas —alguien movió algo
          entre medias—, "Anterior" tiene que seguir ahí o el admin se queda encerrado. */}
      <PasosKeyset
        base="/panel/monedero"
        aqui={aqui}
        proximoCursor={pagina.proximoCursor}
        filtro={filtro}
      />

      {/* ┌─ EL AJUSTE MANUAL, ABAJO Y APARTE ──────────────────────────────────────────────────────┐
          │ No es parte de la cola: es una corrección (y la única forma honesta de sembrar saldo    │
          │ para probar un cobro entero, en vez de escribir SQL contra la base de datos). Va al     │
          │ final para que lo primero que se vea al entrar siga siendo lo que espera una decisión.  │
          └─────────────────────────────────────────────────────────────────────────────────────────┘ */}
      <section id="ajuste" aria-labelledby="ajuste-titulo" className="border-t border-line pt-8">
        <h2 id="ajuste-titulo" className="text-sm font-semibold text-text">
          Ajustar el saldo de alguien
        </h2>
        <p className="mt-1 max-w-prose text-sm text-text-dim">
          Para corregir un premio que no entró, devolver algo a mano o preparar una prueba. Cada
          ajuste escribe un movimiento en su monedero —nunca se toca el saldo directamente— y queda
          en la auditoría con tu nombre y el motivo.
        </p>

        <form method="get" action="/panel/monedero" className="mt-4 flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por @usuario o nombre"
            aria-label="Buscar usuario"
            className="min-h-[40px] min-w-0 flex-1 rounded-sm border border-line bg-raised px-3 text-sm text-text"
          />
          <button
            type="submit"
            className="min-h-[40px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors hover:bg-raised"
          >
            Buscar
          </button>
        </form>
        <p className="mt-1 text-2xs text-text-dim">
          Busca entre las cuentas activas (sin borradas ni baneadas).
        </p>

        {resultados ? (
          resultados.items.length === 0 ? (
            <p className="mt-4 text-sm text-text-dim">Nadie coincide con «{q}».</p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-2">
              {resultados.items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/panel/monedero?q=${encodeURIComponent(q)}&u=${encodeURIComponent(r.id)}#ajuste`}
                    aria-current={r.id === u ? "true" : undefined}
                    className={`flex items-center gap-2 rounded-sm border border-line px-3 py-1.5 text-sm transition-colors hover:bg-raised ${
                      r.id === u ? "bg-raised text-text" : "text-text-dim"
                    }`}
                  >
                    <Avatar
                      nombre={r.username ?? "?"}
                      imagen={r.image}
                      tamano="sm"
                      puntos={r.puntos}
                    />
                    @{r.username}
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {u && !ficha ? <p className="mt-4 text-sm text-text-dim">Ese usuario no existe.</p> : null}

        {ficha ? (
          <div className="mt-6">
            <p className="mb-3 text-sm text-text-dim">
              @{ficha.username} tiene ahora mismo{" "}
              <span className="tabular-nums text-text">{importeConMoneda(ficha.saldoCents)}</span>.
            </p>
            <AjustarSaldo
              // La clave incluye el saldo: tras un ajuste, el formulario se rehace limpio en vez de
              // quedarse con el importe escrito sobre un saldo que ya cambió.
              key={`${ficha.id}:${ficha.saldoCents}`}
              userId={ficha.id}
              username={ficha.username}
              saldoCents={ficha.saldoCents}
            />
          </div>
        ) : null}
      </section>

      <section className="border-t border-line pt-8">
        <ExportarCsv />
      </section>
    </div>
  );
}
