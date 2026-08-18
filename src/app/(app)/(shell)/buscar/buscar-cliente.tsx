"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { PildoraCategoria } from "@/components/ui/pildora";
import { PildoraFiltro } from "@/components/ui/pildora-filtro";
import { getJson } from "@/lib/cliente-http";
import { mensajeError, MSG_BUSCAR } from "@/lib/mensajes-error";
import type { PaginaBusqueda, RetoBusqueda, UsuarioBusqueda } from "@/server/services/buscar";

import { CATEGORIAS, nombreCategoria } from "../retos/retos-datos";
import { consultaValida, hrefCategoria, type TipoBusqueda, urlBuscar } from "./buscar-logica";

/** La `deadline` de un reto llega como string en el JSON de la respuesta. */
type RetoItem = Omit<RetoBusqueda, "deadline"> & { deadline: string };
type Item = UsuarioBusqueda | RetoItem;
type Tab = TipoBusqueda | "categorias";
/** Resultados + la CLAVE de la búsqueda a la que pertenecen (para mostrarlos solo si siguen frescos). */
interface Resultado {
  clave: string;
  items: Item[];
  cursor: string | null;
}

const DEBOUNCE_MS = 300;
const SIN_CONEXION = "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.";

/** Clave que identifica una búsqueda; "" = no hay que buscar (categorías o consulta corta). */
function claveDe(tab: Tab, q: string): string {
  return tab === "categorias" || !consultaValida(q) ? "" : `${tab}:${q.trim()}`;
}

/**
 * BUSCADOR (isla cliente) de /buscar. Pestañas Usuarios | Retos | Categorías. El input BUSCA con
 * DEBOUNCE desde 2 caracteres (misma cota que el endpoint). "Cargar más" pagina por KEYSET
 * (proximoCursor de A2). La pestaña Categorías NO consulta: enlaza a /retos filtrado. Un INVITADO puede
 * buscar; actuar sobre un resultado pasa por el gate existente. Guarda anti-carrera (`peticionRef`):
 * solo la última respuesta manda; y los resultados se muestran solo si su CLAVE == la búsqueda actual.
 */
