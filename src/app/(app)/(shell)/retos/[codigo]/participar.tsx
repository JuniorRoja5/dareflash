"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { ModalSubida } from "@/app/(app)/(shell)/crear/modal-subida";

import { enlaceEntrarParaParticipar } from "../participar-logica";

/**
 * BOTÓN "Participar" del detalle del reto. Invitado -> a /entrar con `?siguiente=` al reto (vuelve tras
 * entrar). Logueado -> abre el `ModalSubida` reutilizable con el `challengeId` (participación). Si el
 * reto ya no está abierto, botón deshabilitado honesto. Tras subir, refresca (la participación aparece
 * cuando el worker publique el vídeo). La 1ª participación reserva el hueco (unique); si ya participó,
 * el modal gestiona el reemplazo.
 */
export function BotonParticipar({
  challengeId,
  publicCode,
  slug,
  autenticado,
  activo,
  yaParticipa = false,
  avisoNivel = null,
}: {
  challengeId: string;
  publicCode: string;
  slug: string;
  autenticado: boolean;
  activo: boolean;
  /** Si el usuario ya tiene una participación publicada, el CTA pasa a "Reemplazar" (conecta con 2b). */
  yaParticipa?: boolean;
  /**
   * Copy del veto por NIVEL, ya resuelto en el servidor con la regla compartida, o `null` si entra.
   * Llega hecho —no la clave del nivel— para que esta pantalla no tenga una segunda forma de decidir
   * quién puede: aquí solo se pinta. La autoridad es el endpoint, que vuelve a comprobarlo.
   */
  avisoNivel?: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  if (!activo) {
    return (
      <Boton variante="principal" disabled className="w-full py-3.5">
        Reto cerrado
      </Boton>
    );
  }

  // CANDADO POR NIVEL. El reto se ve entero —no se esconde a nadie—, pero el CTA dice por qué no se
  // puede y qué falta. Deshabilitado y con el motivo al lado: un botón que se pulsa y devuelve un
  // error del servidor es peor que uno que explica.
  if (avisoNivel) {
    return (
      <>
        <Boton variante="principal" disabled className="w-full py-3.5">
          Nivel insuficiente
        </Boton>
        <p role="status" className="mt-2 text-sm text-text-dim">
          {avisoNivel}
        </p>
      </>
    );
  }

  return (
    <>
      <Boton
        variante="principal"
        className="w-full py-3.5"
        onClick={() =>
          autenticado ? setAbierto(true) : router.push(enlaceEntrarParaParticipar(publicCode, slug))
        }
      >
        {yaParticipa ? "Reemplazar mi vídeo" : "Participar"}
      </Boton>
      {abierto ? (
        <ModalSubida
          challengeId={challengeId}
          onCerrar={() => setAbierto(false)}
          onSubido={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
