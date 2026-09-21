"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { controlesCuenta, rolAlternativo } from "@/lib/permisos";

import { ACCION_ROL } from "./etiquetas";

type Fase = "idle" | "confirmar" | "enviando";

/**
 * LO QUE SE PUEDE HACER CON UNA CUENTA desde el panel: nombrar (o retirar) moderador y suspender (o
 * levantar). Tres botones como mucho, y solo los que quien mira puede ejecutar.
 *
 * QUÉ SE PINTA lo decide `controlesCuenta` (`lib/permisos`), la misma regla que aplican las rutas: no
 * se decide a ojo aquí. Y es CONVENIENCIA, no seguridad — la autoridad son las rutas de la pieza A,
 * que vuelven a comprobar contra la fila real. Esconder un botón no protege nada; ofrecer uno que va a
 * ser rechazado, en cambio, hace quedar mal a la pantalla.
 *
 * CONFIRMACIÓN EN DOS PASOS, como retirar una participación: las dos acciones caen sobre una persona
 * de verdad y las dos le cierran la sesión en todos sus dispositivos.
 *
 * Al terminar se refresca la página (los datos son del servidor), así que la fila se repinta con su
 * estado nuevo sin que este componente tenga que adivinarlo.
 */
export function AccionesCuenta({
  userId,
  handle,
  rolMira,
  rolDestino,
  suspendida,
}: {
  userId: string;
  handle: string;
  /** Rol de quien MIRA (de la sesión, resuelto en el servidor). */
  rolMira: string;
  rolDestino: string;
  suspendida: boolean;
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  const controles = controlesCuenta({ rolMira, rolDestino, suspendido: suspendida });
  const rolPedido = rolAlternativo(rolDestino);

  async function ejecutar(url: string, cuerpo: unknown): Promise<boolean> {
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ cambiado?: boolean }>(url, cuerpo);
      if (r.ok) {
        // `cambiado: false` = ya estaba así. No es un error: se dice y ya.
        setAviso(r.data.cambiado === false ? "No había cambios." : null);
        router.refresh();
        return true;
      }
      setAviso(mensajeDe(r.data) || "No se pudo completar la acción.");
      return false;
    } catch {
      setAviso("No hemos podido conectar. Inténtalo de nuevo.");
      return false;
    }
  }

  if (!controles.puedeRol && !controles.puedeSuspender && !controles.puedeLevantar) {
    return aviso ? (
      <span role="status" className="text-2xs text-text-dim">
        {aviso}
      </span>
    ) : null;
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {controles.puedeRol ? (
        <Accion
          etiqueta={ACCION_ROL[rolPedido].boton}
          pregunta={ACCION_ROL[rolPedido].pregunta(handle)}
          confirmar="Sí, cambiar"
          onEjecutar={() => ejecutar(`/api/panel/cuentas/${userId}/rol`, { rol: rolPedido })}
        />
      ) : null}

      {controles.puedeSuspender ? (
        <Accion
          etiqueta="Suspender"
          pregunta={`¿Suspender la cuenta de @${handle}? Se cerrarán sus sesiones.`}
          confirmar="Sí, suspender"
          peligro
          onEjecutar={() => ejecutar(`/api/panel/cuentas/${userId}/suspender`, {})}
        />
      ) : null}

      {controles.puedeLevantar ? (
        <Accion
          etiqueta="Levantar suspensión"
          pregunta={`¿Levantar la suspensión de @${handle}? Volverá a poder entrar.`}
          confirmar="Sí, levantar"
          onEjecutar={() => ejecutar(`/api/panel/cuentas/${userId}/levantar`, {})}
        />
      ) : null}

      {aviso ? (
        <span role="status" className="text-2xs text-text-dim">
          {aviso}
        </span>
      ) : null}
    </span>
  );
}

/** Un botón con su confirmación. El patrón de retirar una participación, sin inventar otro. */
function Accion({
  etiqueta,
  pregunta,
  confirmar,
  peligro = false,
  onEjecutar,
}: {
  etiqueta: string;
  pregunta: string;
  confirmar: string;
  peligro?: boolean;
  onEjecutar: () => Promise<boolean>;
}) {
  const [fase, setFase] = useState<Fase>("idle");

  if (fase === "confirmar") {
    return (
      <span className="flex items-center gap-2 text-2xs">
        <span className="text-text-dim">{pregunta}</span>
        <button
          type="button"
          onClick={() => {
            setFase("enviando");
            void onEjecutar().then(() => setFase("idle"));
          }}
          className={`min-h-[32px] rounded-sm border border-line px-2 font-medium transition-colors hover:bg-raised ${
            peligro ? "text-alarm" : "text-text"
          }`}
        >
          {confirmar}
        </button>
        <button
          type="button"
          onClick={() => setFase("idle")}
          className="min-h-[32px] rounded-sm border border-line px-2 text-text-dim transition-colors hover:bg-raised"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setFase("confirmar")}
      disabled={fase === "enviando"}
      className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:opacity-40"
    >
      {fase === "enviando" ? "Un momento…" : etiqueta}
    </button>
  );
}
