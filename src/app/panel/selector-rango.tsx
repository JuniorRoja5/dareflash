"use client";

import { ETIQUETA_PRESET, PRESETS_EXPORT, type PresetExport } from "@/lib/rango-export";

/**
 * EL SELECTOR DE RANGO DE UNA EXPORTACIÓN. Lo montan los dos export del panel (monedero y
 * patrocinios), que antes bajaban siempre todo y obligaban a recortar en la hoja.
 *
 * ┌─ UNA SOLA PIEZA PARA LOS DOS ──────────────────────────────────────────────────────────────┐
 * │ Copiarlo sería tener dos sitios donde "último mes" puede querer decir cosas distintas. Las  │
 * │ etiquetas y los presets salen de `lib/rango-export`, que es el mismo módulo que usa el      │
 * │ servidor para RESOLVERLOS: la pantalla no calcula ninguna fecha. Lo único que viaja de un   │
 * │ preset es su nombre.                                                                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LOS CAMPOS DE FECHA SOLO APARECEN EN "Personalizado", y no están deshabilitados el resto del
 * tiempo: un campo gris al lado de una opción activa invita a pulsarlo y no hace nada.
 */
export function SelectorRango({
  preset,
  desde,
  hasta,
  onPreset,
  onDesde,
  onHasta,
  deshabilitado = false,
}: {
  preset: PresetExport;
  desde: string;
  hasta: string;
  onPreset: (p: PresetExport) => void;
  onDesde: (v: string) => void;
  onHasta: (v: string) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div data-selector-rango className="mt-4">
      <fieldset disabled={deshabilitado}>
        <legend className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
          Qué periodo
        </legend>

        <div role="group" className="mt-2 flex flex-wrap gap-2">
          {PRESETS_EXPORT.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={preset === p}
              onClick={() => onPreset(p)}
              className={`min-h-[34px] rounded-full border px-3 text-sm transition-colors duration-150 ease-mechanical disabled:opacity-40 ${
                preset === p
                  ? "border-action bg-action/10 font-medium text-text"
                  : "border-line text-text-dim hover:bg-raised hover:text-text"
              }`}
            >
              {ETIQUETA_PRESET[p]}
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-2xs tracking-widest text-text-dim uppercase">
              Desde
              <input
                type="date"
                value={desde}
                onChange={(e) => onDesde(e.target.value)}
                className="mt-1 block min-h-[34px] rounded-sm border border-line bg-surface px-2 text-sm text-text"
              />
            </label>
            <label className="text-2xs tracking-widest text-text-dim uppercase">
              Hasta
              <input
                type="date"
                value={hasta}
                onChange={(e) => onHasta(e.target.value)}
                className="mt-1 block min-h-[34px] rounded-sm border border-line bg-surface px-2 text-sm text-text"
              />
            </label>
            {/* El "hasta" INCLUYE ese día, y se dice: es la diferencia entre exportar marzo entero
                y dejarse el día 31, que nadie nota hasta que falta una fila en la factura. */}
            <p className="text-2xs text-text-dim">Las dos fechas entran en el rango.</p>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}
