"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Upload } from "tus-js-client";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { AVATAR_TIPOS, avatarExcedeTope } from "@/app/(app)/(shell)/perfil/perfil-logic";
import { mensajeDe, obtenerCsrfToken, postJsonCsrf } from "@/lib/cliente-http";

import { CATEGORIAS } from "../retos/retos-datos";
import { tituloEsValido } from "./crear-logic";
import { entradasVideo } from "./entrada-video";
import {
  credencialValida,
  duracionExcedeLimite,
  excedeTope,
  LIMITE_TAMANO_BYTES,
  MENSAJE_DURACION_EXCEDIDA,
  opcionesTus,
} from "./subida-tus";

const MB = 1024 * 1024;
const toMB = (bytes: number): string => `${(bytes / MB).toFixed(1)} MB`;

const SELECTOR_FOCO =
  'a[href], button:not([disabled]), textarea, input:not([type="file"]), select, label[for], [tabindex]:not([tabindex="-1"])';

/**
 * Lee la duración (segundos) de un vídeo EN EL NAVEGADOR sin subir un byte (un <video> temporal desde
 * un object URL). Si no se puede leer la metadata, resuelve Infinity -> el pre-check lo deja pasar y
 * decide el servidor. Libera el object URL SIEMPRE.
 */
function leerDuracionVideo(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cerrar = (segundos: number): void => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(segundos);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => cerrar(video.duration);
    video.onerror = () => cerrar(Infinity);
    video.src = url;
  });
}

type Fase = "idle" | "subiendo" | "subido" | "error";

/**
 * MODAL DE SUBIDA — overlay accesible reutilizable. Sube el vídeo DIRECTO a Bunny por TUS reanudable
 * (los bytes NO pasan por el VPS): pide credencial a POST /api/videos/upload-credential y sube con
 * tus-js-client; la fila `Video` queda PENDING (el paso a PUBLISHED lo hace el worker). Parametrizado
 * por `challengeId?` (participar) — hoy solo se PASA al servidor; el enlace con el reto lo cablea 2b.
 *
 * ENTRADA DE VÍDEO honesta según el dispositivo (`entradasVideo`): móvil -> "Grabar" (cámara) + "Galería";
 * escritorio -> "Elegir vídeo". MINIATURA opcional del dueño: se elige aquí y, cuando la subida termina,
 * se envía a POST /api/videos/{id}/miniatura (Bunny Set Thumbnail); su fallo es un aviso, no rompe la
 * subida. El único magenta es "Publicar"; la barra de progreso es NEUTRA.
 */
