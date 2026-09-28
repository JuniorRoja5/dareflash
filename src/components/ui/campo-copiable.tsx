"use client";

import { useState } from "react";

import { Boton } from "./boton";

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
  principal,
}: {
  etiqueta: string;
  valor: string;
  /** Ata la etiqueta al campo. Debe ser único en la página si hay más de un campo. */
  id: string;
  /**
   * ¿Es LA acción de la pantalla? Entonces su botón va con relleno de `--df-action` y texto negro,
   * como cualquier acción principal del producto. Solo UNO por pantalla: en /referidos lo lleva el
   * enlace, que es lo que se comparte; el código va secundario porque es el plan B.
   */
  principal?: boolean;
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
          // 44 px, la misma altura que el botón: la primitiva `Boton` fija esa zona táctil y un
          // campo de 40 dejaría los dos desalineados por 4 px en toda la fila.
          className="min-h-[44px] min-w-0 flex-1 rounded-sm border border-line bg-raised px-3 font-mono text-sm text-text"
        />
        {/* LA PRIMITIVA, no unas clases a mano: `Boton` deriva su relleno y su color de texto de
            `botonTokens`, que es la fuente testeada del sistema (un relleno semántico lleva SIEMPRE
            texto negro). Escribirlas aquí habría sido un segundo mapa esperando a discrepar. */}
        <Boton
          variante={principal ? "principal" : "secundario"}
          onClick={() => void copiar()}
          className={`shrink-0 ${principal ? "shadow-[var(--df-cta-lift)]" : ""}`}
        >
          {/* El botón dice lo que pasó, no lo que se pidió: "Copiado" confirma sin un aviso aparte. */}
          {copiado ? "Copiado" : "Copiar"}
        </Boton>
      </div>
      {fallo ? (
        <p role="status" className="mt-1.5 text-2xs text-text-dim">
          No hemos podido copiarlo. Selecciónalo y cópialo a mano.
        </p>
      ) : null}
    </div>
  );
}
