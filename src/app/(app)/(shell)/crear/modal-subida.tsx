"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Upload } from "tus-js-client";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { AVATAR_TIPOS, avatarExcedeTope } from "@/app/(app)/(shell)/perfil/perfil-logic";
import { getJson, mensajeDe, obtenerCsrfToken, postJsonCsrf } from "@/lib/cliente-http";
import {
  clasificarFalloSubida,
  copySubida,
  esFallo,
  estadoEnVuelo,
  estadoTrasSondeo,
  puedeReintentar,
  sondeoSigueAbierto,
  type EstadoSubida,
  type EstadoVideoSondeo,
} from "@/lib/estado-subida";

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

/**
 * SONDEO de "¿ya es reproducible?". Cadencia y tope: 20 × 3 s = 1 min. Al agotarse NO se declara nada
 * —el vídeo sigue en la cola de codificación de Bunny, que no promete plazo— y el copy de "en-cola" ya
 * dice la verdad: aparecerá en el perfil cuando esté. Un tope alto solo añadiría peticiones.
 */
const SONDEO_MS = 3000;
const SONDEOS_MAX = 20;

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
  // ESTADO REAL de la subida (fuente única en `@/lib/estado-subida`). `null` = aún en el formulario.
  // Sustituye a la vieja `fase`, que metía "subiendo", "en cola" y "listo" en el mismo saco.
  const [estado, setEstado] = useState<EstadoSubida | null>(null);
  const [progreso, setProgreso] = useState(0);
  // Fallos ANTERIORES a que empiece a moverse un byte (sesión, elegibilidad, credencial): los explica
  // el servidor con su propio mensaje humano, así que no se re-inventan aquí.
  const [errorPrevio, setErrorPrevio] = useState<string | undefined>(undefined);
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
  // Bytes que HAN SALIDO. Es la señal que separa "no se pudo conectar" de "se cortó a mitad", y tiene
  // que ser un ref: el `onError` de tus se cierra sobre el valor del render en el que se creó.
  const bytesRef = useRef(0);
  // El sondeo sobrevive al cierre del modal a propósito (completa el reemplazo aunque el usuario se
  // vaya); esto solo evita pintar en un componente que ya no está.
  const montadoRef = useRef(true);
  const tituloId = useId();

  // Bloquea el formulario mientras la subida está viva. Un FALLO lo desbloquea: es lo que permite
  // reintentar sin cerrar y volver a abrir.
  const ocupado = estado !== null && !esFallo(estado);
  const entradas = entradasVideo(esTactil);

  // Monta: guarda foco previo, bloquea scroll del fondo, foca el botón cerrar. Desmonta: revierte +
  // aborta la subida en curso + revoca la previa de la miniatura.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrarRef.current?.focus();
    return () => {
      montadoRef.current = false;
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
      // BUG QUE SE ARREGLA DE PASO: estos dos avisos se escribían en el estado de error de la SUBIDA,
      // que solo se pintaba en la fase "error". Elegir una miniatura no pone el modal en esa fase, así
      // que el mensaje se guardaba y no lo veía nadie: la imagen se rechazaba en silencio.
      setErrorPrevio("La miniatura debe ser una imagen JPG, PNG o WebP.");
      return;
    }
    if (f && avatarExcedeTope(f.size)) {
      setErrorPrevio("La miniatura es demasiado grande. Prueba con una imagen más ligera.");
      return;
    }
    setErrorPrevio(undefined);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = f ? URL.createObjectURL(f) : null;
    objectUrlRef.current = url;
    setPreviaMini(url);
    setMiniatura(f);
  };

  /**
   * ¿En qué ha quedado el vídeo? Sondea `GET /api/videos/[id]`, que le cuenta a SU DUEÑO el estado
   * real: sigue en cola, se publicó, falló la codificación o dura de más.
   *
   * ANTES esto preguntaba por `/reproduccion`, y ahí estaba el agujero: esa ruta devuelve 404 tanto
   * si el vídeo sigue codificando como si la codificación falló. Con una sola señal para dos
   * desenlaces opuestos, un vídeo fallido dejaba al usuario esperando indefinidamente a algo que no
   * iba a llegar — y perdiendo su participación sin saberlo, cuando aún podía subir otro.
   *
   * Para cuando el desenlace está decidido; agotar los intentos sin decisión deja "en-cola", que
   * sigue siendo verdad (el vídeo está a salvo y aparecerá en el perfil).
   *
   * Es UN solo bucle para los dos consumidores (pintar el estado y cerrar el reemplazo): antes había
   * uno dedicado al swap, y dos bucles sondeando lo mismo se separan en cuanto alguien toca uno.
   */
  const sondearEstado = async (videoDbId: string): Promise<EstadoSubida> => {
    for (let intento = 0; intento < SONDEOS_MAX; intento++) {
      await new Promise((r) => setTimeout(r, SONDEO_MS));
      const r = await getJson<{ estado?: EstadoVideoSondeo }>(`/api/videos/${videoDbId}`);
      // Un fallo de red aquí no dice nada del vídeo: se reintenta, no se concluye.
      if (!r.ok || !r.data.estado) continue;
      const estado = estadoTrasSondeo(r.data.estado);
      if (!sondeoSigueAbierto(estado)) return estado;
    }
    return "en-cola";
  };

  // RUTA RÁPIDA del reemplazo: cuando el vídeo nuevo ya es reproducible, confirma el swap para que la
  // participación cambie al instante. Best-effort: si no llega, el worker lo completa (red de
  // seguridad). Sobrevive al cierre del modal a propósito.
  const confirmarReemplazo = async (videoDbId: string): Promise<void> => {
    try {
      const csrfToken = await obtenerCsrfToken();
      await fetch(`/api/videos/${videoDbId}/confirmar-reemplazo`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
    } catch {
      // el worker completa el swap igual.
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

    // Todavía no sube nada: primero hay que pedir permiso. El paso a "subiendo" lo dispara el primer
    // `onProgress`, es decir, cuando de verdad salen bytes.
    setEstado("preparando");
    setProgreso(0);
    bytesRef.current = 0;
    setErrorPrevio(undefined);
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
      if (!cred.ok) {
        // El servidor ya explica en humano por qué no (sesión, elegibilidad, reto cerrado…). Se usa SU
        // mensaje: repetirlo aquí sería una segunda fuente de verdad que se queda vieja.
        throw new Error(
          cred.status === 401
            ? "Inicia sesión para publicar tu vídeo."
            : mensajeDe(cred.data) || "No se pudo preparar la subida. Inténtalo de nuevo.",
        );
      }
      const credencial: unknown = cred.data;
      if (!credencialValida(credencial)) {
        throw new Error("No se pudo preparar la subida. Inténtalo de nuevo.");
      }
      const videoDbId = cred.data.videoDbId ?? null;
      const esReemplazo = cred.data.esReemplazo === true;

      const opciones = opcionesTus(credencial, { filetype: fichero.type, title: titulo.trim() });
      const tus = await import("tus-js-client");
      const upload = new tus.Upload(fichero, {
        endpoint: opciones.endpoint,
        metadata: opciones.metadata,
        headers: opciones.headers,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        onProgress: (subido, total) => {
          bytesRef.current = subido;
          setProgreso(total ? Math.round((subido / total) * 100) : 0);
          // Mientras haya bytes en vuelo el estado es "subiendo", pase lo que pase con el porcentaje.
          setEstado(
            estadoEnVuelo({ subidaCompleta: false, bytesEnviados: subido, bytesTotales: total }),
          );
        },
        // tus ya ha agotado sus reintentos cuando llega aquí, así que el fallo es persistente. Se lee
        // la respuesta REAL: sin ella no hubo conexión; con ella, Bunny dijo algo y ese algo importa.
        onError: (err) => {
          const respuesta = (err as { originalResponse?: { getStatus(): number } | null })
            .originalResponse;
          setEstado(
            clasificarFalloSubida({
              bytesEnviados: bytesRef.current,
              estadoHttp: respuesta ? respuesta.getStatus() : null,
            }),
          );
        },
        // Aquí —y solo aquí— la subida está CERRADA: el vídeo está entero en Bunny y entra en su cola
        // de codificación. Hasta este punto no se le dice al usuario que está a salvo.
        onSuccess: () => {
          setEstado(estadoEnVuelo({ subidaCompleta: true, bytesEnviados: 0, bytesTotales: 0 }));
          if (!videoDbId) return;
          void aplicarMiniatura(videoDbId);
          onSubido?.(videoDbId);
          void (async () => {
            const desenlace = await sondearEstado(videoDbId);
            // El swap solo se cierra si el vídeo nuevo llegó a publicarse: reemplazar una
            // participación viva por una que falló sería destruir la buena.
            if (desenlace === "listo" && esReemplazo) await confirmarReemplazo(videoDbId);
            if (montadoRef.current) setEstado(desenlace);
          })();
        },
      });
      uploadRef.current = upload;
      upload.start();
    } catch (err) {
      // Fallo ANTES de que salga un byte: no es un estado de subida, es el servidor diciendo que no.
      setErrorPrevio(
        err instanceof Error && err.message
          ? err.message
          : "No se pudo preparar la subida. Inténtalo de nuevo.",
      );
      setEstado(null);
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

          {/* SUBIENDO: barra con progreso REAL de bytes. Es el único estado mientras van bytes. */}
          {estado === "subiendo" ? (
            <div className="mt-5" aria-live="polite">
              <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full bg-text-dim transition-[width] duration-150 ease-mechanical"
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <p className="mt-1.5 text-sm tabular-nums text-text-dim">
                {copySubida("subiendo")} {progreso} %
              </p>
            </div>
          ) : null}

          {/* EN COLA / LISTO: la subida ya cerró. Se distinguen a propósito — "en cola" explica que la
              espera es normal y que el vídeo no se ha perdido; "listo" es la confirmación de verdad. */}
          {estado === "en-cola" || estado === "listo" ? (
            <div className="mt-5">
              <p
                className={`text-center text-sm ${estado === "listo" ? "text-ok" : "text-text-dim"}`}
                role="status"
                aria-live="polite"
              >
                {copySubida(estado)}
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
              {estado === "subiendo"
                ? `${copySubida("subiendo")} ${progreso} %`
                : estado === "preparando"
                  ? copySubida("preparando")
                  : estado !== null && puedeReintentar(estado)
                    ? "Reintentar"
                    : "Publicar"}
            </Boton>
          )}

          {/* FALLO: el mensaje nombra la causa real. Un rechazo del fichero no ofrece reintentar. */}
          {estado !== null && esFallo(estado) ? (
            <p className="mt-2 text-center text-sm text-alarm" role="status">
              {copySubida(estado)}
            </p>
          ) : null}
          {errorPrevio ? (
            <p className="mt-2 text-center text-sm text-alarm" role="status">
              {errorPrevio}
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
