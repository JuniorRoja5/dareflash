"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

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
  const [estado, setEstado] = useState<"listo" | "enviando" | "ok" | "error">("listo");
  const [mensaje, setMensaje] = useState("");

  async function confirmar(): Promise<void> {
    setEstado("enviando");
    try {
      const r = await postJson("/api/auth/confirmar-email", { token });
      if (r.ok) {
        setMensaje("Correo actualizado. Vuelve a iniciar sesión con tu nueva dirección.");
        setEstado("ok");
        return;
      }
      setMensaje(mensajeDe(r.data) || "Este enlace ya no es válido.");
      setEstado("error");
    } catch {
      setMensaje("No hemos podido conectar. Inténtalo de nuevo.");
      setEstado("error");
    }
  }

  return (
    <div className="df-rise relative w-full max-w-md overflow-hidden rounded-lg border border-line bg-surface p-8 shadow-[var(--df-shadow-lg)] sm:p-10">
      <h1 className="mb-1.5 text-3xl text-text" style={estiloDisplay}>
        Confirmar tu correo
      </h1>

      {token === "" ? (
        <p className="mt-4 text-sm text-text-dim">
          Falta el token en el enlace. Ábrelo completo desde el correo que te hemos enviado.
        </p>
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
            Iniciar sesión
          </Boton>
        </>
      ) : (
        <>
          <p className="mb-6 mt-1.5 text-sm text-text-dim">
            Pulsa para confirmar que esta dirección es tuya. Al hacerlo se cerrarán tus sesiones
            abiertas.
          </p>
          <Boton
            type="button"
            variante="principal"
            onClick={confirmar}
            disabled={estado === "enviando"}
            className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
          >
            {estado === "enviando" ? "Confirmando…" : "Confirmar mi correo"}
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
