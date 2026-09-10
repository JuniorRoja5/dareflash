"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { nombreMostrado } from "@/lib/identidad";

/** Una participación del grupo empatado, tal y como llega ya resuelta del servidor. */
export interface EmpatadaUI {
  submissionId: string;
  username: string;
  displayName: string | null;
  votos: number;
  poster: string;
}

/**
 * RESOLVER UN EMPATE. Cuando la línea del premio cae dentro de un grupo con los mismos votos, el
 * sistema cierra el reto pero NO reparte: ni ganadores ni puntos. Esta pantalla es la única salida de
 * ese estado — sin ella el reto se queda atascado y hay que tocar la base de datos a mano.
 *
 * El admin ordena a los empatados, y solo a ellos: quien ganó limpiamente por encima no aparece aquí
 * ni viaja en la petición, así que no existe ni la posibilidad de reordenarlo. La autoridad de qué es
 * admisible está en el servidor (`validarResolucionEmpate`); esta UI es una comodidad, no un guardián
 * — si algo no cuadra, el servidor lo rechaza y aquí se pinta SU motivo, no un éxito fingido.
 *
 * Se dice explícitamente que la acción PAGA: escribe los ganadores y otorga los puntos en el momento.
 * No es un borrador ni una propuesta, y quien pulsa tiene que saberlo antes de pulsar.
 */
export function ResolverEmpate({
  challengeId,
  empatadas,
  plazas,
  limpios,
}: {
  challengeId: string;
  empatadas: EmpatadaUI[];
  /** Plazas de premio en disputa. Hay que elegir exactamente estas. */
  plazas: number;
  /** Cuántos ganaron limpio por encima: se nombran, pero no se tocan. */
  limpios: number;
}) {
  const router = useRouter();
  // Orden elegido: los submissionId, de más premiado a menos. El índice + 1 es el puesto.
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const alternar = (id: string): void => {
    setError(undefined);
    setElegidas((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Al llegar al tope no se descarta en silencio: sin aviso, el admin cree que ha marcado algo.
      if (prev.length >= plazas) return prev;
      return [...prev, id];
    });
  };

  const confirmar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    const r = await postJsonCsrf(`/api/panel/retos/${challengeId}/resolver-empate`, { elegidas });
    setEnviando(false);
    if (!r.ok) {
      setError(mensajeDe(r.data) || "No se pudo resolver el empate.");
      return;
    }
    // El resultado ya está escrito y los puntos otorgados: se recarga para que la pantalla deje de
    // ofrecer una decisión que ya está tomada.
    router.refresh();
  };

  const completo = elegidas.length === plazas;

  return (
    <section className="rounded-sm border border-time/40 bg-time/5 p-5">
      <h2 className="text-sm font-semibold tracking-widest text-time uppercase">
        Empate · te toca decidir
      </h2>
      <p className="mt-2 max-w-prose text-sm text-text-dim">
        {empatadas.length} participaciones han quedado con los mismos votos en la línea del premio,
        y {plazas === 1 ? "queda 1 plaza" : `quedan ${plazas} plazas`} por repartir. El sistema no
        elige por ti: ordénalas tú.
        {limpios > 0
          ? ` Los ${limpios === 1 ? "1 puesto" : `${limpios} puestos`} de arriba ya están ganados por votos y no cambian.`
          : ""}
      </p>
      <p className="mt-1 max-w-prose text-sm text-text-dim">
        Al confirmar se publica el resultado del reto y se otorgan los puntos. No es un borrador.
      </p>

      <ul className="mt-4 space-y-2">
        {empatadas.map((p) => {
          const puesto = elegidas.indexOf(p.submissionId);
          const elegida = puesto >= 0;
          return (
            <li key={p.submissionId}>
              <button
                type="button"
                onClick={() => alternar(p.submissionId)}
                aria-pressed={elegida}
                disabled={enviando}
                className={`flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors duration-150 ease-mechanical disabled:opacity-50 ${
                  elegida ? "border-time bg-time/10" : "border-line bg-surface hover:bg-raised"
                }`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-2xs font-bold tabular-nums ${
                    elegida ? "bg-time text-void" : "bg-raised text-text-dim"
                  }`}
                >
                  {elegida ? puesto + 1 + limpios : "—"}
                </span>
                {p.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element -- póster firmado de Bunny
                  <img
                    src={p.poster}
                    alt=""
                    className="h-10 w-16 shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <span className="h-10 w-16 shrink-0 rounded-sm bg-raised" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-text">
                  {nombreMostrado(p.displayName, p.username)}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-text-dim">
                  {p.votos} {p.votos === 1 ? "voto" : "votos"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="mt-3 text-sm text-alarm" role="alert">
          {error}
        </p>
      ) : null}

      <Boton
        type="button"
        variante="principal"
        disabled={!completo || enviando}
        onClick={() => void confirmar()}
        className="mt-4 w-full py-3 sm:w-auto sm:px-8"
      >
        {enviando
          ? "Publicando resultado…"
          : completo
            ? "Publicar resultado y otorgar puntos"
            : `Elige ${plazas - elegidas.length} más`}
      </Boton>
    </section>
  );
}
