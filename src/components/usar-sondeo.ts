import { useEffect, useRef } from "react";

/**
 * SONDEO CON LA PESTAÑA A LA VISTA — el patrón del número de avisos, compartido. Lo usan el badge de
 * avisos y el progreso de los anuncios del panel: un solo sitio con las reglas, no dos copias que
 * acaben diciendo cosas distintas.
 *
 *  - `tarea` corre cada `intervaloMs` mientras la pestaña está VISIBLE. Oculta, no pide nada: ni
 *    batería ni base de datos en segundo plano.
 *  - Al VOLVER a la pestaña (`visibilitychange`/`focus`) corre en el acto si han pasado al menos
 *    `minEntreMs` desde la última vez (los dos eventos suelen llegar juntos: no se pide dos veces).
 *  - NO corre al montar: lo que ya se pinta viene del servidor y es de AHORA.
 *  - `activo = false`: ni una petición, y si lo estaba, se apaga.
 *  - Si `tarea` devuelve `false` (un 401, un 403: seguir preguntando no va a cambiar la respuesta), se
 *    APAGA hasta que `activo` vuelva a cambiar.
 *  - Un fallo de red se traga: el ciclo siguiente lo reintenta.
 */
export function useSondeoVisible(opciones: {
  activo: boolean;
  intervaloMs: number;
  minEntreMs: number;
  /** Lo que hace cada ciclo. Devuelve `false` para apagar el sondeo. */
  tarea: () => Promise<boolean | void>;
}): void {
  const { activo, intervaloMs, minEntreMs } = opciones;
  // La tarea del ÚLTIMO render (lleva dentro el estado actual), sin reiniciar el intervalo por ella.
  const tarea = useRef(opciones.tarea);
  useEffect(() => {
    tarea.current = opciones.tarea;
  });

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    let apagado = false;
    let ultimo = Date.now();
    let intervalo: ReturnType<typeof setInterval> | null = null;

    const parar = (): void => {
      if (intervalo !== null) clearInterval(intervalo);
      intervalo = null;
    };
    const correr = async (): Promise<void> => {
      ultimo = Date.now();
      try {
        const seguir = await tarea.current();
        if (vigente && seguir === false) {
          apagado = true;
          parar();
        }
      } catch {
        /* sin red: el siguiente ciclo lo reintenta */
      }
    };
    const arrancar = (): void => {
      if (intervalo === null && !apagado) intervalo = setInterval(() => void correr(), intervaloMs);
    };
    const alVolver = (): void => {
      if (apagado || document.visibilityState !== "visible") return;
      if (Date.now() - ultimo >= minEntreMs) void correr();
      arrancar();
    };
    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === "visible") alVolver();
      else parar();
    };

    if (document.visibilityState === "visible") arrancar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("focus", alVolver);
    return () => {
      vigente = false;
      parar();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("focus", alVolver);
    };
  }, [activo, intervaloMs, minEntreMs]);
}
