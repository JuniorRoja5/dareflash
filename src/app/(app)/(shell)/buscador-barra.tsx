"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { PildoraCategoria } from "@/components/ui/pildora";
import { BUSCAR_SUGERENCIAS_LIMITE } from "@/config/constants";
import { getJson } from "@/lib/cliente-http";
import { mostrarHandleSecundario, nombreMostrado } from "@/lib/identidad";
import type { PaginaBusqueda, RetoBusqueda, UsuarioBusqueda } from "@/server/services/buscar";

import { nombreCategoria } from "./retos/retos-datos";
import {
  construirSugerencias,
  destinoSugerencia,
  hrefBuscarTodos,
  type Sugerencia,
} from "./sugerencias-logica";

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2; // coherente con el `min 2` del endpoint (P3 soporta 1, pero la API pública pide 2)

function IconoLupa() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function urlSugerencias(termino: string, tipo: "usuarios" | "retos"): string {
  const p = new URLSearchParams({
    q: termino,
    tipo,
    limite: String(BUSCAR_SUGERENCIAS_LIMITE),
  });
  return `/api/buscar?${p.toString()}`;
}

/** Sugerencias + la CLAVE (término) al que pertenecen: solo se muestran si siguen frescas. */
interface ResultadoSug {
  clave: string;
  items: Sugerencia[];
}

/**
 * BUSCADOR de la barra superior (escritorio) con DESPLEGABLE de sugerencias (tipo TikTok/YouTube).
 * Al escribir (debounce, desde MIN_CHARS) llama a /api/buscar para usuarios Y retos (límite pequeño) y
 * muestra un combobox. Elegir una sugerencia navega; Enter/"ver todos" -> /buscar. Guarda anti-carrera
 * (id de petición: solo la última respuesta manda). a11y combobox/listbox: aria-expanded/-controls/
 * -activedescendant, ↑↓ mueven, Enter elige, Esc cierra. El <form action="/buscar"> deja el Enter sin
 * JS funcionando (mejora progresiva).
 */
export function BuscadorBarra() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultado, setResultado] = useState<ResultadoSug>({ clave: "", items: [] });
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1); // índice resaltado (aria-activedescendant); -1 = ninguno
  const peticionRef = useRef(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const termino = q.trim();
  const consultar = termino.length >= MIN_CHARS;
  // Solo se muestran las sugerencias que pertenecen a la consulta ACTUAL (evita mostrar las de un
  // término ya cambiado, y NO obliga a hacer setState síncrono en el efecto).
  const items = resultado.clave === termino && consultar ? resultado.items : [];

  // Búsqueda con DEBOUNCE (2 peticiones en paralelo: usuarios + retos). El efecto NO hace setState
  // síncrono: solo programa el fetch, cuyo callback (asíncrono) actualiza el estado si sigue siendo la última.
  useEffect(() => {
    if (!consultar) return;
    const id = ++peticionRef.current;
    const t = setTimeout(async () => {
      try {
        const [ru, rr] = await Promise.all([
          getJson<PaginaBusqueda<UsuarioBusqueda>>(urlSugerencias(termino, "usuarios")),
          getJson<PaginaBusqueda<RetoBusqueda>>(urlSugerencias(termino, "retos")),
        ]);
        if (id !== peticionRef.current) return; // llegó tarde -> se descarta
        const us = ru.ok ? ru.data.items : [];
        const rs = rr.ok ? rr.data.items : [];
        setResultado({ clave: termino, items: construirSugerencias(us, rs) });
        setActivo(-1);
        setAbierto(true);
      } catch {
        if (id !== peticionRef.current) return;
        setResultado({ clave: termino, items: [] });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [termino, consultar]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent): void {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function irA(destino: string): void {
    setAbierto(false);
    setActivo(-1);
    router.push(destino);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Escape") {
      setAbierto(false);
      setActivo(-1);
      return;
    }
    if (!abierto || items.length === 0) return; // Enter sin sugerencias: lo maneja el submit del form
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && activo >= 0) {
      e.preventDefault(); // hay opción activa -> navega a ella (si no, el form va a /buscar)
      const s = items[activo];
      if (s) irA(destinoSugerencia(s));
    }
  }

  const mostrarLista = abierto && items.length > 0;

  return (
    <div ref={contenedorRef} className="relative w-full max-w-md">
      <form action="/buscar" role="search" onSubmit={() => setAbierto(false)}>
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-dim">
          <IconoLupa />
        </span>
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (consultar && items.length > 0) setAbierto(true);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activo >= 0 ? `${listboxId}-opt-${activo}` : undefined}
          placeholder="Buscar retos, personas…"
          aria-label="Buscar"
          autoComplete="off"
          className="min-h-[44px] w-full rounded-full border border-line bg-raised pr-4 pl-11 text-sm text-text placeholder:text-text-dim focus:border-text focus:outline-none"
        />
      </form>

      {mostrarLista ? (
        <ul
          role="listbox"
          id={listboxId}
          aria-label="Sugerencias"
          className="absolute top-full right-0 left-0 z-40 mt-2 overflow-hidden rounded-sm border border-line bg-surface py-1 shadow-[var(--df-shadow-md)]"
        >
          {items.map((s, i) => (
            <li
              key={`${s.tipo}-${s.id}`}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === activo}
              onMouseEnter={() => setActivo(i)}
              onMouseDown={(e) => e.preventDefault()} // no robar el foco antes del click
              onClick={() => irA(destinoSugerencia(s))}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                i === activo ? "bg-raised" : ""
              }`}
            >
              {s.tipo === "usuario" ? (
                <>
                  <Avatar
                    nombre={nombreMostrado(s.displayName, s.username)}
                    imagen={s.image}
                    tamano="sm"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-text">
                      {mostrarHandleSecundario(s.displayName)
                        ? nombreMostrado(s.displayName, s.username)
                        : `@${s.username}`}
                    </span>
                    {mostrarHandleSecundario(s.displayName) ? (
                      <span className="block truncate text-xs text-text-dim">@{s.username}</span>
                    ) : null}
                  </span>
                </>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-text">{s.title}</span>
                  <PildoraCategoria>{nombreCategoria(s.category)}</PildoraCategoria>
                </span>
              )}
            </li>
          ))}
          <li className="border-t border-line">
            <Link
              href={hrefBuscarTodos(termino)}
              onClick={() => setAbierto(false)}
              className="block px-3 py-2 text-sm font-medium text-text-dim hover:text-text"
            >
              Ver todos los resultados de «{termino}»
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
