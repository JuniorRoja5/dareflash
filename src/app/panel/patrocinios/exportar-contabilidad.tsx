"use client";

import { useState } from "react";

import { obtenerCsrfToken } from "@/lib/cliente-http";

type Tipo = "patrocinios" | "ganadores";

/**
 * DESCARGAR LOS CSV DE LA CONTABILIDAD. La interfaz de `POST /api/panel/patrocinios/export`.
 *
 * MISMO PATRÓN QUE EL DEL MONEDERO, y a propósito: el endpoint es POST con CSRF (con un GET, otra
 * página podría disparar la exportación de un admin con sesión y la auditoría dejaría de ser prueba
 * de quién sacó los datos), así que el fichero se arma aquí — `fetch` → blob → un `<a download>` que
 * se pulsa y se tira—. La URL del blob se revoca siempre, también si algo falla.
 *
 * NO LLEVA EL AVISO ROJO del monedero, y es deliberado: aquí no hay datos de pago en claro. Lo que
 * sale son nombres de usuario, importes ya cobrados y condiciones con marcas — sensible, auditado,
 * pero no un IBAN. Copiar el aviso de allí lo convertiría en ruido que nadie lee.
 */
export function ExportarContabilidad() {
  const [ocupado, setOcupado] = useState<Tipo | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function descargar(tipo: Tipo) {
    setOcupado(tipo);
    setAviso(null);
    let url: string | null = null;
    try {
      const csrfToken = await obtenerCsrfToken();
      const res = await fetch("/api/panel/patrocinios/export", {
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
      <h2 id="exportar" className="text-sm font-semibold text-text">
        Exportar a CSV
      </h2>
      <p className="mt-2 max-w-prose text-sm text-text-dim">
        Las dos salen completas (sin paginar) y con el total ya calculado, para cuadrar fuera. Cada
        descarga queda registrada con tu nombre.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["patrocinios", "Patrocinios (a facturar)"],
            ["ganadores", "Ganadores"],
          ] as const
        ).map(([tipo, etiqueta]) => (
          <button
            key={tipo}
            type="button"
            onClick={() => void descargar(tipo)}
            disabled={ocupado !== null}
            className="min-h-[36px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
          >
            {ocupado === tipo ? "Preparando…" : etiqueta}
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
