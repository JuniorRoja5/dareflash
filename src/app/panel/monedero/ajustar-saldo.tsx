"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AJUSTE_NOTA_MAX, AJUSTE_NOTA_MIN, AJUSTE_SALDO_CENTS_MAX } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { importeACentimos, importeConMoneda } from "@/lib/dinero";

type Fase = "editar" | "confirmar" | "enviando";

/**
 * AJUSTAR EL SALDO DEL MONEDERO (solo admin). La interfaz de `POST /api/panel/monedero/ajustar`,
 * que escribe una fila NUEVA de ledger con su traza; aquí no hay lógica de negocio.
 *
 * CALCA EL AJUSTE DE CRÉDITOS DE BOOST, y a propósito: es el mismo gesto sobre otro saldo, así que
 * quien sabe usar uno sabe usar el otro. Lo que cambia es que esto es DINERO —se teclea con
 * decimales y se convierte a céntimos con `importeACentimos`, nunca con `* 100` en coma flotante— y
 * que el tope es el de `AJUSTE_SALDO_CENTS_MAX`.
 *
 * IDEMPOTENCIA DE EXTREMO A EXTREMO: cada INTENCIÓN lleva una `clave` (UUID) que se renueva al
 * cambiar el importe o el motivo, NO en cada envío. Un reintento de la misma intención —doble clic,
 * red caída a mitad— llega con la misma clave y el servidor lo trata como no-op; un ajuste nuevo
 * lleva otra. Tras un FALLO la clave NO se renueva: reintentar no puede acreditar dos veces.
 *
 * CONFIRMACIÓN DE DOS PASOS, como en los puntos y en Boost, y aquí con más razón: esto es dinero que
 * alguien se puede llevar.
 */

/** Un importe con signo escrito a mano: "+50", "-12,50", "20.00". El signo decide la dirección. */
const CON_SIGNO = /^([+-]?)\s*(\d+(?:[.,]\d{1,2})?)$/;

/** Devuelve los céntimos con su signo, o `null` si lo escrito no es un importe. */
export function centimosConSigno(entrada: string): number | null {
  const m = CON_SIGNO.exec(entrada.trim());
  if (!m) return null;
  const magnitud = importeACentimos(m[2]!);
  if (magnitud === null || magnitud === 0) return null;
  return m[1] === "-" ? -magnitud : magnitud;
}

export function AjustarSaldo({
  userId,
  username,
  saldoCents,
}: {
  userId: string;
  username: string;
  saldoCents: number;
}) {
  const router = useRouter();
  const [importe, setImporte] = useState("");
  const [nota, setNota] = useState("");
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [fase, setFase] = useState<Fase>("editar");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const delta = centimosConSigno(importe);
  const deltaValido = delta !== null && Math.abs(delta) <= AJUSTE_SALDO_CENTS_MAX;
  const notaLimpia = nota.trim();
  const notaValida = notaLimpia.length >= AJUSTE_NOTA_MIN && notaLimpia.length <= AJUSTE_NOTA_MAX;
  const quedaria = saldoCents + (deltaValido ? delta : 0);
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
    if (delta === null) return;
    setFase("enviando");
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ aplicado?: boolean; saldoCents?: number }>(
        "/api/panel/monedero/ajustar",
        { userId, deltaCents: delta, nota: notaLimpia, clave },
      );
      if (r.ok) {
        setAviso({
          tipo: "ok",
          texto: r.data.aplicado
            ? `Hecho: @${username} tiene ahora ${importeConMoneda(r.data.saldoCents ?? quedaria)}.`
            : "Ese ajuste ya estaba aplicado: no se ha repetido.",
        });
        setImporte("");
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
      aria-label="Ajustar saldo del monedero"
      className="rounded-sm border border-line bg-surface/60 p-5"
    >
      <h3 className="text-sm font-semibold text-text">Ajustar saldo del monedero</h3>
      <p className="mt-1 text-sm text-text-dim">
        Acredita o descuenta dinero de @{username}.{" "}
        <strong className="font-semibold text-text">
          Es dinero real: queda en su monedero y lo puede cobrar.
        </strong>{" "}
        El movimiento se anota con tu nombre y el motivo; la persona ve el ajuste en su historial,
        pero no el motivo ni quién lo hizo.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
          Importe
          <input
            type="text"
            inputMode="decimal"
            value={importe}
            onChange={(e) => cambiar(() => setImporte(e.target.value))}
            placeholder="+50 o -12,50"
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
            placeholder="Por qué: queda en la auditoría, no se le enseña a la persona."
            className="mt-1 w-full rounded-sm border border-line bg-raised px-3 py-2 text-sm font-normal tracking-normal text-text normal-case"
          />
        </label>
      </div>

      {deltaValido ? (
        <p className="mt-2 text-2xs tabular-nums text-text-dim">
          {negativo
            ? `No puede quedar en negativo: tiene ${importeConMoneda(saldoCents)}.`
            : `Quedaría en ${importeConMoneda(quedaria)}`}
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
          aria-label="Confirmar ajuste de saldo"
          className="mt-4 flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-text">
            ¿{(delta ?? 0) > 0 ? "Acreditar" : "Descontar"} {importeConMoneda(Math.abs(delta ?? 0))}{" "}
            a @{username}? Motivo: «{notaLimpia}»
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
