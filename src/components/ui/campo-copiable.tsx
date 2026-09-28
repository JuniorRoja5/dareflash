"use client";

import { useState } from "react";

/**
 * UN VALOR CON BOTÓN DE COPIAR. Nace de `EnlaceInvitacion`, que hacía esto mismo para el enlace y
 * nada más; al separar /referidos en código y enlace hacían falta dos, y dos copias del mismo
 * `navigator.clipboard` con su `try/catch` y su temporizador se desincronizan en cuanto se toque una.
 *
 * SOLO LECTURA. Aquí no hay nada que guardar: ni el código ni el enlace se editan —el código se generó
 * con la cuenta y no cambia nunca, porque vive en enlaces que la gente ya ha pegado por ahí—. Es un
 * valor que se enseña, no un campo de formulario.
 *
 * `readOnly` y NO `disabled`: un campo deshabilitado no se puede ni seleccionar, y seleccionar y
 * copiar a mano es justamente el plan B cuando el portapapeles no está (permiso denegado, contexto no
 * seguro, navegador viejo). El botón es la comodidad; el valor a la vista es la garantía.
 */
export function CampoCopiable({
  etiqueta,
  valor,
  id,
}: {
  etiqueta: string;
  valor: string;
  /** Ata la etiqueta al campo. Debe ser único en la página si hay más de un campo. */
  id: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);

  async function copiar(): Promise<void> {
    setFallo(false);
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setFallo(true);
    }
  }

  return (
    <div>
      <label htmlFor={id} className="block text-2xs tracking-widest text-text-dim uppercase">
        {etiqueta}
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="text"
          value={valor}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-[40px] min-w-0 flex-1 rounded-sm border border-line bg-raised px-3 font-mono text-sm text-text"
        />
        <button
          type="button"
          onClick={() => void copiar()}
          className="min-h-[40px] shrink-0 rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised"
        >
          {/* El botón dice lo que pasó, no lo que se pidió: "Copiado" confirma sin un aviso aparte. */}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      {fallo ? (
        <p role="status" className="mt-1.5 text-2xs text-text-dim">
          No hemos podido copiarlo. Selecciónalo y cópialo a mano.
        </p>
      ) : null}
    </div>
  );
}
