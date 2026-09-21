"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  MOTIVOS_DENUNCIA,
  MSG_DENUNCIA_SIN_VERIFICAR,
  type ReportReason,
  type ReportTargetDenunciable,
} from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { veredictoDenuncia } from "@/lib/denuncias";

/**
 * DENUNCIAR — botón discreto + diálogo de motivos, para un vídeo o un comentario.
 *
 * Una sola pieza para los dos: lo único que cambia es `targetType`, y así lo que llegue después
 * (denunciar un perfil) se cablea una vez. El botón NO aparece en lo tuyo: para lo propio están
 * borrar y retirar, y ofrecer "denunciar" sobre tu propio comentario es ruido que además el servidor
 * rechazaría.
 *
 * Quién puede denunciar lo decide `veredictoDenuncia`, LA MISMA función que aplica la ruta: el botón
 * no promete lo que la API va a rechazar. Un invitado ve el enlace a entrar (navegación DURA, como
 * todo lo que lleva al login); quien no ha verificado el correo, el motivo real.
 *
 * El COPY de la confirmación lo manda el SERVIDOR (`mensaje`), incluido el de "ya nos habías avisado":
 * denunciar dos veces lo mismo no es un error y no se pinta como tal.
 */
export function Denunciar({
  targetType,
  targetId,
  haySesion,
  emailVerificado,
  esMio,
  className = "",
}: {
  targetType: ReportTargetDenunciable;
  targetId: string;
  haySesion: boolean;
  emailVerificado: boolean;
  esMio: boolean;
  className?: string;
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const veredicto = veredictoDenuncia({ haySesion, emailVerificado, esMio });

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  // Lo propio no se denuncia: ni botón.
  if (veredicto === "propio") return null;

  async function enviar(reason: ReportReason): Promise<void> {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await postJsonCsrf<{ mensaje?: string }>("/api/denuncias", {
        targetType,
        targetId,
        reason,
      });
      if (r.ok && r.data.mensaje) {
        setResultado(r.data.mensaje);
        return;
      }
      setError(mensajeDe(r.data) || "No se pudo enviar la denuncia.");
    } catch {
      setError("No hemos podido conectar. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  function cerrar(): void {
    setAbierto(false);
    setResultado(null);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Denunciar"
        className={`text-2xs text-text-dim transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:text-text hover:underline ${className}`}
      >
        Denunciar
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={cerrar}
            className="absolute inset-0 bg-void/70"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Denunciar"
            className="relative w-full max-w-sm rounded-lg border border-line bg-surface p-5 shadow-[var(--df-shadow-lg)]"
          >
            {resultado ? (
              // Confirmación: el texto viene del servidor (gracias / ya nos avisaste), sin códigos.
              <>
                <p role="status" className="text-sm text-text">
                  {resultado}
                </p>
                <button
                  type="button"
                  onClick={cerrar}
                  className="mt-5 w-full rounded-sm border border-line py-2 text-sm text-text-dim hover:bg-raised hover:text-text"
                >
                  Cerrar
                </button>
              </>
            ) : veredicto === "sin_sesion" ? (
              <>
                <p className="text-sm text-text-dim">Inicia sesión para denunciar.</p>
                <a
                  href={`/entrar?siguiente=${encodeURIComponent(ruta || "/feed")}`}
                  className="mt-5 block rounded-sm border border-line py-2 text-center text-sm text-text hover:bg-raised"
                >
                  Iniciar sesión
                </a>
              </>
            ) : veredicto === "sin_verificar" ? (
              <>
                <p className="text-sm text-text-dim">{MSG_DENUNCIA_SIN_VERIFICAR}</p>
                <button
                  type="button"
                  onClick={cerrar}
                  className="mt-5 w-full rounded-sm border border-line py-2 text-sm text-text-dim hover:bg-raised hover:text-text"
                >
                  Cerrar
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-text">¿Qué pasa con esto?</p>
                <p className="mt-1 text-2xs text-text-dim">
                  Lo revisará una persona. No se avisa a quien lo publicó.
                </p>
                <ul className="mt-4 space-y-1">
                  {MOTIVOS_DENUNCIA.map((m) => (
                    <li key={m.clave}>
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={() => void enviar(m.clave)}
                        className="w-full rounded-sm px-3 py-2 text-left text-sm text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:opacity-50"
                      >
                        {m.texto}
                      </button>
                    </li>
                  ))}
                </ul>
                {error ? (
                  <p role="alert" className="mt-3 text-xs text-alarm">
                    {error}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={cerrar}
                  className="mt-4 w-full rounded-sm border border-line py-2 text-sm text-text-dim hover:bg-raised hover:text-text"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
