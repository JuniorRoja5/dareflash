"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { useTextos } from "@/components/textos-provider";
import { Boton } from "@/components/ui/boton";
import { mensajeDe, postJson } from "@/lib/cliente-http";

const estiloDisplay = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

/**
 * Tarjeta de confirmación del cambio de correo. El token viaja en la URL pero NO se consume al
 * cargar: solo al pulsar. Un GET que consumiera el token lo quemaría con el prefetch del cliente de
 * correo, y el usuario llegaría a un enlace ya gastado.
 *
 * Al confirmar se revocan todas las sesiones (el correo es la identidad de acceso), así que el
 * destino natural es iniciar sesión con la dirección nueva — y eso es lo que ofrece.
 */
export function TarjetaCambioEmail() {
  const token = useSearchParams().get("token") ?? "";
  const t = useTextos("cambioEmail");
  const tf = useTextos("formAcceso");
  const [estado, setEstado] = useState<"listo" | "enviando" | "ok" | "error">("listo");
  const [mensaje, setMensaje] = useState("");

  async function confirmar(): Promise<void> {
    setEstado("enviando");
    try {
      const r = await postJson("/api/auth/confirmar-email", { token });
      if (r.ok) {
        setMensaje(t("hecho"));
        setEstado("ok");
        return;
      }
      setMensaje(mensajeDe(r.data) || t("noValido"));
      setEstado("error");
    } catch {
      setMensaje(t("sinConexion"));
      setEstado("error");
    }
  }

  return (
    <div className="df-rise relative w-full max-w-md overflow-hidden rounded-lg border border-line bg-surface p-8 shadow-[var(--df-shadow-lg)] sm:p-10">
      <h1 className="mb-1.5 text-3xl text-text" style={estiloDisplay}>
        {t("titulo")}
      </h1>

      {token === "" ? (
        <p className="mt-4 text-sm text-text-dim">{t("faltaToken")}</p>
      ) : estado === "ok" ? (
        <>
          <p role="status" className="mb-6 mt-1.5 text-sm text-ok">
            {mensaje}
          </p>
          <Boton
            href="/entrar"
            variante="principal"
            className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
          >
            {tf("iniciarSesion")}
          </Boton>
        </>
      ) : (
        <>
          <p className="mb-6 mt-1.5 text-sm text-text-dim">{t("pulsa")}</p>
          <Boton
            type="button"
            variante="principal"
            onClick={confirmar}
            disabled={estado === "enviando"}
            className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
          >
            {estado === "enviando" ? t("confirmando") : t("confirmar")}
          </Boton>
          {estado === "error" ? (
            <p role="status" className="mt-4 text-sm text-alarm">
              {mensaje}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
