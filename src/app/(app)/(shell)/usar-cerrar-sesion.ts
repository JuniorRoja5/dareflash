"use client";

import { useState } from "react";

import { postJsonCsrf } from "@/lib/cliente-http";
import { mensajeError, MSG_LOGOUT } from "@/lib/mensajes-error";

/**
 * Hook de CERRAR SESIÓN, compartido por el desplegable de la barra (escritorio) y el botón de /perfil
 * (móvil). POST /api/auth/logout CON CSRF (misma vía que el resto de mutaciones con sesión) y, al
 * cerrar, navegación DURA a `/`: re-resuelve el shell en el server SIN sesión y limpia cualquier estado
 * de cliente (no un router.push, que podría servir RSC cacheado con la sesión vieja).
 *
 * Si el token ya no vale (`SIN_SESION` al pedir el CSRF) es que la sesión ya no existe: se trata como
 * éxito y se redirige igual. Cualquier otro fallo muestra copy humano y deja reintentar.
 */
export function useCerrarSesion(): {
  salir: () => Promise<void>;
  cargando: boolean;
  error: string;
} {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function salir(): Promise<void> {
    if (cargando) return;
    setCargando(true);
    setError("");
    try {
      const res = await postJsonCsrf("/api/auth/logout", {});
      if (!res.ok) {
        setError(mensajeError(res.status, res.code, MSG_LOGOUT));
        setCargando(false);
        return;
      }
    } catch (e) {
      // `SIN_SESION` = ya no hay sesión que cerrar -> seguimos al redirect. Otro error -> mensaje.
      if (!(e instanceof Error && e.message === "SIN_SESION")) {
        setError(MSG_LOGOUT.generico);
        setCargando(false);
        return;
      }
    }
    window.location.assign("/");
  }

  return { salir, cargando, error };
}
