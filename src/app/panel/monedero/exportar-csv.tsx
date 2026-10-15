"use client";

import { useState } from "react";

import { obtenerCsrfToken } from "@/lib/cliente-http";

/**
 * DESCARGAR EL CSV. La interfaz de `POST /api/panel/monedero/export`.
 *
 * ┌─ POR QUÉ UN BOTÓN Y NO UN ENLACE ────────────────────────────────────────────────────────────┐
 * │ El endpoint es POST con CSRF a propósito (ver su docblock: con un GET, otra página podría     │
 * │ disparar la exportación de un admin con sesión y la auditoría dejaría de ser prueba de quién  │
 * │ sacó los IBANes). Un POST no se descarga solo, así que el fichero se arma aquí: `fetch` →     │
 * │ blob → un `<a download>` que se pulsa y se tira.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL AVISO ESTÁ ANTES DE LA DESCARGA, no después: lo que se baja lleva IBANes y direcciones en
 * claro, y eso hay que saberlo ANTES de tener el fichero en la carpeta de descargas.
 *
 * La URL del blob se REVOCA siempre, también si algo falla: es una referencia a datos de pago
 * viviendo en la memoria de la pestaña, y no hay razón para que sobreviva al clic.
 */
export function ExportarCsv() {
  const [ocupado, setOcupado] = useState<"retiradas" | "ajustes" | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function descargar(tipo: "retiradas" | "ajustes") {
    setOcupado(tipo);
    setAviso(null);
    let url: string | null = null;
    try {
      const csrfToken = await obtenerCsrfToken();
      const res = await fetch("/api/panel/monedero/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ tipo }),
      });
      if (!res.ok) {
        setAviso({ tipo: "error", texto: "No se ha podido exportar." });
        return;
      }
      const filas = res.headers.get("X-Filas") ?? "?";
      const truncada = res.headers.get("X-Truncada") === "true";
      const nombre =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        `${tipo}.csv`;

      url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();

      setAviso({
        tipo: "ok",
        texto: truncada
          ? `Descargadas ${filas} filas, que es el tope: hay más sin exportar.`
          : `Descargadas ${filas} filas.`,
      });
    } catch {
      setAviso({ tipo: "error", texto: "No hemos podido conectar. Inténtalo otra vez." });
    } finally {
      if (url) URL.revokeObjectURL(url);
      setOcupado(null);
    }
  }

  return (
    <section aria-labelledby="exportar" className="rounded-sm border border-line bg-surface/60 p-5">
      <h3 id="exportar" className="text-sm font-semibold text-text">
        Exportar a CSV
      </h3>

      {/* EL AVISO VA EN `--df-alarm`, que es el token del peligro: esto no es un "ojo", es un
          fichero con los datos bancarios de otras personas saliendo del servidor. */}
      <p className="mt-2 max-w-prose rounded-sm border border-alarm/40 bg-alarm/5 p-3 text-sm text-text-dim">
        <strong className="font-medium text-alarm">
          Este archivo contiene datos de pago en claro (IBAN, direcciones).
        </strong>{" "}
        Guárdalo con cuidado: no lo dejes en Descargas ni lo mandes por chat. Cada exportación queda
        registrada con tu nombre.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["retiradas", "Retiradas"],
            ["ajustes", "Ajustes manuales"],
          ] as const
        ).map(([tipo, etiqueta]) => (
          <button
            key={tipo}
            type="button"
            onClick={() => void descargar(tipo)}
            disabled={ocupado !== null}
            className="min-h-[36px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
          >
            {ocupado === tipo ? "Preparando…" : `Descargar ${etiqueta.toLowerCase()}`}
          </button>
        ))}
      </div>

      {aviso ? (
        <p
          role={aviso.tipo === "error" ? "alert" : "status"}
          className={`mt-3 text-sm ${aviso.tipo === "error" ? "text-alarm" : "text-text-dim"}`}
        >
          {aviso.texto}
        </p>
      ) : null}
    </section>
  );
}
