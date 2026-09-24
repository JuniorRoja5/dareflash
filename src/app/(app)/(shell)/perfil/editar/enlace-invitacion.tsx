"use client";

import { useState } from "react";

/**
 * TU ENLACE DE INVITACIÓN. Se enseña el ENLACE ENTERO, no el código suelto: un código hay que
 * explicarlo ("pégalo al registrarte, en el campo que…"), y un enlace se comparte y ya está.
 *
 * SOLO LECTURA. No hay nada que guardar aquí: el código se generó con la cuenta y no cambia nunca —
 * vive en enlaces que la gente pega en redes, y rotarlo los rompería todos—. Por eso esto no es un
 * campo de formulario sino un valor con un botón de copiar.
 *
 * El botón es una comodidad; el enlace está visible y seleccionable, así que si el portapapeles
 * falla (permiso denegado, contexto no seguro) no se pierde nada: se dice y se puede copiar a mano.
 */
export function EnlaceInvitacion({ enlace }: { enlace: string }) {
  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);

  async function copiar(): Promise<void> {
    setFallo(false);
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setFallo(true);
    }
  }

  return (
    <section aria-labelledby="invitar-titulo" className="space-y-2">
      <h2 id="invitar-titulo" className="text-sm font-medium text-text">
        Invita a un amigo
      </h2>
      <p className="text-2xs text-text-dim">
        Cuando alguien se registre con tu enlace y verifique su correo, ganáis puntos los dos.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {/* `readOnly` y no `disabled`: deshabilitado no se puede seleccionar, y copiar a mano es
            justamente el plan B cuando el portapapeles no está disponible. */}
        <input
          type="text"
          value={enlace}
          readOnly
          aria-label="Tu enlace de invitación"
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-[40px] min-w-0 flex-1 rounded-sm border border-line bg-raised px-3 text-sm text-text-dim"
        />
        <button
          type="button"
          onClick={() => void copiar()}
          className="min-h-[40px] shrink-0 rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised"
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      {fallo ? (
        <p role="status" className="text-2xs text-text-dim">
          No hemos podido copiarlo. Selecciona el enlace y cópialo a mano.
        </p>
      ) : null}
    </section>
  );
}
