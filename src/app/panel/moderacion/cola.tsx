"use client";

import { useState } from "react";

import { ModalReproductor } from "@/components/ui/modal-reproductor";
import { MOTIVOS_DENUNCIA, type ReportReason } from "@/config/constants";
import { getJson, mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { enlaceComentario } from "@/lib/enlace-comentario";
import { nombreMostrado } from "@/lib/identidad";
import type { FilaCola, PaginaCola } from "@/server/services/cola-moderacion";

/** El copy de cada motivo, por su clave. Fuente única compartida con el diálogo de denunciar. */
const TEXTO_MOTIVO = new Map<ReportReason, string>(MOTIVOS_DENUNCIA.map((m) => [m.clave, m.texto]));

type Fase = "idle" | "confirmar-retirar" | "confirmar-descartar" | "enviando";

/**
 * LA COLA DE MODERACIÓN — lo denunciado y sin decidir, lo más denunciado primero.
 *
 * Una sola pieza para las DOS superficies: `/panel/moderacion` (todo) y la ficha de un reto (solo lo
 * suyo, vía `reto`). Lo que cambia es de dónde salen las páginas siguientes, no cómo se pinta ni qué
 * se puede hacer.
 *
 * Cada fila deja INSPECCIONAR antes de decidir —el vídeo se reproduce, el comentario se lee entero y
 * se puede abrir en su sitio—, porque moderar sin mirar es lo que produce errores que luego hay que
 * deshacer a mano.
 *
 * Tras decidir, la fila SALE de la lista: ya no está pendiente. No se recarga la página (se perdería
 * el scroll y lo ya cargado, justo mientras se revisa una cola larga).
 */
export function ColaModeracion({
  inicial,
  cursorInicial,
  reto,
}: {
  inicial: FilaCola[];
  cursorInicial: string | null;
  /** Id del reto cuando la cola vive dentro de su ficha; sin él, la cola entera. */
  reto?: string;
}) {
  const [items, setItems] = useState<FilaCola[]>(inicial);
  const [cursor, setCursor] = useState<string | null>(cursorInicial);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verVideo, setVerVideo] = useState<{ id: string; titulo: string | null } | null>(null);

  async function cargarMas(): Promise<void> {
    if (cursor === null || cargando) return;
    setCargando(true);
    try {
      const q = new URLSearchParams({ cursor });
      if (reto) q.set("reto", reto);
      const r = await getJson<PaginaCola>(`/api/panel/moderacion?${q.toString()}`);
      if (r.ok && Array.isArray(r.data.items)) {
        setItems((previos) => [...previos, ...r.data.items]);
        setCursor(r.data.nextCursor ?? null);
      }
    } catch {
      /* sin red: se puede volver a pulsar */
    } finally {
      setCargando(false);
    }
  }

  async function decidir(fila: FilaCola, accion: "retirar" | "descartar"): Promise<void> {
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ mensaje?: string }>(`/api/panel/moderacion/${accion}`, {
        targetType: fila.targetType,
        targetId: fila.targetId,
      });
      if (r.ok) {
        // Decidida = fuera de la cola. Lo que quede de ella vive en el contenido, no aquí.
        setItems((previos) => previos.filter((x) => x.targetId !== fila.targetId));
        setAviso(r.data.mensaje ?? null);
        return;
      }
      setAviso(mensajeDe(r.data) || "No se pudo completar la acción.");
    } catch {
      setAviso("No hemos podido conectar. Inténtalo de nuevo.");
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-surface/40 p-5 text-sm text-text-dim">
        {aviso ?? "No hay nada pendiente de revisar."}
      </p>
    );
  }

  return (
    <div>
      {aviso ? (
        <p role="status" className="mb-3 text-sm text-text-dim">
          {aviso}
        </p>
      ) : null}

      <ul className="space-y-3">
        {items.map((fila) => (
          <Fila
            key={`${fila.targetType}:${fila.targetId}`}
            fila={fila}
            onVerVideo={setVerVideo}
            onDecidir={decidir}
          />
        ))}
      </ul>

      {cursor !== null ? (
        <button
          type="button"
          onClick={() => void cargarMas()}
          disabled={cargando}
          className="mt-4 w-full rounded-sm border border-line py-2 text-sm text-text-dim transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
        >
          {cargando ? "Cargando…" : "Ver más"}
        </button>
      ) : null}

      {verVideo ? (
        <ModalReproductor
          id={verVideo.id}
          titulo={verVideo.titulo}
          onCerrar={() => setVerVideo(null)}
        />
      ) : null}
    </div>
  );
}