export function ModalSubida({
  challengeId,
  onCerrar,
  onSubido,
}: {
  challengeId?: string;
  onCerrar: () => void;
  onSubido?: (videoDbId: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0]?.clave ?? "");
  const [errorTitulo, setErrorTitulo] = useState<string | undefined>(undefined);
  const [fichero, setFichero] = useState<File | null>(null);
  const [errorFichero, setErrorFichero] = useState<string | undefined>(undefined);
  const [miniatura, setMiniatura] = useState<File | null>(null);
  const [previaMini, setPreviaMini] = useState<string | null>(null);
  const [fase, setFase] = useState<Fase>("idle");
  const [progreso, setProgreso] = useState(0);
  const [errorSubida, setErrorSubida] = useState<string | undefined>(undefined);
  const [aviso, setAviso] = useState<string | undefined>(undefined);
  // Puntero grueso (móvil/tablet). El modal se monta solo en cliente (tras un clic), así que se puede
  // leer `matchMedia` en el initializer sin riesgo de mismatch de hidratación (no está en el árbol SSR).
  const [esTactil] = useState(
    () =>
      typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false),
  );

  const uploadRef = useRef<Upload | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const dialogoRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const tituloId = useId();

  const ocupado = fase === "subiendo" || fase === "subido";
  const entradas = entradasVideo(esTactil);

  // Monta: guarda foco previo, bloquea scroll del fondo, foca el botón cerrar. Desmonta: revierte +
  // aborta la subida en curso + revoca la previa de la miniatura.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrarRef.current?.focus();
    return () => {
      document.body.style.overflow = scrollPrevio;
      previo?.focus?.();
      uploadRef.current?.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCerrar();
        return;
      }
      if (e.key !== "Tab") return;
      const cont = dialogoRef.current;
      if (!cont) return;
      const focos = Array.from(cont.querySelectorAll<HTMLElement>(SELECTOR_FOCO)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (!primero || !ultimo) return;
      const activo = document.activeElement;
      if (e.shiftKey && activo === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    },
    [onCerrar],
  );

  const onElegirFichero = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el MISMO fichero
    if (!f) return;
    if (excedeTope(f.size)) {
      setFichero(null);
      setErrorFichero(
        `El vídeo supera el límite de ${LIMITE_TAMANO_BYTES / (1024 * MB)} GB. Elige uno más corto o de menor calidad.`,
      );
      return;
    }
    const duracion = await leerDuracionVideo(f);
    if (duracionExcedeLimite(duracion)) {
      setFichero(null);
      setErrorFichero(MENSAJE_DURACION_EXCEDIDA);
      return;
    }
    setErrorFichero(undefined);
    setFichero(f);
  };

  const onElegirMiniatura = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (f && !AVATAR_TIPOS.includes(f.type as (typeof AVATAR_TIPOS)[number])) {
      setErrorSubida("La miniatura debe ser una imagen JPG, PNG o WebP.");
      return;
    }
    if (f && avatarExcedeTope(f.size)) {
      setErrorSubida("La miniatura es demasiado grande. Prueba con una imagen más ligera.");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = f ? URL.createObjectURL(f) : null;
    objectUrlRef.current = url;
    setPreviaMini(url);
    setMiniatura(f);
  };

  // RUTA RÁPIDA del reemplazo: cuando el vídeo nuevo pasa a PUBLISHED, confirma el swap para que la
  // participación cambie al instante. Sondea `reproduccion` (200 = PUBLISHED) unas veces y llama a
  // `confirmar-reemplazo`. Best-effort SIN tocar estado (el modal puede cerrarse): si no llega, el
  // worker completa el swap igual (red de seguridad).
  const confirmarReemplazo = async (videoDbId: string): Promise<void> => {
    for (let intento = 0; intento < 12; intento++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const pub = await fetch(`/api/videos/${videoDbId}/reproduccion`, {
          credentials: "include",
        });
        if (pub.ok) {
          const csrfToken = await obtenerCsrfToken();
          await fetch(`/api/videos/${videoDbId}/confirmar-reemplazo`, {
            method: "POST",
            credentials: "include",
            headers: { "X-CSRF-Token": csrfToken },
          });
          return;
        }
      } catch {
        // red intermitente: se reintenta; si nunca cuaja, el worker lo completa.
      }
    }
  };

  // Tras la subida OK: si el dueño eligió miniatura, la envía a Bunny (Set Thumbnail). No bloquea: un
  // fallo deja la miniatura automática y se avisa.
  const aplicarMiniatura = async (videoDbId: string): Promise<void> => {
    if (!miniatura) return;
    try {
      const cuerpo = new FormData();
      cuerpo.set("imagen", miniatura);
      const csrfToken = await obtenerCsrfToken();
      const res = await fetch(`/api/videos/${videoDbId}/miniatura`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
        body: cuerpo,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAviso(mensajeDe(data) || "No se pudo aplicar la miniatura; se usará una automática.");
      }
    } catch {
      setAviso("No se pudo aplicar la miniatura; se usará una automática.");
    }
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!tituloEsValido(titulo)) {
      setErrorTitulo("El título no puede estar vacío. Escribe de qué va tu vídeo.");
      return;
    }
    setErrorTitulo(undefined);
    if (!fichero) {
      setErrorFichero("Elige o graba un vídeo primero.");
      return;
    }

    setFase("subiendo");
    setProgreso(0);
    setErrorSubida(undefined);
    setAviso(undefined);

    try {
      const cred = await postJsonCsrf<{ videoDbId?: string; esReemplazo?: boolean }>(
        "/api/videos/upload-credential",
        {
          title: titulo.trim(),
          // Participacion -> challengeId (la categoria la pone el reto). Libre -> categoria elegida.
          ...(challengeId ? { challengeId } : { category: categoria }),
        },
      );
      if (!cred.ok) throw new Error(cred.status === 401 ? "SIN_SESION" : "CREDENCIAL");
      const credencial: unknown = cred.data;
      if (!credencialValida(credencial)) throw new Error("CREDENCIAL");
      const videoDbId = cred.data.videoDbId ?? null;
      const esReemplazo = cred.data.esReemplazo === true;

      const opciones = opcionesTus(credencial, { filetype: fichero.type, title: titulo.trim() });
      const tus = await import("tus-js-client");
      const upload = new tus.Upload(fichero, {
        endpoint: opciones.endpoint,
        metadata: opciones.metadata,
        headers: opciones.headers,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        onProgress: (subido, total) => setProgreso(total ? Math.round((subido / total) * 100) : 0),
        onError: () => {
          setErrorSubida("No se pudo subir el vídeo. Revisa tu conexión e inténtalo de nuevo.");
          setFase("error");
        },
        onSuccess: () => {
          setFase("subido");
          if (videoDbId) {
            void aplicarMiniatura(videoDbId);
            if (esReemplazo) void confirmarReemplazo(videoDbId);
            onSubido?.(videoDbId);
          }
        },
      });
      uploadRef.current = upload;
      upload.start();
    } catch (err) {
      const codigo = err instanceof Error ? err.message : "";
      setErrorSubida(
        codigo === "SIN_SESION"
          ? "Inicia sesión para publicar tu vídeo."
          : "No se pudo preparar la subida. Inténtalo de nuevo.",
      );
      setFase("error");
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !ocupado) onCerrar();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="df-rise relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm border border-line bg-surface p-6 shadow-[var(--df-shadow-lg)]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={tituloId} className="text-lg font-semibold text-text">
            {challengeId ? "Participar con tu vídeo" : "Subir tu vídeo"}
          </h2>
          <button
            ref={cerrarRef}
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            disabled={ocupado}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
          >
            <IconoCerrar />
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate>
          {/* Zona de vídeo: previa del elegido + entradas honestas por dispositivo. */}
          <div className="flex min-h-[140px] w-full flex-col items-center justify-center gap-3 rounded-sm border border-line bg-raised px-4 py-6 text-center">
            <IconoCamara />
            {fichero ? (
              <>
                <span className="max-w-full truncate font-medium text-text">{fichero.name}</span>
                <span className="text-2xs tracking-widest text-text-dim uppercase">
                  {toMB(fichero.size)}
                </span>
              </>
            ) : (
              <span className="text-2xs tracking-widest text-text-dim uppercase">
                Duración máxima: 90 segundos
              </span>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {entradas.map((ent) => (
                <label
                  key={ent.clave}
                  className={`inline-flex min-h-[40px] cursor-pointer items-center rounded-sm border border-line bg-surface px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised ${ocupado ? "pointer-events-none opacity-60" : ""}`}
                >
                  {fichero ? `${ent.label} otro` : ent.label}
                  <input
                    type="file"
                    accept="video/*"
                    {...(ent.capture ? { capture: "user" as const } : {})}
                    className="sr-only"
                    disabled={ocupado}
                    onChange={(e) => void onElegirFichero(e)}
                  />
                </label>
              ))}
            </div>
          </div>
          {errorFichero ? <p className="mt-1.5 text-sm text-alarm">{errorFichero}</p> : null}

          <div className="mt-5 space-y-5">
            <Campo
              id="subida-titulo"
              label="Título"
              placeholder="Ej.: Mi mejor salto en caja"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              error={errorTitulo}
              disabled={ocupado}
            />

            {/* Categoría: SOLO en la subida libre (obligatoria). En una participación la pone el reto. */}
            {challengeId ? null : (
              <div>
                <label
                  htmlFor="subida-categoria"
                  className="mb-1.5 block text-sm font-medium text-text"
                >
                  Categoría
                </label>
                <select
                  id="subida-categoria"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  disabled={ocupado}
                  className="min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:border-text focus:bg-raised disabled:opacity-60"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* MINIATURA opcional. */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text">
                Miniatura <span className="text-text-dim">(opcional)</span>
              </label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-28 shrink-0 overflow-hidden rounded-sm border border-line bg-raised">
                  {previaMini ? (
                    // eslint-disable-next-line @next/next/no-img-element -- previa local (object URL)
                    <img
                      src={previaMini}
                      alt="Vista previa de la miniatura"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <label
                  className={`inline-flex min-h-[40px] cursor-pointer items-center rounded-sm border border-line bg-surface px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised ${ocupado ? "pointer-events-none opacity-60" : ""}`}
                >
                  {miniatura ? "Cambiar imagen" : "Elegir imagen"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={ocupado}
                    onChange={onElegirMiniatura}
                  />
                </label>
              </div>
            </div>
          </div>

          {fase === "subiendo" ? (
            <div className="mt-5" aria-live="polite">
              <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full bg-text-dim transition-[width] duration-150 ease-mechanical"
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <p className="mt-1.5 text-sm tabular-nums text-text-dim">Subiendo… {progreso} %</p>
            </div>
          ) : null}

          {fase === "subido" ? (
            <div className="mt-5">
              <p className="text-center text-sm text-ok" role="status">
                Subido. Lo estamos procesando; aparecerá cuando esté listo.
              </p>
              {aviso ? (
                <p className="mt-2 text-center text-sm text-alarm" role="alert">
                  {aviso}
                </p>
              ) : null}
              <Boton
                type="button"
                variante="secundario"
                onClick={onCerrar}
                className="mt-3 w-full py-3"
              >
                Cerrar
              </Boton>
            </div>
          ) : (
            <Boton
              type="submit"
              variante="principal"
              disabled={ocupado}
              className="mt-5 w-full py-4"
            >
              {fase === "subiendo" ? `Subiendo… ${progreso} %` : "Publicar"}
            </Boton>
          )}
          {fase === "error" && errorSubida ? (
            <p className="mt-2 text-center text-sm text-alarm" role="status">
              {errorSubida}
            </p>
          ) : null}
        </form>
      </div>
    </div>,
    document.body,
  );
}

function IconoCamara() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-9 w-9 text-text-dim"
      aria-hidden
    >
      <rect x="3" y="6" width="12" height="12" rx="1.5" />
      <path d="M15 10l6-3v10l-6-3z" />
    </svg>
  );
}

function IconoCerrar() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
