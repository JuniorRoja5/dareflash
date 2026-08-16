"use client";

/**
 * Pagina de DESBLOQUEO de cuenta — PROVISIONAL, NO es el inicio de la Fase 1. Funcional y SOBRIA a
 * proposito: sin identidad de marca (logo, paleta, tipografia) ni animaciones. La identidad visual
 * se decide en la Fase 1 y ESTA PAGINA SE REHARA ENTONCES. No tomarla por definitiva.
 *
 * Existe porque el correo de desbloqueo enlaza a `/unlock?token=...` y una pagina que falta es un
 * 404 en produccion (la leccion de `/verify`). NO enlaza a paginas inexistentes (no hay `/login`):
 * el usuario reactiva y se le dice, con TEXTO, que vuelva a intentar iniciar sesion.
 *
 * El token NO se consume en el GET: un BOTON hace POST a /api/auth/unlock. Deliberado: los escaneres
 * de correo hacen prefetch y consumirian el token de un solo uso antes del clic.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, Suspense, useState } from "react";

import { postJson } from "@/lib/cliente-http";

const CONTENEDOR: CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: "3rem 1.5rem",
  lineHeight: 1.5,
};

type Estado = "sin-token" | "listo" | "enviando" | "ok" | "error";

function UnlockContenido() {
  const token = useSearchParams().get("token");
  const [estado, setEstado] = useState<Estado>(token ? "listo" : "sin-token");
  const [mensaje, setMensaje] = useState("");

  async function desbloquear() {
    if (!token) return;
    setEstado("enviando");
    try {
      const r = await postJson("/api/auth/unlock", { token });
      const data: unknown = r.data;
      const msg = typeof data === "object" && data && "message" in data ? String(data.message) : "";
      if (r.ok) {
        setMensaje(msg || "Cuenta reactivada. Ya puedes intentar iniciar sesion de nuevo.");
        setEstado("ok");
      } else {
        // No se distingue "ya usado" de "invalido/caducado" (seria un oraculo). Se cubre con texto.
        setMensaje(msg || "El enlace de desbloqueo es invalido o ha caducado.");
        setEstado("error");
      }
    } catch {
      setMensaje("No se pudo conectar. Intentalo de nuevo mas tarde.");
      setEstado("error");
    }
  }

  return (
    <main style={CONTENEDOR}>
      <h1>Reactivar tu cuenta</h1>

      {estado === "sin-token" && (
        <p>Falta el token en el enlace. Abre el enlace completo del correo de desbloqueo.</p>
      )}

      {(estado === "listo" || estado === "enviando") && (
        <>
          <p>Tu cuenta se freno temporalmente por demasiados intentos. Pulsa para reactivarla.</p>
          <button type="button" onClick={desbloquear} disabled={estado === "enviando"}>
            {estado === "enviando" ? "Reactivando..." : "Reactivar mi cuenta"}
          </button>
        </>
      )}

      {estado === "ok" && (
        <>
          <p>{mensaje}</p>
          {/* No hay /login todavia: se dice con TEXTO que vuelva a intentar iniciar sesion. */}
          <p>Vuelve a intentar iniciar sesion.</p>
          <p>
            <Link href="/">Volver al inicio</Link>
          </p>
        </>
      )}

      {estado === "error" && (
        <>
          <p>{mensaje}</p>
          {/* El token es de UN SOLO USO y aqui el caso NORMAL es el enlace YA USADO: el dueño acaba
              de reactivar y, si recarga, cae aqui. No se puede distinguir "ya reactivado" de "token
              invalido" sin un oraculo, asi que se cubre con TEXTO (misma leccion que /verify). */}
          <p>
            Si ya has reactivado tu cuenta, este enlace deja de funcionar: vuelve a intentar iniciar
            sesion. Si el enlace ha caducado y sigues bloqueado, al intentarlo de nuevo te
            enviaremos uno nuevo.
          </p>
          <p>
            <Link href="/">Volver al inicio</Link>
          </p>
        </>
      )}
    </main>
  );
}

export default function UnlockPage() {
  // useSearchParams exige un limite de Suspense en el prerender estatico.
  return (
    <Suspense
      fallback={
        <main style={CONTENEDOR}>
          <p>Cargando...</p>
        </main>
      }
    >
      <UnlockContenido />
    </Suspense>
  );
}
