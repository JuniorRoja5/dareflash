"use client";

import { useState } from "react";

import { getJson } from "@/lib/cliente-http";
import { importeConMoneda } from "@/lib/dinero";
import { ETIQUETA_ESTADO, nombreDeMetodo, pasosDe, type EstadoRetirada } from "@/lib/retirada";
import type { RetiradaPropia } from "@/server/services/retirada";

/**
 * TUS SOLICITUDES — una por fila, y cada una se despliega para contar por dónde va.
 *
 * ┌─ EL RECORRIDO SE PINTA UNA VEZ, NO SE SONDEA ─────────────────────────────────────────────────┐
 * │ Una retirada la mueve un admin A MANO y a lo largo de días: aceptar, transferir por fuera,    │
 * │ marcarla pagada. Sondear eso sería una petición cada pocos segundos durante una semana para   │
 * │ ver el mismo estado. Se pinta con lo que había al cargar y se actualiza al recargar, que es   │
 * │ exactamente el ritmo al que cambia.                                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL RECORRIDO SALE DE `pasosDe`, que es puro y se deriva de la máquina de estados: la vista no
 * decide qué pasos hay ni cuántos van hechos. Y una RECHAZADA no tiene recorrido —`pasosDe`
 * devuelve `null`— porque no avanzó por el camino: se salió. Pintarle los cuatro pasos apagados
 * contaría un progreso que no existe.
 *
 * "VER MÁS" ES KEYSET: se pide la página siguiente con el cursor de la última fila y se AÑADE. Con
 * un `OFFSET`, pedir otro cobro mientras lees empuja la ventana y la segunda página repite la
 * última fila de la primera.
 *
 * NO SE PINTA QUIÉN LA PROCESÓ: el DTO no lo trae, y es deliberado — el handle del admin que firmó
 * un movimiento es traza interna, igual que la nota de un ajuste de puntos.
 */

/** El color del chip dice el SIGNIFICADO del estado, no decora: uno solo por significado. */
const CHIP: Record<EstadoRetirada, string> = {
  // Esperando a una persona: neutro. No es una alarma ni un logro.
  PENDING: "border-line text-text-dim",
  APPROVED: "border-line text-text",
  // En marcha: el verde de "va bien", que es lo que `--df-ok` significa.
  PROCESSING: "border-ok/40 text-ok",
  PAID: "border-ok/40 bg-ok/10 text-ok",
  // Rechazada NO es un error del sistema ni un peligro: es un final que devolvió el dinero. Por eso
  // va en `--df-alarm` atenuado y con su propia frase, no en rojo de "algo ha explotado".
  REJECTED: "border-alarm/40 text-alarm",
};

/** Mismo nombre que las tarjetas y el selector (`nombreDeMetodo`), con su pista detrás. */
function destinoDe(r: RetiradaPropia): string {
  return `${nombreDeMetodo(r)} ····${r.pista}`;
}

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Las fechas se formatean en el CLIENTE, en la zona de quien mira: un cobro es suyo y de su día. */
function cuando(valor: Date | string): string {
  return FECHA.format(new Date(valor));
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm bg-raised px-3 py-2">
      <span className="block text-2xs tracking-widest text-text-dim uppercase">{etiqueta}</span>
      <span className="text-sm text-text">{children}</span>
    </div>
  );
}

/**
 * EL RECORRIDO. La barra y los puntos son `opacity`/`transform` y una anchura en %: nada que la
 * regla global de `prefers-reduced-motion` no pueda apagar (la transición de la barra y el latido
 * del punto actual mueren ahí, y los pasos se quedan en su sitio, que es lo que importa).
 */
function Recorrido({ estado }: { estado: EstadoRetirada }) {
  const recorrido = pasosDe(estado);
  if (!recorrido) return null;

  return (
    <div className="relative mt-1 mb-5 flex items-start justify-between">
      {/* La vía y lo recorrido, las dos detrás de los puntos. `aria-hidden`: lo que dicen ya lo
          dice el texto de cada paso y el chip de estado. */}
      <span className="absolute top-[11px] right-[8%] left-[8%] h-px bg-line" aria-hidden />
      <span
        className="absolute top-[11px] left-[8%] h-px bg-ok transition-[width] duration-[var(--df-dur-slow)] ease-mechanical"
        style={{ width: `calc((84% * ${recorrido.progreso}) / 100)` }}
        aria-hidden
      />
      {recorrido.pasos.map((p) => (
        <span key={p.estado} className="relative z-10 flex flex-1 flex-col items-center gap-1.5">
          <span
            className={`grid size-[22px] place-items-center rounded-full border-2 text-2xs ${
              p.situacion === "hecho"
                ? "border-ok bg-ok text-void"
                : p.situacion === "actual"
                  ? "border-ok bg-surface text-ok"
                  : "border-line bg-surface text-text-dim"
            }`}
            aria-hidden
          >
            {p.situacion === "hecho" ? "✓" : p.situacion === "actual" ? "●" : ""}
          </span>
          <span
            className={`max-w-[8ch] text-center text-2xs leading-tight ${
              p.situacion === "pendiente" ? "text-text-dim" : "font-medium text-text"
            }`}
          >
            {p.etiqueta}
          </span>
        </span>
      ))}
    </div>
  );
}

