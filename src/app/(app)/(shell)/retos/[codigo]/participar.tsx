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
}: {
  challengeId: string;
  publicCode: string;
  slug: string;
  autenticado: boolean;
  activo: boolean;
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

  return (
    <>
      <Boton
        variante="principal"
        className="w-full py-3.5"
        onClick={() =>
          autenticado ? setAbierto(true) : router.push(enlaceEntrarParaParticipar(publicCode, slug))
        }
      >
        Participar
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
