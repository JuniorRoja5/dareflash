"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ANUNCIO_TEXTO_MAX, ANUNCIO_TEXTO_MIN } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

type Fase = "editar" | "confirmar" | "enviando";

/**
 * ENVIAR UN ANUNCIO (solo admin). La interfaz de `POST /api/panel/anuncios`: el servidor crea el
 * anuncio y encola su reparto; aquí no se reparte nada.
 *
 * IDEMPOTENTE DE EXTREMO A EXTREMO, como el ajuste de puntos: cada INTENCIÓN de envío lleva una
 * `clave` que se renueva al cambiar el texto, NO en cada envío. Un reintento tras un fallo de red o un
 * doble clic manda la misma y el servidor devuelve el anuncio que ya existía, sin crear otro.
 *
 * Confirmación de dos pasos: le llega a toda la audiencia y no se puede deshacer.
 */
export function EnviarAnuncio({ audiencia }: { audiencia: number }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [fase, setFase] = useState<Fase>("editar");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const limpio = texto.trim();
  const valido = limpio.length >= ANUNCIO_TEXTO_MIN && limpio.length <= ANUNCIO_TEXTO_MAX;
  const cuentas = audiencia.toLocaleString("es-ES");

  /** Cambiar el texto es OTRA intención: otra clave. */
  function cambiar(valor: string): void {
    setTexto(valor);
    setClave(crypto.randomUUID());
    setFase("editar");
    setAviso(null);
  }

  async function enviar(): Promise<void> {
    setFase("enviando");
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ id?: string; targetCount?: number; creado?: boolean }>(
        "/api/panel/anuncios",
        { texto: limpio, clave },
      );
      if (r.ok) {
        setAviso({
          tipo: "ok",
          texto: r.data.creado
            ? `Enviado. Se está repartiendo a ${(r.data.targetCount ?? audiencia).toLocaleString("es-ES")} cuentas: el progreso, abajo.`
            : "Ese anuncio ya estaba enviado: no se ha repetido.",
        });
        setTexto("");
        setClave(crypto.randomUUID());
        setFase("editar");
        router.refresh();
        return;
      }
      setAviso({ tipo: "error", texto: mensajeDe(r.data) || "No se pudo enviar el anuncio." });
    } catch {
      setAviso({
        tipo: "error",
        texto: "No hemos podido conectar. Reinténtalo: si ya se envió, no se repetirá.",
      });
    }
    // Tras un fallo se vuelve a confirmar con la MISMA clave: reintentar no puede crear dos anuncios.
    setFase("confirmar");
  }

  return (
    <section
      aria-label="Enviar un anuncio"
      className="rounded-sm border border-line bg-surface/60 p-5"
    >
      <h3 className="text-sm font-semibold text-text">Enviar un anuncio</h3>
      <p className="mt-1 text-sm text-text-dim">
        Lo recibirán las {cuentas} cuentas activas (sin borradas ni baneadas), en su campana. Se
        reparte en segundo plano.
      </p>

      <label className="mt-4 block text-2xs font-semibold tracking-widest text-text-dim uppercase">
        Texto del anuncio
        <textarea
          value={texto}
          rows={3}
          maxLength={ANUNCIO_TEXTO_MAX}
          onChange={(e) => cambiar(e.target.value)}
          placeholder="Qué quieres contar a todos."
          className="mt-1 w-full rounded-sm border border-line bg-raised px-3 py-2 text-sm font-normal tracking-normal text-text normal-case"
        />
      </label>
      <p className="mt-1 text-right text-2xs text-text-dim tabular-nums">
        {limpio.length}/{ANUNCIO_TEXTO_MAX}
      </p>

      {fase === "editar" ? (
        <button
          type="button"
          onClick={() => setFase("confirmar")}
          disabled={!valido}
          className="mt-2 min-h-[36px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
        >
          Revisar anuncio
        </button>
      ) : (
        <div
          role="group"
          aria-label="Confirmar envío"
          className="mt-2 flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-text">¿Enviar a {cuentas} cuentas? No se puede deshacer.</span>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={fase === "enviando"}
            className="min-h-[36px] rounded-sm border border-line px-3 font-medium text-text transition-colors hover:bg-raised disabled:opacity-40"
          >
            {fase === "enviando" ? "Enviando…" : "Sí, enviar"}
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
