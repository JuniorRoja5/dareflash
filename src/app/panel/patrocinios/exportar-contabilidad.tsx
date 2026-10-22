"use client";

import { useState } from "react";

import { obtenerCsrfToken } from "@/lib/cliente-http";
import { ETIQUETA_PRESET, type PresetExport } from "@/lib/rango-export";

import { SelectorRango } from "../selector-rango";

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
  const [preset, setPreset] = useState<PresetExport>("mes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

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
        // El preset viaja por su NOMBRE: las fechas las calcula el servidor. Y `desde`/`hasta`
        // solo se mandan cuando significan algo.
        body: JSON.stringify(
          preset === "custom" ? { tipo, preset, desde, hasta } : { tipo, preset },
        ),
      });
      if (!res.ok) {
        // EL MOTIVO DEL SERVIDOR, cuando lo hay: un rango al revés tiene que decir que está al
        // revés, no "no se ha podido exportar" — si no, el admin prueba lo mismo otra vez.
        const motivo = await res
          .json()
          .then((j: { error?: { message?: string } }) => j.error?.message)
          .catch(() => undefined);
        setAviso({ tipo: "error", texto: motivo ?? "No se ha podido exportar." });
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

      // EL PERIODO VA EN EL AVISO: "descargadas 0 filas" sin él parece un fallo, y casi siempre
      // es que el rango elegido no tiene nada.
      const periodo = ETIQUETA_PRESET[preset].toLowerCase();
      setAviso({
        tipo: "ok",
        texto: truncada
          ? `Descargadas ${filas} filas (${periodo}), que es el tope: hay más sin exportar.`
          : `Descargadas ${filas} filas (${periodo}).`,
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
        Salen sin paginar y con el total ya calculado, para cuadrar fuera. Elige el periodo: solo se
        exporta lo que cae dentro. Cada descarga queda registrada con tu nombre y su rango.
      </p>

      <SelectorRango
        preset={preset}
        desde={desde}
        hasta={hasta}
        onPreset={setPreset}
        onDesde={setDesde}
        onHasta={setHasta}
        deshabilitado={ocupado !== null}
      />

      <div className="mt-4 flex flex-wrap gap-2">
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
