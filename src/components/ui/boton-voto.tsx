"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import { MSG_VOTO_SIN_VER } from "@/config/constants";
import { estaVista, suscribirVistas } from "@/lib/visto-cliente";
import {
  accionQuitar,
  accionVotar,
  deltaDe,
  estadoBoton,
  sembrarVoto,
  suscribirVotos,
  votoEnReto,
} from "@/lib/voto-cliente";

import { ContadorVotos } from "./contador-votos";

/**
 * BOTÓN DE VOTAR + RECUENTO — ÚNICO componente, montado donde hay reproductor (el rail del feed y el
 * modal del detalle del reto). La celda de la rejilla del reto NO lo lleva: allí el usuario aún no ha
 * reproducido nada, así que el botón nacería siempre bloqueado — enseña solo el `ContadorVotos`.
 *
 * ┌─ EL BOTÓN REFLEJA EL ESTADO REAL. Ni toque muerto, ni éxito-y-revierte ────────────────────────┐
 * │ - El estado inicial viene en el PAYLOAD (`miVoto`, `retoAbierto`), no de una ida y vuelta: se   │
 * │   pinta bien EN LA CARGA, no tras el primer tap.                                                │
 * │ - El gate de "visto" se lee EN VIVO del registro de `visto-cliente`: mientras no esté vista, el │
 * │   botón dice "reproduce para votar" en vez de ofrecer un "Votar" que el servidor tumbaría.      │
 * │ - Al pulsar, el cambio es OPTIMISTA y se DESHACE entero si el servidor dice que no.             │
 * │ - Un invitado no ve un botón muerto: va a /entrar con vuelta a donde estaba.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TRATAMIENTO heredado del style-guide (`VotoDemo`) y del brief: magenta PLANO (`bg-action`, sin
 * degradado: los CTA no lo llevan) sobre `text-void`, el rayo, "Votar" -> "Votado", y la confirmación
 * en `--df-ok`. El recuento es la primitiva `ContadorVotos` (neutro, golpe seco). Aquí no se dibuja
 * nada nuevo: se ensambla.
 *
 * UN SOLO MAGENTA POR PANTALLA: este es el de la superficie de reproducción. El diálogo de mover es la
 * única otra cosa que puede llevarlo, y solo mientras está abierto (es LA acción en ese momento).
 */

/** El rayo. Fuente única: la definió el feed y aquí se reutiliza con el mismo trazo del sistema. */
export function IconoVoto({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M13 3 5 14h5l-1 7 8-11h-5l1-7Z" />
    </svg>
  );
}

/**
 * RECUENTO SOLO LECTURA que respeta tu delta optimista. Lo usa la celda de la rejilla del reto, que NO
 * lleva botón: sin esto, votar en el modal y cerrarlo dejaría la celda de debajo con el número viejo —
 * dos sitios de la misma pantalla contándose cosas distintas.
 */
export function RecuentoVotos({
  participacionId,
  votos,
  className = "",
}: {
  participacionId: string;
  votos: number;
  className?: string;
}) {
  const delta = useSyncExternalStore(
    suscribirVotos,
    () => deltaDe(participacionId),
    () => 0,
  );
  return <ContadorVotos votos={votos + delta} className={className} />;
}

/** Suscripción a los DOS registros (vistas y votos) con la forma de `useSyncExternalStore`. */
function useEstadoVoto(retoId: string, participacionId: string) {
  const visto = useSyncExternalStore(
    suscribirVistas,
    () => estaVista(participacionId),
    () => false, // en el servidor nunca hay marca: el primer pintado es el conservador
  );
  const votoActual = useSyncExternalStore(
    suscribirVotos,
    () => votoEnReto(retoId),
    () => undefined,
  );
  const delta = useSyncExternalStore(
    suscribirVotos,
    () => deltaDe(participacionId),
    () => 0,
  );
  return { visto, votoActual, delta };
}

export interface BotonVotoProps {
  retoId: string;
  participacionId: string;
  /** Recuento que trajo el payload. El delta de TU acción se le suma encima. */
  votos: number;
  /** Voto del usuario en ESTE reto, del payload. Siembra el estado compartido en el primer montaje. */
  miVoto: string | null;
  retoAbierto: boolean;
  haySesion: boolean;
  /** ¿Es mi propia participación? No se vota (el servidor responde AUTOVOTO). */
  esMia?: boolean;
  /** Sobre vídeo (feed) el botón es un círculo con etiqueta debajo; en el modal, un botón normal. */
  variante?: "rail" | "barra";
}

