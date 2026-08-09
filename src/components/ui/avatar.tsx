const TAMANO = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl",
  xl: "h-20 w-20 text-2xl", // podio (puesto 1); aditivo, no cambia los usos existentes
} as const;
export type TamanoAvatar = keyof typeof TAMANO;

/**
 * AVATAR — radius-full. Placeholder por defecto: la inicial del nombre sobre --df-raised (sin foto
 * todavia; la carga real llega con los perfiles). Decorativo (aria-hidden): el nombre se muestra
 * aparte, no se anuncia dos veces.
 */
export function Avatar({ nombre, tamano = "md" }: { nombre: string; tamano?: TamanoAvatar }) {
  const inicial = (nombre.trim().charAt(0) || "?").toUpperCase();
  return (
    <span
      aria-hidden
      className={`inline-flex ${TAMANO[tamano]} shrink-0 items-center justify-center rounded-full bg-raised font-semibold text-text-dim`}
    >
      {inicial}
    </span>
  );
}
