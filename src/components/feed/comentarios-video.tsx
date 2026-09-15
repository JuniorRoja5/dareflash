"use client";

import { usePathname } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { COMENTARIO_TEXTO_MAX } from "@/config/constants";
import { delCsrf, getJson, mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { limpiarComentario } from "@/lib/comentarios";
import { haceCuanto } from "@/lib/notificaciones";
import type { ComentarioVista } from "@/server/services/comentarios";

type Carga = { estado: "cargando" } | { estado: "error" } | { estado: "listo" };

/**
 * LOS COMENTARIOS DE UN VÍDEO — la lista real y la caja de escribir. Sustituye a la maqueta del feed
 * (`COMENTARIOS_FEED`, veinte comentarios inventados compartidos por todos los vídeos) y a la caja
 * deshabilitada de "Próximamente".
 *
 * Una sola pieza para las dos superficies: el panel fijo de escritorio y la hoja de móvil. Así lo que
 * llegue después (moderación, reportes) se cablea una vez.
 *
 *  - LEER: la primera página al montar; "Ver más" pide la siguiente por su cursor (keyset). Más nuevos
 *    primero. Un invitado los lee igual.
 *  - ESCRIBIR: solo con sesión (el servidor lo exige de todos modos). La MISMA regla de texto que el
 *    servidor (`limpiarComentario`): el botón no promete lo que la API rechaza. Sin sesión, un enlace a
 *    entrar que vuelve aquí; NAVEGACIÓN DURA, como todo lo que lleva al login.
 *  - BORRAR: solo los propios (el servidor lo marca en `esMio`), con confirmación.
 *  - El CONTADOR del vídeo lo devuelve el servidor tras publicar o borrar, y se sube con `onContador`:
 *    el número del feed es el de la BD, no una suma hecha aquí.
 */
export function ComentariosVideo({
  videoId,
  haySesion,
  onContador,
  idCaja,
}: {
  videoId: string;
  haySesion: boolean;
  onContador: (comentarios: number) => void;
  /** `id` de la caja de escribir (el botón "Comentar" de escritorio la enfoca). */
  idCaja?: string;
}) {
  const ruta = usePathname();
  const [items, setItems] = useState<ComentarioVista[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" });
  const [cargandoMas, setCargandoMas] = useState(false);
  const [ahoraMs, setAhoraMs] = useState(() => Date.now());
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const base = `/api/videos/${encodeURIComponent(videoId)}/comentarios`;

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await getJson<{ items?: ComentarioVista[]; nextCursor?: string | null }>(base);
        if (!vivo) return;
        if (!r.ok || !r.data.items) {
          setCarga({ estado: "error" });
          return;
        }
        setItems(r.data.items);
        setCursor(r.data.nextCursor ?? null);
        setAhoraMs(Date.now());
        setCarga({ estado: "listo" });
      } catch {
        if (vivo) setCarga({ estado: "error" });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [base]);

  async function verMas(): Promise<void> {
    if (!cursor || cargandoMas) return;
    setCargandoMas(true);
    try {
      const r = await getJson<{ items?: ComentarioVista[]; nextCursor?: string | null }>(
        `${base}?cursor=${encodeURIComponent(cursor)}`,
      );
      if (r.ok && r.data.items) {
        setItems((previos) => [...previos, ...(r.data.items ?? [])]);
        setCursor(r.data.nextCursor ?? null);
      }
    } catch {
      /* sin red: se puede volver a pulsar */
    } finally {
      setCargandoMas(false);
    }
  }

  const limpio = limpiarComentario(texto);

  async function publicar(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (limpio === null || enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ comentario?: ComentarioVista; comentarios?: number }>(base, {
        texto: limpio,
      });
      if (r.ok && r.data.comentario) {
        const nuevo = r.data.comentario;
        setItems((previos) => [nuevo, ...previos]);
        setTexto("");
        setAhoraMs(Date.now());
        if (typeof r.data.comentarios === "number") onContador(r.data.comentarios);
        return;
      }
      setAviso(mensajeDe(r.data) || "No se pudo publicar el comentario.");
    } catch {
      setAviso("No hemos podido conectar. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  async function borrar(id: string): Promise<void> {
    setConfirmando(null);
    setAviso(null);
    try {
      const r = await delCsrf<{ comentarios?: number }>(
        `/api/comentarios/${encodeURIComponent(id)}`,
      );
      if (r.ok) {
        setItems((previos) => previos.filter((c) => c.id !== id));
        if (typeof r.data.comentarios === "number") onContador(r.data.comentarios);
        return;
      }
      setAviso(mensajeDe(r.data) || "No se pudo borrar el comentario.");
    } catch {
      setAviso("No hemos podido conectar. Inténtalo de nuevo.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {carga.estado === "cargando" ? (
          <p className="text-sm text-text-dim">Cargando comentarios…</p>
        ) : carga.estado === "error" ? (
          <p role="alert" className="text-sm text-text-dim">
            No se pudieron cargar los comentarios.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-dim">
            Aún no hay comentarios.{haySesion ? " Sé el primero." : ""}
          </p>
        ) : (
          <ul className="space-y-4">
            {items.map((c) => (
              <li key={c.id} data-comentario={c.id} className="flex gap-3">
                <Avatar nombre={c.autor.username} imagen={c.autor.image} tamano="sm" perezosa />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium text-text">@{c.autor.username}</span>{" "}
                    <span className="text-2xs text-text-dim">
                      {haceCuanto(c.creadoMs, ahoraMs)}
                    </span>
                  </p>
                  <p className="text-sm break-words whitespace-pre-line text-text-dim">{c.texto}</p>
                  {c.esMio ? (
                    confirmando === c.id ? (
                      <span className="mt-1 flex items-center gap-2 text-2xs">
                        <span className="text-text-dim">¿Borrar tu comentario?</span>
                        <button
                          type="button"
                          onClick={() => void borrar(c.id)}
                          className="font-medium text-alarm hover:underline"
                        >
                          Sí, borrar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmando(null)}
                          className="text-text-dim hover:underline"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmando(c.id)}
                        className="mt-1 text-2xs text-text-dim hover:text-text hover:underline"
                      >
                        Borrar
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {cursor ? (
          <button
            type="button"
            onClick={() => void verMas()}
            disabled={cargandoMas}
            className="mt-4 w-full rounded-sm border border-line py-2 text-sm text-text-dim transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
          >
            {cargandoMas ? "Cargando…" : "Ver más comentarios"}
          </button>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        {haySesion ? (
          <form onSubmit={(e) => void publicar(e)} className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Escribe un comentario</span>
              <textarea
                id={idCaja}
                value={texto}
                rows={1}
                maxLength={COMENTARIO_TEXTO_MAX}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Comentar…"
                className="block max-h-32 w-full resize-none rounded-sm border border-line bg-raised/60 px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={limpio === null || enviando}
              className="min-h-[36px] shrink-0 rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors hover:bg-raised disabled:opacity-40"
            >
              {enviando ? "Publicando…" : "Publicar"}
            </button>
          </form>
        ) : (
          <a
            href={`/entrar?siguiente=${encodeURIComponent(ruta || "/feed")}`}
            className="block rounded-sm border border-line px-3 py-2 text-center text-sm text-text-dim hover:bg-raised hover:text-text"
          >
            Inicia sesión para comentar
          </a>
        )}
        {aviso ? (
          <p role="alert" className="mt-2 text-xs text-alarm">
            {aviso}
          </p>
        ) : null}
      </div>
    </div>
  );
}
