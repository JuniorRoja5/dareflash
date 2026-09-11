"use client";

import { type RefObject, useEffect } from "react";

/**
 * Cierre de un DESPLEGABLE de la barra: con clic fuera y con Escape. Lo comparten el menú de cuenta y
 * la campana de avisos; vivía escrito dentro del menú, y la campana lo habría tenido que copiar.
 *
 * `cerrar` debe ser ESTABLE (un `useCallback` o un setter): el efecto se vuelve a suscribir cuando
 * cambia, y una función nueva en cada render lo haría en cada pintado.
 */
export function useCerrarDesplegable(
  ref: RefObject<HTMLElement | null>,
  abierto: boolean,
  cerrar: () => void,
): void {
  useEffect(() => {
    if (!abierto) return;
    function alClicFuera(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    }
    function alTeclado(e: KeyboardEvent): void {
      if (e.key === "Escape") cerrar();
    }
    document.addEventListener("mousedown", alClicFuera);
    document.addEventListener("keydown", alTeclado);
    return () => {
      document.removeEventListener("mousedown", alClicFuera);
      document.removeEventListener("keydown", alTeclado);
    };
  }, [abierto, ref, cerrar]);
}
