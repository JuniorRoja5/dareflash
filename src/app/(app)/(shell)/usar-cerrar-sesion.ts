"use client";

import { useState } from "react";

import { postJsonCsrf } from "@/lib/cliente-http";
import { fraseDeError, motivoDeError } from "@/lib/mensajes-error";
import { useNavegarDuro } from "@/components/enlace";
import { useTextos } from "@/components/textos-provider";

/**
 * Hook de CERRAR SESIÓN, compartido por el desplegable de la barra (escritorio) y el botón de /perfil
 * (móvil). POST /api/auth/logout CON CSRF (misma vía que el resto de mutaciones con sesión) y, al
 * cerrar, navegación DURA a `/` (`navegarDuro`): re-resuelve el shell en el server SIN sesión y limpia
 * cualquier estado de cliente (no un router.push, que podría servir RSC cacheado con la sesión vieja).
 *
 * Si el token ya no vale (`SIN_SESION` al pedir el CSRF) es que la sesión ya no existe: se trata como
 * éxito y se redirige igual. Cualquier otro fallo muestra copy humano y deja reintentar.
 */
/**
 * Las frases del fallo al salir. Las pone quien monta el botón (P5b3): la app, de su diccionario
 * (`cuenta` + `errorComun`); el PANEL, que no se traduce, las suyas.
 */
export interface FrasesSalir {
  fallo: string;
  limite: string;
  ocupado: string;
}

export function useCerrarSesion(frases: FrasesSalir): {
  salir: () => Promise<void>;
  cargando: boolean;
  error: string;
} {
  const navegarDuro = useNavegarDuro();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function salir(): Promise<void> {
    if (cargando) return;
    setCargando(true);
    setError("");
    try {
      const res = await postJsonCsrf("/api/auth/logout", {});
      if (!res.ok) {
        setError(
          fraseDeError(motivoDeError(res.status, res.code), {
            limite: frases.limite,
            ocupado: frases.ocupado,
            validacion: frases.fallo,
            generico: frases.fallo,
          }),
        );
        setCargando(false);
        return;
      }
    } catch (e) {
      // `SIN_SESION` = ya no hay sesión que cerrar -> seguimos al redirect. Otro error -> mensaje.
      if (!(e instanceof Error && e.message === "SIN_SESION")) {
        setError(frases.fallo);
        setCargando(false);
        return;
      }
    }
    navegarDuro("/");
  }

  return { salir, cargando, error };
}

/** Las frases de la APP para `useCerrarSesion`, de su diccionario (`cuenta` + `errorComun`). */
export function useFrasesSalir(): FrasesSalir {
  const t = useTextos("cuenta");
  const te = useTextos("errorComun");
  return { fallo: t("errorSalir"), limite: te("limite"), ocupado: te("ocupado") };
}
