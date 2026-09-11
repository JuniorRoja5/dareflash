"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { postJsonCsrf } from "@/lib/cliente-http";

/**
 * Marca como leídos los avisos que la página acaba de ENSEÑAR. Es una MUTACIÓN, así que va por POST con
 * CSRF desde el cliente, nunca en el GET que pinta la página (lo dispararía cualquier prefetch).
 *
 * Al terminar, `router.refresh()`: el badge de la campana y el del icono de Perfil los cuenta el
 * servidor al pintar el shell, y así bajan sin recargar. Si falla, no pasa nada visible: los avisos
 * siguen sin leer y se marcarán la próxima vez que se vean.
 */
export function MarcarLeidasAlVer({ ids }: { ids: string[] }) {
  const router = useRouter();
  // Clave estable del conjunto: el efecto no debe repetirse por recibir un array nuevo con los mismos ids.
  const clave = ids.join(",");

  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    postJsonCsrf("/api/notificaciones/leidas", { ids: clave.split(",") })
      .then((r) => {
        if (vigente && r.ok) router.refresh();
      })
      .catch(() => {
        /* sin red: se reintenta la próxima vez que se vean */
      });
    return () => {
      vigente = false;
    };
  }, [clave, router]);

  return null;
}
