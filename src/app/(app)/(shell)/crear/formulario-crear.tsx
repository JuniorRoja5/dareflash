"use client";

import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";

import { CATEGORIAS } from "../retos/retos-datos";
import { tituloEsValido } from "./crear-logic";

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

/**
 * Formulario de CREAR (isla cliente): zona de video (placeholder) + Campo "Título" + selector de
 * categoria + boton PUBLICAR. Maqueta: sin subida ni backend. La validacion es de cliente (titulo
 * vacio -> error en el Campo con la voz del brief). El unico magenta de contenido es "Publicar".
 *
 * NOTA: `Campo` es solo texto; la Categoria (elegir de las 14) se compone con un <select> nativo
 * con el MISMO lenguaje visual del Campo (label real + tokens), sin inventar un primitivo nuevo.
 */
export function FormularioCrear() {
  const [titulo, setTitulo] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [publicado, setPublicado] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!tituloEsValido(titulo)) {
      setError(
        "El título no puede estar vacío. Escribe de qué va tu vídeo para que la gente lo encuentre.",
      );
      return;
    }
    setError(undefined);
    setPublicado(true); // maqueta: sin subida real
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* Zona de video: placeholder de grabar / elegir. Superficie + filete, sin sombra. */}
      <button
        type="button"
        className="flex min-h-[240px] w-full flex-col items-center justify-center gap-3 rounded-sm border border-line bg-raised px-4 text-center transition-colors duration-150 ease-mechanical hover:bg-surface"
      >
        <IconoCamara />
        <span className="font-medium text-text">Grabar o elegir de la galería</span>
        <span className="text-2xs uppercase tracking-widest text-text-dim">
          Duración máxima: 90 segundos
        </span>
      </button>

      <div className="mt-6 space-y-5">
        <Campo
          id="crear-titulo"
          label="Título"
          placeholder="Ej.: Mi mejor salto en caja"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          error={error}
        />

        <div>
          <label htmlFor="crear-categoria" className="mb-1.5 block text-sm font-medium text-text">
            Categoría
          </label>
          <select
            id="crear-categoria"
            defaultValue={CATEGORIAS[0].clave}
            className="min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:border-text focus:bg-raised"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Boton type="submit" variante="principal" disabled={publicado} className="mt-6 w-full py-4">
        {publicado ? "Publicado" : "Publicar"}
      </Boton>

      {publicado ? (
        <p className="mt-2 text-center text-sm text-ok" role="status">
          Vídeo publicado (maqueta)
        </p>
      ) : null}
    </form>
  );
}
