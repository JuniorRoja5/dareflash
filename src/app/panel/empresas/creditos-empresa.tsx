"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AJUSTE_CREDITOS_DELTA_MAX, AJUSTE_NOTA_MAX, AJUSTE_NOTA_MIN } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import type { MovimientoCreditoPanel } from "@/server/services/creditos";

type Fase = "editar" | "confirmar" | "enviando";

/** Una cantidad escrita a mano: entero con signo opcional ("+30", "-5", "10"). */
const ENTERO = /^[+-]?\d+$/;

const FECHA = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" } as const;
const n = (x: number) => x.toLocaleString("es-ES");
const creditos = (x: number) => `${n(x)} ${Math.abs(x) === 1 ? "crédito" : "créditos"}`;

/**
 * LOS CRÉDITOS DE PUBLICIDAD DE UNA EMPRESA, en su ficha del panel (Fase 9 · P4): el saldo, los
 * últimos movimientos CON su nota (es el equipo quien mira) y el AJUSTE MANUAL.
 *
 * EL AJUSTE CALCA EL DE BOOST (`boost/ajustar-creditos`), y a propósito: es el mismo gesto sobre otro
 * saldo. Confirmación en dos pasos, motivo obligatorio, y una `clave` por INTENCIÓN que se renueva al
 * cambiar la cantidad o el motivo, nunca en un reintento: un doble clic o una red caída no lo aplican
 * dos veces. Lo que cambia es el tope (`AJUSTE_CREDITOS_DELTA_MAX`) y el nombre: «créditos de
 * publicidad», nunca «puntos».
 */
export function CreditosEmpresa({
  empresaId,
  nombre,
  saldo,
  movimientos,
}: {
  empresaId: string;
  nombre: string;
  saldo: number;
  movimientos: MovimientoCreditoPanel[];
}) {
  const router = useRouter();
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [fase, setFase] = useState<Fase>("editar");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const delta = Number(cantidad.trim());
  const deltaValido =
    ENTERO.test(cantidad.trim()) && delta !== 0 && Math.abs(delta) <= AJUSTE_CREDITOS_DELTA_MAX;
  const notaLimpia = nota.trim();
  const notaValida = notaLimpia.length >= AJUSTE_NOTA_MIN && notaLimpia.length <= AJUSTE_NOTA_MAX;
  const quedaria = saldo + (deltaValido ? delta : 0);
  const negativo = deltaValido && quedaria < 0;
  const listo = deltaValido && notaValida && !negativo;

  /** Cambiar lo que se va a aplicar es OTRA intención: otra clave. */
  function cambiar(aplicarCambio: () => void): void {
    aplicarCambio();
    setClave(crypto.randomUUID());
    setFase("editar");
    setAviso(null);
  }

  async function aplicar(): Promise<void> {
    setFase("enviando");
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ aplicado?: boolean; saldo?: number }>(
        `/api/panel/empresas/${empresaId}/creditos`,
        { delta, nota: notaLimpia, clave },
      );
      if (r.ok) {
        setAviso({
          tipo: "ok",
          texto: r.data.aplicado
            ? `Hecho: ${nombre} tiene ahora ${creditos(r.data.saldo ?? quedaria)} de publicidad.`
            : "Ese ajuste ya estaba aplicado: no se ha repetido.",
        });
        setCantidad("");
        setNota("");
        setClave(crypto.randomUUID());
        setFase("editar");
        router.refresh();
        return;
      }
      setAviso({ tipo: "error", texto: mensajeDe(r.data) || "No se pudo aplicar el ajuste." });
    } catch {
      setAviso({
        tipo: "error",
        texto: "No hemos podido conectar. Reinténtalo: si ya se aplicó, no se repetirá.",
      });
    }
    // Tras un fallo se vuelve a confirmar con la MISMA clave: reintentar no puede duplicar.
    setFase("confirmar");
  }

  return (
    <section
      aria-label="Créditos de publicidad"
      data-creditos={empresaId}
      className="rounded-sm border border-line bg-surface/60 p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">Créditos de publicidad</h3>
        <p className="text-sm text-text tabular-nums">
          Saldo: <span className="font-semibold">{creditos(saldo)}</span>
        </p>
      </div>
      <p className="mt-1 text-2xs text-text-dim">Cada crédito es un día de anuncio.</p>

      {movimientos.length > 0 ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {movimientos.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
              <span className="w-16 text-text tabular-nums">
                {m.delta > 0 ? "+" : ""}
                {n(m.delta)}
              </span>
              <span className="min-w-0 flex-1 text-text">{m.concepto}</span>
              <span className="text-2xs text-text-dim tabular-nums">
                {new Date(m.creadoMs).toLocaleDateString("es-ES", FECHA)}
              </span>
              {m.nota ? <span className="w-full text-2xs text-text-dim">«{m.nota}»</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-dim">Todavía no tiene movimientos.</p>
      )}

      <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[10rem_1fr]">
        <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
          Cantidad
          <input
            type="text"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => cambiar(() => setCantidad(e.target.value))}
            placeholder="+30 o -5"
            className="mt-1 w-full rounded-sm border border-line bg-raised px-3 py-2 text-sm font-normal tracking-normal text-text normal-case tabular-nums"
          />
        </label>
        <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
          Motivo (obligatorio, no lo ve la empresa)
          <textarea
            value={nota}
            rows={2}
            maxLength={AJUSTE_NOTA_MAX}
            onChange={(e) => cambiar(() => setNota(e.target.value))}
            placeholder="Por qué: queda escrito en el historial."
            className="mt-1 w-full rounded-sm border border-line bg-raised px-3 py-2 text-sm font-normal tracking-normal text-text normal-case"
          />
        </label>
      </div>

      {deltaValido ? (
        <p className="mt-2 text-2xs text-text-dim tabular-nums">
          {negativo
            ? `No puede quedar en negativo: tiene ${creditos(saldo)}.`
            : `Quedaría en ${creditos(quedaria)}`}
        </p>
      ) : null}

      {fase === "editar" ? (
        <button
          type="button"
          onClick={() => setFase("confirmar")}
          disabled={!listo}
          className="mt-4 min-h-[36px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
        >
          Revisar ajuste
        </button>
      ) : (
        <div
          role="group"
          aria-label="Confirmar ajuste de créditos"
          className="mt-4 flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-text">
            ¿{delta > 0 ? "Dar" : "Quitar"} {creditos(Math.abs(delta))} de publicidad a {nombre}?
            Motivo: «{notaLimpia}»
          </span>
          <button
            type="button"
            onClick={() => void aplicar()}
            disabled={fase === "enviando"}
            className="min-h-[36px] rounded-sm border border-line px-3 font-medium text-text transition-colors hover:bg-raised disabled:opacity-40"
          >
            {fase === "enviando" ? "Aplicando…" : "Sí, aplicar"}
          </button>
          <button
            type="button"
            onClick={() => setFase("editar")}
            disabled={fase === "enviando"}
            className="min-h-[36px] rounded-sm border border-line px-3 text-text-dim transition-colors hover:bg-raised disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      )}

      {aviso ? (
        <p
          role={aviso.tipo === "error" ? "alert" : "status"}
          className={`mt-3 text-sm ${aviso.tipo === "error" ? "text-alarm" : "text-text"}`}
        >
          {aviso.texto}
        </p>
      ) : null}
    </section>
  );
}
