"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AJUSTE_BOOST_DELTA_MAX, AJUSTE_NOTA_MAX, AJUSTE_NOTA_MIN } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

type Fase = "editar" | "confirmar" | "enviando";

/** Una cantidad escrita a mano: entero con signo opcional ("+5", "-2", "3"). */
const ENTERO = /^[+-]?\d+$/;

/**
 * AJUSTAR CRÉDITOS DE BOOST (solo admin). La interfaz de `POST /api/panel/boost/ajustar`, que
 * escribe una fila NUEVA de ledger con motivo; aquí no hay lógica de negocio.
 *
 * CALCA EL AJUSTE DE PUNTOS del panel, y a propósito: es el mismo gesto sobre otro saldo, así que
 * quien ya sabe usar uno sabe usar el otro. Lo que cambia es el tope (un Boost se cobra en dólares,
 * ver `AJUSTE_BOOST_DELTA_MAX`) y el copy.
 *
 * IDEMPOTENCIA DE EXTREMO A EXTREMO: cada INTENCIÓN de ajuste lleva una `clave` (UUID) que se
 * renueva al cambiar la cantidad o el motivo, NO en cada envío. Un reintento de la misma intención
 * —doble clic, red caída a mitad— llega con la misma clave y el servidor lo trata como no-op; un
 * ajuste nuevo lleva otra. Tras un FALLO la clave NO se renueva: reintentar no puede duplicar.
 *
 * CONFIRMACIÓN DE DOS PASOS, como en los puntos: toca el saldo de una persona real, y este además
 * se compró con dinero.
 */
export function AjustarCreditos({
  userId,
  username,
  saldo,
}: {
  userId: string;
  username: string;
  saldo: number;
}) {
  const router = useRouter();
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [fase, setFase] = useState<Fase>("editar");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const delta = Number(cantidad.trim());
  const deltaValido =
    ENTERO.test(cantidad.trim()) && delta !== 0 && Math.abs(delta) <= AJUSTE_BOOST_DELTA_MAX;
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
        "/api/panel/boost/ajustar",
        { userId, delta, nota: notaLimpia, clave },
      );
      if (r.ok) {
        setAviso({
          tipo: "ok",
          texto: r.data.aplicado
            ? `Hecho: @${username} tiene ahora ${(r.data.saldo ?? quedaria).toLocaleString("es-ES")} Boosts.`
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
      aria-label="Ajustar créditos de Boost"
      className="rounded-sm border border-line bg-surface/60 p-5"
    >
      <h3 className="text-sm font-semibold text-text">Ajustar créditos de Boost</h3>
      <p className="mt-1 text-sm text-text-dim">
        Regala o quita Boosts a @{username}.{" "}
        <strong className="font-semibold text-text">
          No activa ni retira ninguna aparición destacada.
        </strong>{" "}
        Queda en el historial de Boost con tu nombre y el motivo.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
          Cantidad
          <input
            type="text"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => cambiar(() => setCantidad(e.target.value))}
            placeholder="+5 o -2"
            className="mt-1 w-full rounded-sm border border-line bg-raised px-3 py-2 text-sm font-normal tracking-normal text-text normal-case tabular-nums"
          />
        </label>
        <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
          Motivo (obligatorio)
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
            ? `No puede quedar en negativo: tiene ${saldo.toLocaleString("es-ES")} Boosts.`
            : `Quedaría en ${quedaria.toLocaleString("es-ES")} Boosts`}
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
          aria-label="Confirmar ajuste de Boost"
          className="mt-4 flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-text">
            ¿{delta > 0 ? "Dar" : "Quitar"} {Math.abs(delta).toLocaleString("es-ES")}{" "}
            {Math.abs(delta) === 1 ? "Boost" : "Boosts"} a @{username}? Motivo: «{notaLimpia}»
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
