"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { RELLENO_VIP } from "@/components/ui/logic";
import { CTA_RETO_PROXIMAMENTE, CTA_RETO_SOLO_VIP, MSG_RETO_SOLO_VIP } from "@/config/constants";
import type { FaseReto } from "@/lib/reto-ventana";
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
  fase = "cerrado",
  yaParticipa = false,
  avisoNivel = null,
  vetoVip = false,
}: {
  challengeId: string;
  publicCode: string;
  slug: string;
  autenticado: boolean;
  activo: boolean;
  /**
   * POR QUÉ no está activo. `activo` es un sí/no y el "no" tapaba dos cosas muy distintas: un reto
   * que ya cerró y uno que TODAVÍA NO HA ABIERTO. A los dos se les decía "Reto cerrado", que para
   * el segundo es sencillamente falso — y en el botón que existe para que la gente participe.
   */
  fase?: FaseReto;
  /** Si el usuario ya tiene una participación publicada, el CTA pasa a "Reemplazar" (conecta con 2b). */
  yaParticipa?: boolean;
  /**
   * Copy del veto por NIVEL, ya resuelto en el servidor con la regla compartida, o `null` si entra.
   * Llega hecho —no la clave del nivel— para que esta pantalla no tenga una segunda forma de decidir
   * quién puede: aquí solo se pinta. La autoridad es el endpoint, que vuelve a comprobarlo.
   */
  avisoNivel?: string | null;
  /**
   * El reto es EXCLUSIVO de VIP Mythic y quien mira no lo es. Lo resuelve el servidor por el
   * chokepoint (`esVipActivo`); aquí llega decidido, como el de nivel.
   */
  vetoVip?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  if (!activo) {
    return (
      <Boton variante="principal" disabled className="w-full py-3.5">
        {fase === "proximamente" ? CTA_RETO_PROXIMAMENTE : "Reto cerrado"}
      </Boton>
    );
  }

  // CANDADO POR NIVEL. El reto se ve entero —no se esconde a nadie—, pero el CTA dice por qué no se
  // puede y qué falta. Deshabilitado y con el motivo al lado: un botón que se pulsa y devuelve un
  // error del servidor es peor que uno que explica.
  //
  // VA ANTES QUE EL DEL VIP A PROPÓSITO, y el orden es el mismo que aplica el servidor: a quien le
  // faltan las DOS cosas se le dice la que no cuesta dinero. Al revés, le venderíamos una
  // suscripción para que se encontrara, nada más pagarla, con una pared que ya estaba ahí.
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

  // RETO EXCLUSIVO Y QUIEN MIRA NO ES VIP. Aquí el CTA NO se deshabilita: hay algo que hacer, y es
  // ir a /vip. Un botón muerto diría "no puedes" y se callaría lo único útil. En ORO y no en
  // `--df-action`, como toda puerta al VIP (ver `ACENTO_VIP`).
  if (vetoVip) {
    return (
      <>
        <Boton href="/vip" variante="fantasma" className="w-full py-3.5" style={RELLENO_VIP}>
          {CTA_RETO_SOLO_VIP}
        </Boton>
        <p role="status" className="mt-2 text-sm text-text-dim">
          {MSG_RETO_SOLO_VIP}
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
