import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * CAMPO — label REAL (no un placeholder haciendo de etiqueta). Estados: normal (filete),
 * enfocado (--df-raised + filete claro; el anillo de foco es global) y ERROR en --df-alarm. El
 * mensaje de error dice QUE paso y COMO se arregla, con la voz del brief: sin pedir perdon, sin
 * vaguedad. El placeholder es solo un ejemplo, nunca la etiqueta.
 *
 * `adorno` (opcional) = un control al final del campo, DENTRO del recuadro (p. ej. el botón
 * mostrar/ocultar de una contraseña). Por defecto no hay: el campo queda EXACTAMENTE como antes.
 */
export function Campo({
  id,
  label,
  error,
  adorno,
  className = "",
  ...props
}: {
  id: string;
  label: string;
  error?: string;
  adorno?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={`min-h-[44px] w-full rounded-sm border bg-surface px-3.5 text-base text-text placeholder:text-text-dim focus:bg-raised ${
            adorno ? "pr-12" : ""
          } ${error ? "border-alarm focus:border-alarm" : "border-line focus:border-text"}`}
          {...props}
        />
        {adorno ? (
          <div className="absolute inset-y-0 right-1.5 flex items-center">{adorno}</div>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-alarm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