export function BuscarCliente({
  qInicial = "",
  tipoInicial = "usuarios",
}: {
  qInicial?: string;
  tipoInicial?: Tab;
}) {
  const [q, setQ] = useState(qInicial);
  const [tab, setTab] = useState<Tab>(tipoInicial);
  const [res, setRes] = useState<Resultado>({ clave: "", items: [], cursor: null });
  const [estado, setEstado] = useState<"idle" | "buscando" | "cargando" | "error">("idle");
  const [error, setError] = useState("");
  const peticionRef = useRef(0);

  const claveActual = claveDe(tab, q);

  // Búsqueda con DEBOUNCE. El efecto NO hace setState síncrono: solo programa el fetch, cuyo callback
  // (asíncrono) actualiza el estado. Se re-arma en cada cambio de `q`/`tab` (cleanup cancela el previo).
  useEffect(() => {
    if (!claveActual) return;
    const termino = q.trim();
    const tipo = tab as TipoBusqueda;
    const id = ++peticionRef.current;
    const t = setTimeout(async () => {
      setEstado("buscando");
      try {
        const r = await getJson<PaginaBusqueda<Item>>(urlBuscar({ q: termino, tipo }));
        if (id !== peticionRef.current) return; // llegó tarde -> se descarta
        if (!r.ok) {
          setError(mensajeError(r.status, r.code, MSG_BUSCAR));
          setEstado("error");
          return;
        }
        setRes({ clave: claveActual, items: r.data.items, cursor: r.data.proximoCursor });
        setEstado("idle");
      } catch {
        if (id !== peticionRef.current) return;
        setError(SIN_CONEXION);
        setEstado("error");
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, tab, claveActual]);

  async function cargarMas(): Promise<void> {
    if (!res.cursor) return;
    const id = ++peticionRef.current;
    setEstado("cargando");
    try {
      const r = await getJson<PaginaBusqueda<Item>>(
        urlBuscar({ q: q.trim(), tipo: tab as TipoBusqueda, cursor: res.cursor }),
      );
      if (id !== peticionRef.current) return;
      if (!r.ok) {
        setError(mensajeError(r.status, r.code, MSG_BUSCAR));
        setEstado("error");
        return;
      }
      setRes((prev) => ({
        clave: prev.clave,
        items: [...prev.items, ...r.data.items],
        cursor: r.data.proximoCursor,
      }));
      setEstado("idle");
    } catch {
      if (id !== peticionRef.current) return;
      setError(SIN_CONEXION);
      setEstado("error");
    }
  }

  const cambiarTab = (t: Tab): void => {
    setTab(t);
    setError("");
  };
  const enCategorias = tab === "categorias";
  const frescos = res.clave === claveActual && claveActual !== "";

  return (
    <div className="space-y-6">
      {/* Pestañas (neutras, activo elevado — nunca magenta). */}
      <div role="tablist" aria-label="Tipo de búsqueda" className="flex gap-2">
        <PildoraFiltro activo={tab === "usuarios"} onClick={() => cambiarTab("usuarios")}>
          Usuarios
        </PildoraFiltro>
        <PildoraFiltro activo={tab === "retos"} onClick={() => cambiarTab("retos")}>
          Retos
        </PildoraFiltro>
        <PildoraFiltro activo={tab === "categorias"} onClick={() => cambiarTab("categorias")}>
          Categorías
        </PildoraFiltro>
      </div>

      {/* Input (oculto en Categorías, que no consulta). */}
      {!enCategorias ? (
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (error) setError("");
          }}
          placeholder={tab === "usuarios" ? "Buscar personas…" : "Buscar retos…"}
          aria-label="Buscar"
          autoComplete="off"
          className="min-h-[44px] w-full rounded-full border border-line bg-raised px-5 text-sm text-text placeholder:text-text-dim focus:border-text focus:outline-none"
        />
      ) : null}

      {/* CATEGORÍAS: chips que enlazan al feed de retos filtrado (reutiliza CATEGORIAS + /retos). */}
      {enCategorias ? (
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map((c) => (
            <Link
              key={c.clave}
              href={hrefCategoria(c.clave)}
              className="inline-flex min-h-[44px] items-center rounded-full border border-line px-4 text-sm text-text-dim transition-colors duration-150 ease-mechanical hover:bg-raised hover:text-text"
            >
              {c.nombre}
            </Link>
          ))}
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      ) : !consultaValida(q) ? (
        <p className="text-sm text-text-dim">Escribe al menos 2 caracteres para buscar.</p>
      ) : !frescos ? (
        <p className="text-sm text-text-dim">Buscando…</p>
      ) : res.items.length === 0 ? (
        <p className="rounded-sm border border-line bg-surface/40 p-6 text-center text-sm text-text-dim">
          Sin resultados para «{q.trim()}».
        </p>
      ) : (
        <>
          <ul role="list" className="space-y-2">
            {tab === "usuarios"
              ? (res.items as UsuarioBusqueda[]).map((u) => (
                  <li key={u.id}>
                    <Link
                      href={`/u/${u.username ?? ""}`}
                      className="df-rise flex items-center gap-3 rounded-sm border border-line bg-surface/60 p-3 shadow-[var(--df-shadow-sm)] transition-colors duration-150 ease-mechanical hover:bg-surface"
                    >
                      <Avatar
                        nombre={u.displayName ?? u.username ?? "?"}
                        imagen={u.image}
                        tamano="md"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-text">
                          @{u.username}
                        </span>
                        {u.displayName ? (
                          <span className="block truncate text-sm text-text-dim">
                            {u.displayName}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))
              : (res.items as RetoItem[]).map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/retos/${r.id}`}
                      className="df-rise flex flex-col gap-1 rounded-sm border border-line bg-surface/60 p-3 shadow-[var(--df-shadow-sm)] transition-colors duration-150 ease-mechanical hover:bg-surface"
                    >
                      <span className="truncate font-semibold text-text">{r.title}</span>
                      <span>
                        <PildoraCategoria>{nombreCategoria(r.category)}</PildoraCategoria>
                      </span>
                    </Link>
                  </li>
                ))}
          </ul>

          {res.cursor ? (
            <button
              type="button"
              onClick={cargarMas}
              disabled={estado === "cargando"}
              className="mx-auto block min-h-[44px] rounded-full border border-line px-5 text-sm text-text-dim transition-colors duration-150 ease-mechanical hover:bg-raised hover:text-text disabled:opacity-60"
            >
              {estado === "cargando" ? "Cargando…" : "Cargar más"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
