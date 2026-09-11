"use client";

import { useEffect } from "react";

import { postJsonCsrf } from "@/lib/cliente-http";

import { useNoLeidas } from "../../avisos-contexto";

/**
 * Marca como leídos los avisos que la página acaba de ENSEÑAR. Es una MUTACIÓN, así que va por POST con
 * CSRF desde el cliente, nunca en el GET que pinta la página (lo dispararía cualquier prefetch).
 *
 * Lo que el servidor dice que queda sin leer va al contador COMPARTIDO (`fijar`): la campana y el icono
 * de Perfil bajan al momento, sin recargar nada. Antes esto hacía `router.refresh()`, que repintaba la
 * página con los avisos ya marcados y borraba el punto de "nuevo" antes de que se viera qué lo era.
 * Si falla, no pasa nada visible: los avisos siguen sin leer y se marcarán la próxima vez que se vean.
 */
export function MarcarLeidasAlVer({ ids }: { ids: string[] }) {
  const { fijar } = useNoLeidas();
  // Clave estable del conjunto: el efecto no debe repetirse por recibir un array nuevo con los mismos ids.
  const clave = ids.join(",");

  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    postJsonCsrf<{ noLeidas?: number }>("/api/notificaciones/leidas", { ids: clave.split(",") })
      .then((r) => {
        if (vigente && r.ok && typeof r.data.noLeidas === "number") fijar(r.data.noLeidas);
      })
      .catch(() => {
        /* sin red: se reintenta la próxima vez que se vean */
      });
    return () => {
      vigente = false;
    };
  }, [clave, fijar]);

  return null;
}