export function BotonVoto({
  retoId,
  participacionId,
  votos,
  miVoto,
  retoAbierto,
  haySesion,
  esMia = false,
  variante = "barra",
}: BotonVotoProps) {
  // Siembra durante el render: `sembrarVoto` NO pisa lo que ya haya, así que llamarlo en cada montaje
  // (y en cada render) es idempotente. En un efecto llegaría un frame tarde y el botón parpadearía.
  sembrarVoto(retoId, miVoto);

  const { visto, votoActual, delta } = useEstadoVoto(retoId, participacionId);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mover, setMover] = useState<{ mensaje: string; votoActualEn: string | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const estado = estadoBoton({
    retoAbierto,
    haySesion,
    visto,
    votoActual,
    participacionId,
    esMia,
  });

  const alPulsar = useCallback(async () => {
    setAviso(null);
    if (estado === "invitado") {
      // La vuelta se lee AQUÍ, no de una prop: es la ruta en la que el usuario está de verdad, y
      // ninguna pantalla puede equivocarse al pasarla. Siempre local, así que no abre open-redirect.
      const vuelta = window.location.pathname + window.location.search;
      window.location.href = `/entrar?siguiente=${encodeURIComponent(vuelta)}`;
      return;
    }
    if (estado !== "votar" && estado !== "votado") return;

    setOcupado(true);
    try {
      const r =
        estado === "votado"
          ? await accionQuitar({ retoId, participacionId })
          : await accionVotar({ retoId, participacionId });
      if (r.estado === "requiere-mover") {
        setMover({ mensaje: r.mensaje, votoActualEn: r.votoActualEn });
      } else if (r.estado === "sin-ver" || r.estado === "rechazado") {
        setAviso(r.mensaje); // COPY del servidor, ya humano
      }
    } finally {
      setOcupado(false);
    }
  }, [estado, retoId, participacionId]);

  const confirmarMover = useCallback(async () => {
    setMover(null);
    setOcupado(true);
    try {
      const r = await accionVotar({ retoId, participacionId, permitirMover: true });
      if (r.estado === "sin-ver" || r.estado === "rechazado") setAviso(r.mensaje);
    } finally {
      setOcupado(false);
    }
  }, [retoId, participacionId]);

  const votado = estado === "votado";
  const bloqueado = estado === "cerrado" || estado === "no-votable" || estado === "sin-ver";
  const etiqueta = TEXTO[estado];

  const contador = (
    <span className="tabular-nums">
      <ContadorVotos votos={votos + delta} />
    </span>
  );

  // RAIL (feed): círculo magenta con el rayo y el recuento debajo, como el resto de acciones.
  if (variante === "rail") {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => void alPulsar()}
          disabled={bloqueado || ocupado}
          aria-label={ARIA[estado]}
          title={estado === "sin-ver" ? MSG_VOTO_SIN_VER : undefined}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-void transition-[filter,background-color] duration-[var(--df-dur-fast)] ease-mechanical ${
            votado ? "bg-ok" : "bg-action"
          } ${bloqueado ? "opacity-45" : "hover:brightness-110"}`}
        >
          <IconoVoto className="h-6 w-6" />
        </button>
        <span className="text-2xs font-semibold text-white lg:text-text-dim">{contador}</span>
        {mover ? (
          <DialogoMover
            mensaje={mover.mensaje}
            onConfirmar={() => void confirmarMover()}
            onCancelar={() => setMover(null)}
          />
        ) : null}
        {aviso ? <Aviso texto={aviso} /> : null}
      </div>
    );
  }

  // BARRA (modal del detalle): botón con texto + recuento al lado.
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void alPulsar()}
        disabled={bloqueado || ocupado}
        className={`inline-flex items-center gap-2 rounded-sm px-5 py-2.5 text-sm font-semibold text-void transition-[filter] duration-150 ease-mechanical disabled:opacity-60 ${
          votado ? "bg-ok" : "bg-action"
        } ${bloqueado ? "" : "hover:brightness-110"}`}
      >
        <IconoVoto />
        {etiqueta}
      </button>
      <span className="text-xl font-semibold text-text">
        {contador} <span className="text-sm font-normal text-text-dim">votos</span>
      </span>
      {votado ? <span className="text-sm text-ok">· voto registrado</span> : null}
      {estado === "sin-ver" ? (
        <span className="text-sm text-text-dim">{MSG_VOTO_SIN_VER}</span>
      ) : null}
      {mover ? (
        <DialogoMover
          mensaje={mover.mensaje}
          onConfirmar={() => void confirmarMover()}
          onCancelar={() => setMover(null)}
        />
      ) : null}
      {aviso ? <Aviso texto={aviso} /> : null}
    </div>
  );
}

/** Texto del botón por estado. Copy HUMANO, nunca el código del estado. */
const TEXTO: Record<string, string> = {
  cerrado: "Votación cerrada",
  invitado: "Votar",
  "sin-ver": "Votar",
  votar: "Votar",
  votado: "Votado",
  "no-votable": "Tu participación",
};

/** Lo que oye un lector de pantalla: el botón NO puede decir "Votar" cuando no se puede votar. */
const ARIA: Record<string, string> = {
  cerrado: "La votación de este reto está cerrada",
  invitado: "Inicia sesión para votar",
  "sin-ver": MSG_VOTO_SIN_VER,
  votar: "Votar esta participación",
  votado: "Quitar mi voto de esta participación",
  "no-votable": "No puedes votar tu propia participación",
};

function Aviso({ texto }: { texto: string }) {
  return (
    <p role="status" className="text-2xs text-alarm">
      {texto}
    </p>
  );
}

/**
 * Confirmación de MOVER. El voto es único por reto, así que moverlo se lo quita a otra persona: se
 * pregunta siempre, y el servidor no mueve nada sin `permitirMover` (el consentimiento no es solo de
 * la UI). Magenta SOLO aquí mientras está abierto: es LA acción de la pantalla en ese momento.
 */
function DialogoMover({
  mensaje,
  onConfirmar,
  onCancelar,
}: {
  mensaje: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Mover tu voto"
      className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-sm border border-line bg-surface/95 p-4 text-left shadow-[var(--df-shadow-md)] backdrop-blur-md"
    >
      <p className="text-sm text-text">{mensaje}</p>
      <p className="mt-0.5 text-2xs text-text-dim">¿Mover tu voto aquí?</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          autoFocus
          onClick={onConfirmar}
          className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-void transition-[filter] duration-150 ease-mechanical hover:brightness-110"
        >
          Mover mi voto
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-sm border border-line px-4 py-2 text-sm text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
