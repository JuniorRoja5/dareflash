import type { InputHTMLAttributes } from "react";

/**
 * CAMPO — label REAL (no un placeholder haciendo de etiqueta). Estados: normal (filete),
 * enfocado (--df-raised + filete claro; el anillo de foco es global) y ERROR en --df-alarm. El
 * mensaje de error dice QUE paso y COMO se arregla, con la voz del brief: sin pedir perdon, sin
 * vaguedad. El placeholder es solo un ejemplo, nunca la etiqueta.
 */
export function Campo({
  id,
  label,
  error,
  className = "",
  ...props
}: {
  id: string;
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`min-h-[44px] w-full rounded-sm border bg-surface px-3.5 text-base text-text placeholder:text-text-dim focus:bg-raised ${
          error ? "border-alarm focus:border-alarm" : "border-line focus:border-text"
        }`}
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-alarm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
