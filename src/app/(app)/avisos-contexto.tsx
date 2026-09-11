"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import {
  NOTIF_NO_LEIDAS_TOPE,
  NOTIF_SONDEO_MIN_ENTRE_MS,
  NOTIF_SONDEO_MS,
} from "@/config/constants";
import { getJson } from "@/lib/cliente-http";
import { textoBadge } from "@/lib/notificaciones";

/**
 * CONTADOR DE AVISOS SIN LEER — fuente ÚNICA en el cliente.
 *
 * El número salía del servidor al pintar el layout y se quedaba quieto: la campana solo lo repedía al
 * abrirla. Un aviso que llegaba con la página abierta no movía nada, y como el usuario solo abre la
 * campana si ya sospecha algo, no se enteraba nunca.
 *
 * Ahora vive AQUÍ, en un proveedor montado por el armazón `(app)`, y lo leen todos los que lo pintan
 * —la campana de escritorio, el número del icono de Perfil en móvil, el botón de /perfil—: un solo
 * estado y un solo sondeo, no uno por componente que pudieran contradecirse.
 *
 *  - SEMBRADO del valor del servidor: la primera pintura ya lleva el número, sin esperar al sondeo.
 *  - REFRESCO en cliente: cada `NOTIF_SONDEO_MS` mientras la pestaña está VISIBLE, y al volver a ella
 *    (`visibilitychange`/`focus`). Oculta, no pide nada: ni batería ni base de datos en segundo plano.
 *  - SOLO CUENTA: pide `/api/notificaciones/no-leidas` (un COUNT), nunca la lista, y NUNCA marca nada
 *    como leído — eso pasa solo al abrir la campana o ver la página de avisos, que usan `fijar`.
 *  - Invitado (`activo = false`): ni una petición.
 */
interface EstadoAvisos {
  noLeidas: number;
  /** Lo usan quienes marcan leídas (campana, página): el servidor les devuelve cuántas quedan. */
  fijar: (n: number) => void;
}

const Contexto = createContext<EstadoAvisos | null>(null);

/** Estado de avisos, o un "cero inerte" fuera del proveedor (p. ej. en la guía de estilo). */
export function useNoLeidas(): EstadoAvisos {
  return useContext(Contexto) ?? { noLeidas: 0, fijar: () => undefined };
}

/**
 * El SONDEO. Un intervalo que solo corre con la pestaña visible, más un recuento inmediato al volver.
 * `NOTIF_SONDEO_MIN_ENTRE_MS` evita contar dos veces cuando `focus` y `visibilitychange` llegan juntos.
 * Un 401 (la sesión caducó) apaga el sondeo: seguir preguntando no va a cambiar la respuesta.
 */
function useSondeoNoLeidas(activo: boolean, fijar: (n: number) => void): void {
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    let apagado = false;
    // El valor sembrado por el servidor es de AHORA: no hace falta repetirlo nada más cargar.
    let ultimo = Date.now();
    let intervalo: ReturnType<typeof setInterval> | null = null;

    const parar = (): void => {
      if (intervalo !== null) clearInterval(intervalo);
      intervalo = null;
    };
    const contar = async (): Promise<void> => {
      ultimo = Date.now();
      try {
        const r = await getJson<{ noLeidas?: number }>("/api/notificaciones/no-leidas");
        if (!vigente) return;
        if (r.status === 401) {
          apagado = true;
          parar();
          return;
        }
        if (r.ok && typeof r.data.noLeidas === "number") fijar(r.data.noLeidas);
      } catch {
        /* sin red: el siguiente ciclo lo reintenta */
      }
    };
    const arrancar = (): void => {
      if (intervalo === null && !apagado)
        intervalo = setInterval(() => void contar(), NOTIF_SONDEO_MS);
    };
    const alVolver = (): void => {
      if (apagado || document.visibilityState !== "visible") return;
      if (Date.now() - ultimo >= NOTIF_SONDEO_MIN_ENTRE_MS) void contar();
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
  }, [activo, fijar]);
}

export function ProveedorAvisos({
  inicial,
  activo,
  children,
}: {
  /** No-leídas contadas por el servidor al pintar. */
  inicial: number;
  /** Hay sesión: solo entonces se sondea. */
  activo: boolean;
  children: ReactNode;
}) {
  const [noLeidas, setNoLeidas] = useState(inicial);
  // Si el servidor vuelve a pintar el layout con otro número (un `router.refresh()`), manda el suyo:
  // se ajusta el estado DURANTE el render, el patrón de React para "estado derivado de una prop que
  // cambia", en vez de un efecto que pintaría primero el valor viejo.
  const [semilla, setSemilla] = useState(inicial);
  if (semilla !== inicial) {
    setSemilla(inicial);
    setNoLeidas(inicial);
  }

  useSondeoNoLeidas(activo, setNoLeidas);

  const valor = useMemo(() => ({ noLeidas, fijar: setNoLeidas }), [noLeidas]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** El número de avisos sin leer como pastilla NEUTRA ("99+" pasado el tope); nada si no hay. */
export function BadgeAvisos({ className }: { className: string }) {
  const { noLeidas } = useNoLeidas();
  const texto = textoBadge(noLeidas, NOTIF_NO_LEIDAS_TOPE);
  return texto ? <span className={className}>{texto}</span> : null;
}