function Fila({
  fila,
  onVerVideo,
  onDecidir,
}: {
  fila: FilaCola;
  onVerVideo: (v: { id: string; titulo: string | null }) => void;
  onDecidir: (fila: FilaCola, accion: "retirar" | "descartar") => Promise<void>;
}) {
  const [fase, setFase] = useState<Fase>("idle");
  const autor = nombreMostrado(fila.autor.displayName, fila.autor.username);
  const esVideo = fila.targetType === "VIDEO";
  const yaRetirado = esVideo ? fila.video?.retirado : fila.comentario?.retirado;

  async function ejecutar(accion: "retirar" | "descartar"): Promise<void> {
    setFase("enviando");
    await onDecidir(fila, accion);
    setFase("idle");
  }

  return (
    <li className="rounded-sm border border-line bg-surface p-4" data-objeto={fila.targetId}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim">
          {esVideo ? "Vídeo" : "Comentario"}
        </span>
        <span className="text-sm font-semibold text-text tabular-nums">
          {fila.denunciantes}{" "}
          {fila.denunciantes === 1 ? "persona lo ha denunciado" : "personas lo han denunciado"}
        </span>
        {yaRetirado ? (
          <span className="rounded-xs bg-alarm/15 px-2 py-0.5 text-2xs text-alarm">
            Ya retirado
          </span>
        ) : null}
        <span className="ml-auto text-2xs text-text-dim">de @{autor}</span>
      </div>

      <p className="mt-1 text-2xs text-text-dim">
        {fila.motivos.map((m) => TEXTO_MOTIVO.get(m) ?? m).join(" · ")}
      </p>

      {/* INSPECCIÓN: el vídeo se ve, el comentario se lee. Decidir sin mirar es lo que se evita. */}
      {esVideo && fila.video ? (
        <button
          type="button"
          onClick={() => onVerVideo({ id: fila.targetId, titulo: fila.video!.titulo })}
          className="mt-3 flex items-center gap-3 rounded-sm border border-line p-2 text-left transition-colors hover:bg-raised"
        >
          {fila.video.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fila.video.poster}
              alt=""
              loading="lazy"
              className="h-16 w-10 shrink-0 rounded-xs object-cover"
            />
          ) : null}
          <span className="text-sm text-text">{fila.video.titulo ?? "Ver el vídeo"}</span>
        </button>
      ) : null}

      {!esVideo && fila.comentario ? (
        <div className="mt-3 rounded-sm border border-line p-3">
          <p className="text-sm break-words whitespace-pre-line text-text">
            {fila.comentario.texto}
          </p>
          <a
            href={enlaceComentario(fila.comentario.videoId, fila.targetId)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-2xs text-text-dim hover:text-text hover:underline"
          >
            Verlo en su sitio
          </a>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {fase === "confirmar-retirar" ? (
          <Confirmacion
            pregunta={esVideo ? "¿Retirar este vídeo?" : "¿Retirar este comentario?"}
            confirmar="Sí, retirar"
            peligro
            onSi={() => void ejecutar("retirar")}
            onNo={() => setFase("idle")}
          />
        ) : fase === "confirmar-descartar" ? (
          <Confirmacion
            pregunta="¿Descartar estas denuncias? El contenido se queda."
            confirmar="Sí, descartar"
            onSi={() => void ejecutar("descartar")}
            onNo={() => setFase("idle")}
          />
        ) : (
          <>
            <button
              type="button"
              disabled={fase === "enviando"}
              onClick={() => setFase("confirmar-retirar")}
              className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors hover:bg-raised disabled:opacity-40"
            >
              Retirar
            </button>
            <button
              type="button"
              disabled={fase === "enviando"}
              onClick={() => setFase("confirmar-descartar")}
              className="min-h-[36px] rounded-sm border border-line px-3 text-sm text-text-dim transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
            >
              Descartar
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function Confirmacion({
  pregunta,
  confirmar,
  peligro = false,
  onSi,
  onNo,
}: {
  pregunta: string;
  confirmar: string;
  peligro?: boolean;
  onSi: () => void;
  onNo: () => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-2xs">
      <span className="text-text-dim">{pregunta}</span>
      <button
        type="button"
        onClick={onSi}
        className={`min-h-[32px] rounded-sm border border-line px-2 font-medium transition-colors hover:bg-raised ${
          peligro ? "text-alarm" : "text-text"
        }`}
      >
        {confirmar}
      </button>
      <button
        type="button"
        onClick={onNo}
        className="min-h-[32px] rounded-sm border border-line px-2 text-text-dim transition-colors hover:bg-raised"
      >
        Cancelar
      </button>
    </span>
  );
}
