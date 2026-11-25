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
import { Enlace } from "@/components/enlace";
import { useSearchParams } from "next/navigation";
import { type CSSProperties, Suspense, useState } from "react";

import { useTextos } from "@/components/textos-provider";
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
  const t = useTextos("desbloquear");
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
        setMensaje(msg || t("hecho"));
        setEstado("ok");
      } else {
        // No se distingue "ya usado" de "invalido/caducado" (seria un oraculo). Se cubre con texto.
        setMensaje(msg || t("error"));
        setEstado("error");
      }
    } catch {
      setMensaje(t("sinConexion"));
      setEstado("error");
    }
  }

  return (
    <main style={CONTENEDOR}>
      <h1>{t("titulo")}</h1>

      {estado === "sin-token" && <p>{t("faltaToken")}</p>}

      {(estado === "listo" || estado === "enviando") && (
        <>
          <p>{t("frenada")}</p>
          <button type="button" onClick={desbloquear} disabled={estado === "enviando"}>
            {estado === "enviando" ? t("reactivando") : t("reactivar")}
          </button>
        </>
      )}

      {estado === "ok" && (
        <>
          <p>{mensaje}</p>
          {/* No hay /login todavia: se dice con TEXTO que vuelva a intentar iniciar sesion. */}
          <p>{t("vuelveAIntentar")}</p>
          <p>
            <Enlace href="/">{t("volverInicio")}</Enlace>
          </p>
        </>
      )}

      {estado === "error" && (
        <>
          <p>{mensaje}</p>
          {/* El token es de UN SOLO USO y aqui el caso NORMAL es el enlace YA USADO: el dueño acaba
              de reactivar y, si recarga, cae aqui. No se puede distinguir "ya reactivado" de "token
              invalido" sin un oraculo, asi que se cubre con TEXTO (misma leccion que /verify). */}
          <p>{t("yaUsado")}</p>
          <p>
            <Enlace href="/">{t("volverInicio")}</Enlace>
          </p>
        </>
      )}
    </main>
  );
}

/** El contenido de /unlock (la página, de servidor, le pone sus textos). */
export function Desbloqueo() {
  const t = useTextos("desbloquear");
  // useSearchParams exige un limite de Suspense en el prerender estatico.
  return (
    <Suspense
      fallback={
        <main style={CONTENEDOR}>
          <p>{t("cargando")}</p>
        </main>
      }
    >
      <UnlockContenido />
    </Suspense>
  );
}
