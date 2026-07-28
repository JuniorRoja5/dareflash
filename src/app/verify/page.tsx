"use client";

/**
 * Pagina de verificacion de email — PROVISIONAL del Paso 6, NO es el inicio de la Fase 1.
 *
 * Existe porque el correo de verificacion enlaza a `/verify?token=...` y esa pagina faltaba
 * (el usuario recibia un 404 y la cuenta nunca se verificaba). Es funcional y SOBRIA a
 * proposito: sin identidad de marca (logo, paleta, tipografia) ni animaciones. La identidad
 * visual se decide en la Fase 1 y ESTA PAGINA SE REHARA ENTONCES. No tomarla por definitiva.
 *
 * El token NO se consume en el GET: se muestra un BOTON que hace POST a /api/auth/verify. Es
 * deliberado (decision de la Pieza 3): los escaneres de correo hacen prefetch de los enlaces y
 * consumirian un token de un solo uso antes de que el usuario pulse.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, type FormEvent, Suspense, useState } from "react";

const CONTENEDOR: CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: "3rem 1.5rem",
  lineHeight: 1.5,
};

type Estado = "sin-token" | "listo" | "enviando" | "ok" | "error";

function VerifyContenido() {
  const token = useSearchParams().get("token");
  const [estado, setEstado] = useState<Estado>(token ? "listo" : "sin-token");
  const [mensaje, setMensaje] = useState("");

  async function verificar() {
    if (!token) return;
    setEstado("enviando");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      const msg = typeof data === "object" && data && "message" in data ? String(data.message) : "";
      if (res.ok) {
        setMensaje(msg || "Cuenta verificada. Ya puedes iniciar sesion.");
        setEstado("ok");
      } else {
        setMensaje(msg || "El enlace de verificacion es invalido o ha caducado.");
        setEstado("error");
      }
    } catch {
      setMensaje("No se pudo conectar. Intentalo de nuevo mas tarde.");
      setEstado("error");
    }
  }

  return (
    <main style={CONTENEDOR}>
      <h1>Verificar tu cuenta</h1>

      {estado === "sin-token" && (
        <p>Falta el token en el enlace. Abre el enlace completo del correo de verificacion.</p>
      )}

      {(estado === "listo" || estado === "enviando") && (
        <>
          <p>Pulsa el boton para confirmar tu direccion de correo.</p>
          <button type="button" onClick={verificar} disabled={estado === "enviando"}>
            {estado === "enviando" ? "Verificando..." : "Verificar mi cuenta"}
          </button>
        </>
      )}

      {estado === "ok" && (
        <>
          <p>{mensaje}</p>
          <p>
            <Link href="/">Volver al inicio</Link>
          </p>
        </>
      )}

      {estado === "error" && (
        <>
          <p>{mensaje}</p>
          <Reenviar />
        </>
      )}
    </main>
  );
}

/** Reenvio del correo de verificacion (enlace caducado/invalido). Pide el email porque el token
 *  ya no sirve para identificar la cuenta. Respuesta uniforme (sin enumeracion), como el endpoint. */
function Reenviar() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);

  async function reenviar(e: FormEvent) {
    e.preventDefault();
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setEnviado(true); // respuesta uniforme: no revela si la cuenta existe
    }
  }

  if (enviado) return <p>Si corresponde, te hemos reenviado el correo de verificacion.</p>;

  return (
    <form onSubmit={reenviar} style={{ marginTop: "1rem", display: "grid", gap: "0.5rem" }}>
      <label htmlFor="email">Reenviar el correo de verificacion:</label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        placeholder="tu@correo.com"
      />
      <button type="submit">Reenviar</button>
    </form>
  );
}

export default function VerifyPage() {
  // useSearchParams exige un limite de Suspense en el prerender estatico.
  return (
    <Suspense
      fallback={
        <main style={CONTENEDOR}>
          <p>Cargando...</p>
        </main>
      }
    >
      <VerifyContenido />
    </Suspense>
  );
}
