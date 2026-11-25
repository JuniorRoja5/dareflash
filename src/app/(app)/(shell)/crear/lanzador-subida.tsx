"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useTextos } from "@/components/textos-provider";
import { Boton } from "@/components/ui/boton";

import { ModalSubida } from "./modal-subida";

/**
 * LANZADOR de la subida por libre (ruta /crear): un CTA que abre el `ModalSubida` reutilizable (sin
 * `challengeId` -> subida libre). Tras subir, refresca para que el vídeo aparezca cuando el worker lo
 * publique. El mismo modal lo reutilizan "Participar" (reto) y otras entradas.
 */
export function LanzadorSubida() {
  const router = useRouter();
  const t = useTextos("subida");
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Boton
        type="button"
        variante="principal"
        onClick={() => setAbierto(true)}
        className="w-full py-4"
      >
        {t("lanzar")}
      </Boton>
      {abierto ? (
        <ModalSubida onCerrar={() => setAbierto(false)} onSubido={() => router.refresh()} />
      ) : null}
    </>
  );
}