function Fila({ r }: { r: RetiradaPropia }) {
  const estado = r.status as EstadoRetirada;
  const rechazada = estado === "REJECTED";

  return (
    <details className="group rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-sm)] backdrop-blur-md open:border-line">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-[5.5rem] text-sm font-semibold tabular-nums text-text">
          {importeConMoneda(r.amountCents, r.currency)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-text-dim">{destinoDe(r)}</span>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-2xs font-medium ${CHIP[estado] ?? "border-line text-text-dim"}`}
        >
          {ETIQUETA_ESTADO[estado] ?? r.status}
        </span>
        {/* El giro es CSS: la regla global de movimiento reducido lo apaga sin que nada avise. */}
        <span
          className="shrink-0 text-text-dim transition-transform duration-[var(--df-dur-fast)] ease-mechanical group-open:rotate-90"
          aria-hidden
        >
          ›
        </span>
      </summary>

      <div className="border-t border-line p-4">
        <Recorrido estado={estado} />

        <div className="grid gap-2 sm:grid-cols-2">
          <Dato etiqueta="Importe">
            {rechazada ? (
              <>
                {importeConMoneda(r.amountCents, r.currency)}{" "}
                <span className="text-text-dim">· devuelto a tu saldo</span>
              </>
            ) : (
              importeConMoneda(r.amountCents, r.currency)
            )}
          </Dato>
          <Dato etiqueta="Método">{destinoDe(r)}</Dato>
          <Dato etiqueta="Pedida el">{cuando(r.createdAt)}</Dato>
          {/* UNA SOLA FECHA DE MOVIMIENTO, no una por paso: la fila guarda `procesadaEn`, que es
              cuándo se movió POR ÚLTIMA VEZ. Pintar "aceptada el X" y "pagada el Y" con un solo
              dato sería inventar una de las dos. */}
          <Dato etiqueta={rechazada ? "Rechazada el" : "Última actualización"}>
            {r.actualizadaEn ? cuando(r.actualizadaEn) : "—"}
          </Dato>
        </div>

        {rechazada ? (
          <p className="mt-3 max-w-prose text-xs leading-relaxed text-text-dim">
            No hemos podido completar este cobro y el importe volvió entero a tu monedero. Puedes
            pedirlo otra vez; si no sabes por qué se rechazó, escríbenos.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function HistorialRetiradas({
  inicial,
  cursorInicial,
}: {
  inicial: RetiradaPropia[];
  cursorInicial: string | null;
}) {
  const [filas, setFilas] = useState(inicial);
  const [cursor, setCursor] = useState(cursorInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verMas() {
    if (!cursor || cargando) return;
    setCargando(true);
    setError(null);
    const r = await getJson<{ items: RetiradaPropia[]; nextCursor: string | null }>(
      `/api/retiradas?cursor=${encodeURIComponent(cursor)}`,
    );
    setCargando(false);
    if (!r.ok) {
      setError("No hemos podido cargar más. Inténtalo otra vez.");
      return;
    }
    // Se AÑADE, y el cursor avanza al de la respuesta: la página siguiente arranca donde acabó
    // esta, no en un desplazamiento que otra solicitud nueva habría movido.
    setFilas((previas) => [...previas, ...r.data.items]);
    setCursor(r.data.nextCursor);
  }

  if (filas.length === 0) {
    return <p className="mt-3 text-sm text-text-dim">Todavía no has pedido ningún cobro.</p>;
  }

  return (
    <>
      <ul className="mt-3 space-y-2">
        {filas.map((r) => (
          <li key={r.id}>
            <Fila r={r} />
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alarm">
          {error}
        </p>
      ) : null}

      {cursor ? (
        <button
          type="button"
          onClick={() => void verMas()}
          disabled={cargando}
          className="mx-auto mt-4 block min-h-[44px] rounded-full border border-line px-5 text-sm font-medium text-text-dim transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised hover:text-text disabled:opacity-60"
        >
          {cargando ? "Cargando…" : "Ver más"}
        </button>
      ) : null}
    </>
  );
}
