"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** Inclinación máxima, en grados (el encargo: «leve», hasta ~6°). */
const MAX_GRADOS = 6;

/**
 * PROFUNDIDAD SUTIL AL PASAR EL PUNTERO (rediseño de /inicio): la tarjeta se inclina un poco hacia el
 * cursor y un BRILLO especular lo sigue. Es lo único de la pieza que necesita JavaScript, y se queda en
 * poco: escribe cuatro variables CSS (`--df-inc-x/y`, `--df-brillo-x/y`); el resto lo hace `globals.css`
 * (`.df-inclinable`, `.df-brillo`).
 *
 * SE ENCIENDE SOLO SI TIENE SENTIDO, y se pregunta una vez al montar:
 *  - puntero FINO que puede pasar por encima (`(hover: hover) and (pointer: fine)`): en táctil no hay
 *    «pasar por encima», y la tarjeta se queda quieta;
 *  - sin `prefers-reduced-motion`: MARCA.md §7 — la regla global apaga lo que es CSS, pero lo que mueve
 *    JavaScript tiene que preguntar él;
 *  - sin Save-Data: la página marca `data-ahorro` cuando el navegador lo pide, y entonces nada se anima.
 *
 * La profundidad la da la LUMINOSIDAD (MARCA.md: `--df-void`/`surface`/`raised`), no una sombra: el CSS
 * sube la superficie y monta el glow de los tokens al pasar.
 */
export function Inclinable({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const puede =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      !el.closest("[data-ahorro]");
    if (!puede) return;
    el.dataset.inclina = "1";

    let marco = 0;
    const mover = (e: PointerEvent) => {
      cancelAnimationFrame(marco);
      marco = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width; // 0..1
        const y = (e.clientY - r.top) / r.height;
        el.style.setProperty("--df-inc-x", `${((0.5 - y) * 2 * MAX_GRADOS).toFixed(2)}deg`);
        el.style.setProperty("--df-inc-y", `${((x - 0.5) * 2 * MAX_GRADOS).toFixed(2)}deg`);
        el.style.setProperty("--df-brillo-x", `${(x * 100).toFixed(1)}%`);
        el.style.setProperty("--df-brillo-y", `${(y * 100).toFixed(1)}%`);
      });
    };
    const salir = () => {
      cancelAnimationFrame(marco);
      for (const v of ["--df-inc-x", "--df-inc-y"]) el.style.setProperty(v, "0deg");
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerleave", salir);
    return () => {
      cancelAnimationFrame(marco);
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerleave", salir);
    };
  }, []);

  return (
    <div ref={ref} className={`df-inclinable ${className}`}>
      {children}
      <span aria-hidden className="df-brillo" />
    </div>
  );
}
