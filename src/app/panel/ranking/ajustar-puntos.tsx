"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AJUSTE_DELTA_MAX, AJUSTE_NOTA_MAX, AJUSTE_NOTA_MIN } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { nivelPorPuntos } from "@/lib/niveles";

type Fase = "editar" | "confirmar" | "enviando";

/** Una cantidad escrita a mano: entero con signo opcional ("+50", "-20", "7"). */
const ENTERO = /^[+-]?\d+$/;

/**
 * AJUSTAR PUNTOS (solo admin). La interfaz de `POST /api/panel/dareup/ajustar`, que escribe una fila
 * NUEVA de ledger con este motivo; aquí no hay lógica de negocio.
 *
 * IDEMPOTENCIA DE EXTREMO A EXTREMO: cada INTENCIÓN de ajuste lleva una `clave` (UUID) que se renueva
 * al cambiar la cantidad o el motivo, NO en cada envío. Un reintento de la misma intención —doble clic,
 * red caída a mitad— llega con la misma clave y el servidor lo trata como no-op ("ya estaba
 * aplicado"); un ajuste nuevo lleva otra.
 *
 * Confirmación de dos pasos, como Retirar: toca el saldo de una persona real. Y el copy repite la regla
 * que evita el malentendido de siempre: cambia saldo y nivel, NO victorias ni puesto en el ranking.
 */
export function AjustarPuntos({
  userId,
  username,
  puntos,
}: {
  userId: string;
  username: string;
  puntos: number;
}) {
  const router = useRouter();
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [fase, setFase] = useState<Fase>("editar");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const delta = Number(cantidad.trim());
  const deltaValido =
    ENTERO.test(cantidad.trim()) && delta !== 0 && Math.abs(delta) <= AJUSTE_DELTA_MAX;
  const notaLimpia = nota.trim();
  const notaValida = notaLimpia.length >= AJUSTE_NOTA_MIN && notaLimpia.length <= AJUSTE_NOTA_MAX;
  const quedaria = puntos + (deltaValido ? delta : 0);
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
        "/api/panel/dareup/ajustar",
        { userId, delta, nota: notaLimpia, clave },
      );
      if (r.ok) {
        setAviso({
          tipo: "ok",
          texto: r.data.aplicado
            ? `Hecho: @${username} tiene ahora ${(r.data.saldo ?? quedaria).toLocaleString("es-ES")} puntos.`
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
      aria-label="Ajustar puntos"
      className="rounded-sm border border-line bg-surface/60 p-5"
    >
      <h3 className="text-sm font-semibold text-text">Ajustar puntos</h3>
      <p className="mt-1 text-sm text-text-dim">
        Cambia el saldo y el nivel de @{username}.{" "}
        <strong className="font-semibold text-text">
          No cambia sus victorias ni su puesto en el ranking del mes.
        </strong>{" "}
        Queda en su historial con tu nombre y el motivo.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
          Cantidad
          <input
            type="text"
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => cambiar(() => setCantidad(e.target.value))}
            placeholder="+50 o -20"
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
            ? `No puede quedar en negativo: tiene ${puntos.toLocaleString("es-ES")} puntos.`
            : `Quedaría en ${quedaria.toLocaleString("es-ES")} puntos · ${nivelPorPuntos(quedaria).nombre}`}
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
          aria-label="Confirmar ajuste"
          className="mt-4 flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-text">
            ¿{delta > 0 ? "Sumar" : "Restar"} {Math.abs(delta).toLocaleString("es-ES")} puntos a @
            {username}? Motivo: «{notaLimpia}»
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
