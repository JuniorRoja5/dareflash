"use client";

import { useEffect, useRef, useState } from "react";
import type { Upload } from "tus-js-client";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";

import { CATEGORIAS } from "../retos/retos-datos";
import { tituloEsValido } from "./crear-logic";
import { credencialValida, excedeTope, LIMITE_TAMANO_BYTES, opcionesTus } from "./subida-tus";

/** Icono de camara de video (SVG inline propio, trazo geometrico). */
function IconoCamara() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-10 w-10 text-text-dim"
      aria-hidden
    >
      <rect x="3" y="6" width="12" height="12" rx="1.5" />
      <path d="M15 10l6-3v10l-6-3z" />
    </svg>
  );
}

const MB = 1024 * 1024;
const toMB = (bytes: number): string => `${(bytes / MB).toFixed(1)} MB`;

type Fase = "idle" | "subiendo" | "subido" | "error";

/**
 * Formulario de CREAR (isla cliente). Sube el video DIRECTO a Bunny por TUS reanudable: al pulsar
 * Publicar pide la credencial de corta duracion a POST /api/videos/upload-credential (cookie + CSRF)
 * y sube el fichero a Bunny con `tus-js-client`; los BYTES no pasan por el VPS. La fila `Video` queda
 * en PENDING (el paso a PUBLISHED es la rama de confirmacion, NO aqui; tampoco la duracion <=90 s).
 *
 * El unico magenta de contenido es "Publicar"; la barra de progreso es NEUTRA. `Campo` es solo texto,
 * asi que la Categoria es un <select> nativo vestido con los mismos tokens (sin primitivo nuevo).
 */
export function FormularioCrear() {
  const [titulo, setTitulo] = useState("");
  const [errorTitulo, setErrorTitulo] = useState<string | undefined>(undefined);
  const [fichero, setFichero] = useState<File | null>(null);
  const [errorFichero, setErrorFichero] = useState<string | undefined>(undefined);
  const [fase, setFase] = useState<Fase>("idle");
  const [progreso, setProgreso] = useState(0);
  const [errorSubida, setErrorSubida] = useState<string | undefined>(undefined);
  const uploadRef = useRef<Upload | null>(null);

  // (1) Si el usuario abandona la pantalla a media subida, se aborta: no queda corriendo en JS.
  useEffect(() => () => void uploadRef.current?.abort(), []);

  const ocupado = fase === "subiendo" || fase === "subido";

  // (2) Reinicia el formulario para subir otro video (tras completar).
  const reiniciar = (): void => {
    uploadRef.current = null;
    setFichero(null);
    setTitulo("");
    setErrorTitulo(undefined);
    setErrorFichero(undefined);
    setErrorSubida(undefined);
    setProgreso(0);
    setFase("idle");
  };

  const onElegirFichero = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (excedeTope(f.size)) {
      setFichero(null);
      setErrorFichero(
        `El vídeo supera el límite de ${LIMITE_TAMANO_BYTES / (1024 * MB)} GB. Elige uno más corto o de menor calidad.`,
      );
      return;
    }
    setErrorFichero(undefined);
    setFichero(f);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!tituloEsValido(titulo)) {
      setErrorTitulo(
        "El título no puede estar vacío. Escribe de qué va tu vídeo para que la gente lo encuentre.",
      );
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

    try {
      // 1. Token CSRF atado a la sesion (sin sesion -> 401; la UI de login aun no existe).
      const csrfRes = await fetch("/api/auth/csrf", { credentials: "include" });
      if (!csrfRes.ok) throw new Error("SIN_SESION");
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

      // 2. Credencial de subida (crea el objeto en Bunny + fila Video PENDING; devuelve la credencial).
      const credRes = await fetch("/api/videos/upload-credential", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ title: titulo.trim() }),
      });
      if (!credRes.ok) throw new Error(credRes.status === 401 ? "SIN_SESION" : "CREDENCIAL");
      const credencial: unknown = await credRes.json();
      if (!credencialValida(credencial)) throw new Error("CREDENCIAL");

      // 3. Subida TUS directa a Bunny. Las 4 cabeceras se fijan UNA vez desde la credencial.
      const opciones = opcionesTus(credencial, { filetype: fichero.type, title: titulo.trim() });
      const tus = await import("tus-js-client");
      const upload = new tus.Upload(fichero, {
        endpoint: opciones.endpoint,
        metadata: opciones.metadata,
        headers: opciones.headers,
        retryDelays: [0, 3000, 5000, 10000, 20000], // reanuda ante cortes de red
        onProgress: (subido, total) => setProgreso(total ? Math.round((subido / total) * 100) : 0),
        onError: () => {
          setErrorSubida("No se pudo subir el vídeo. Revisa tu conexión e inténtalo de nuevo.");
          setFase("error");
        },
        onSuccess: () => setFase("subido"),
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

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* Zona de video: <label> sobre input nativo oculto; mismo recuadro de marca (superficie +
          filete, sin sombra). Al elegir, muestra el fichero; volver a pulsar cambia de video. */}
      <label
        htmlFor="crear-video"
        className={`flex min-h-[240px] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border border-line bg-raised px-4 text-center transition-colors duration-150 ease-mechanical hover:bg-surface ${ocupado ? "pointer-events-none opacity-60" : ""}`}
      >
        <IconoCamara />
        {fichero ? (
          <>
            <span className="max-w-full truncate font-medium text-text">{fichero.name}</span>
            <span className="text-2xs uppercase tracking-widest text-text-dim">
              {toMB(fichero.size)} · toca para cambiar
            </span>
          </>
        ) : (
          <>
            <span className="font-medium text-text">Grabar o elegir de la galería</span>
            <span className="text-2xs uppercase tracking-widest text-text-dim">
              Duración máxima: 90 segundos
            </span>
          </>
        )}
        <input
          id="crear-video"
          type="file"
          accept="video/*"
          className="sr-only"
          disabled={ocupado}
          onChange={onElegirFichero}
        />
      </label>
      {errorFichero ? <p className="mt-1.5 text-sm text-alarm">{errorFichero}</p> : null}

      <div className="mt-6 space-y-5">
        <Campo
          id="crear-titulo"
          label="Título"
          placeholder="Ej.: Mi mejor salto en caja"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          error={errorTitulo}
          disabled={ocupado}
        />

        <div>
          <label htmlFor="crear-categoria" className="mb-1.5 block text-sm font-medium text-text">
            Categoría
          </label>
          <select
            id="crear-categoria"
            defaultValue={CATEGORIAS[0]?.clave}
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
      </div>

      {/* Barra de progreso NEUTRA (nada de magenta) mientras sube. */}
      {fase === "subiendo" ? (
        <div className="mt-6" aria-live="polite">
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
        <div className="mt-6">
          <p className="text-center text-sm text-ok" role="status">
            Subido — se publicará tras el procesado.
          </p>
          <Boton
            type="button"
            variante="secundario"
            onClick={reiniciar}
            className="mt-3 w-full py-3"
          >
            Subir otro vídeo
          </Boton>
        </div>
      ) : (
        <Boton type="submit" variante="principal" disabled={ocupado} className="mt-6 w-full py-4">
          {fase === "subiendo" ? `Subiendo… ${progreso} %` : "Publicar"}
        </Boton>
      )}
      {fase === "error" && errorSubida ? (
        <p className="mt-2 text-center text-sm text-alarm" role="status">
          {errorSubida}
        </p>
      ) : null}
    </form>
  );
}
