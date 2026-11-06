"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CIUDADES_AUTOCOMPLETAR } from "@/config/constants";
import { getJson } from "@/lib/cliente-http";

interface Opcion {
  id: number;
  etiqueta: string;
}

const CONTROL =
  "min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:bg-raised focus:border-text";

/**
 * ELEGIR LA CIUDAD DEL CATÁLOGO (Fase 9 · P6): el autocompletado de P5 (`/api/buscar?tipo=ciudades`),
 * acotado al país de la empresa. Por PREFIJO y ordenado por población, como el buscador: «Mede» encuentra
 * Medellín; la ciudad que casi siempre se busca sale primera; y la etiqueta dice «ciudad, región, país»
 * para que los veinte «Santiago» no se confundan.
 *
 * Un combobox ARIA sencillo: flechas para moverse, Enter para elegir, Escape para cerrar. Lo que se
 * envía es el id (`onElegir`), nunca el texto: el texto solo sirve para encontrarla.
 */
export function BuscadorCiudad({
  pais,
  elegida,
  onElegir,
}: {
  pais: string;
  elegida: Opcion | null;
  onElegir: (o: Opcion | null) => void;
}) {
  const id = useId();
  const [texto, setTexto] = useState(elegida?.etiqueta ?? "");
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(0);
  const [estado, setEstado] = useState<"quieto" | "buscando" | "error">("quieto");
  const ultima = useRef(0);

  // ¿Hay algo que buscar? Se DERIVA del texto: si no, ni se pinta la lista ni se lanza la consulta (el
  // efecto no escribe estado de forma síncrona; solo desde la respuesta).
  const consulta = texto.trim();
  const buscable = consulta.length >= 2 && !(elegida && consulta === elegida.etiqueta);
  const visibles = buscable ? opciones : [];

  useEffect(() => {
    if (!buscable) return;
    const q = consulta;
    const n = ++ultima.current;
    // Un respiro entre teclas: cada pulsación no es una consulta (el endpoint además lleva rate-limit).
    const t = setTimeout(async () => {
      setEstado("buscando");
      const r = await getJson<{ items: Opcion[] }>(
        `/api/buscar?tipo=ciudades&limite=${CIUDADES_AUTOCOMPLETAR}&pais=${encodeURIComponent(pais)}&q=${encodeURIComponent(q)}`,
      );
      if (n !== ultima.current) return; // llegó tarde: ya hay otra búsqueda más nueva
      if (!r.ok) {
        setEstado("error");
        setOpciones([]);
        return;
      }
      setEstado("quieto");
      setOpciones(r.data.items);
      setActiva(0);
      setAbierta(true);
    }, 250);
    return () => clearTimeout(t);
  }, [buscable, consulta, pais]);

  function elegir(o: Opcion) {
    onElegir(o);
    setTexto(o.etiqueta);
    setAbierta(false);
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text">
        Ciudad
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={abierta && visibles.length > 0}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={
          abierta && visibles[activa] ? `${id}-${visibles[activa].id}` : undefined
        }
        autoComplete="off"
        className={CONTROL}
        value={texto}
        placeholder="Escribe el nombre de la ciudad"
        onChange={(e) => {
          setTexto(e.target.value);
          if (elegida) onElegir(null);
        }}
        onKeyDown={(e) => {
          if (!abierta || visibles.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiva((a) => Math.min(a + 1, visibles.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiva((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const o = visibles[activa];
            if (o) elegir(o);
          } else if (e.key === "Escape") {
            setAbierta(false);
          }
        }}
        onBlur={() => setTimeout(() => setAbierta(false), 150)}
      />
      {abierta && visibles.length > 0 ? (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-sm border border-line bg-surface shadow-[var(--df-shadow-md)]"
        >
          {visibles.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-${o.id}`}
              role="option"
              aria-selected={i === activa}
              className={`flex min-h-[44px] cursor-pointer items-center px-3.5 text-sm text-text ${
                i === activa ? "bg-raised" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(o);
              }}
            >
              {o.etiqueta}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1.5 text-2xs text-text-dim" aria-live="polite">
        {estado === "buscando"
          ? "Buscando…"
          : estado === "error"
            ? "No hemos podido buscar. Inténtalo otra vez."
            : abierta && visibles.length === 0 && texto.trim().length >= 2 && !elegida
              ? "No encontramos esa ciudad en tu país."
              : elegida
                ? "Se verá en esta ciudad y en las que están a menos de 100 km."
                : "Ciudades de más de 15.000 habitantes de tu país."}
      </p>
    </div>
  );
}
