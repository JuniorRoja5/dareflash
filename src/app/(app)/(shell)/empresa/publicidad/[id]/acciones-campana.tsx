"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { delCsrf, mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import type { AccionPublicidad } from "@/lib/publicidad";
import { useFormato } from "@/components/formato-provider";
import { formatearDiaClave, type Idioma } from "@/lib/formato";

/** La primera fecha libre es una CLAVE de día UTC de la campaña: etiqueta de calendario, sin zona. */
const fechaLarga = (iso: string, idioma: Idioma) =>
  formatearDiaClave(iso, idioma, "diaMesLargoAno");

/** El texto de cada botón. La acción principal de la ficha va en el botón principal; el resto, no. */
const TEXTO: Record<AccionPublicidad, string> = {
  ACTIVAR: "Activar",
  PAUSAR: "Pausar",
  REANUDAR: "Reanudar",
  TERMINAR: "Terminar ya",
  BORRAR: "Borrar borrador",
};

/** Lo que se confirma antes de hacer algo que no tiene vuelta atrás. */
const CONFIRMAR: Partial<Record<AccionPublicidad, string>> = {
  TERMINAR:
    "¿Terminar la campaña ya? Sus días por venir quedarán libres para otras campañas y no se puede reanudar.",
  BORRAR: "¿Borrar este borrador? No se puede deshacer.",
};

/**
 * LO QUE LA EMPRESA PUEDE HACER CON SU CAMPAÑA (Fase 9 · P6). Los botones salen de `accionesPublicidad`
 * —la misma tabla que aplica el servidor—, así que nunca se ofrece algo que se vaya a rechazar.
 *
 * SI LA ZONA ESTÁ LLENA (activar o reanudar), el servidor devuelve la PRIMERA FECHA LIBRE y aquí se
 * ofrece con un botón: aceptarla es repetir la acción con esa fecha. No se cambia nada sin que la
 * empresa lo pulse.
 */
export function AccionesCampana({
  id,
  acciones,
  empiezaHoy,
}: {
  id: string;
  acciones: readonly AccionPublicidad[];
  /** Si el calendario pedido empieza hoy («Activar») o más tarde («Programar»). */
  empiezaHoy: boolean;
}) {
  const { idioma } = useFormato();
  const router = useRouter();
  const [enCurso, setEnCurso] = useState<AccionPublicidad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libre, setLibre] = useState<{ accion: AccionPublicidad; fecha: string } | null>(null);

  async function hacer(accion: AccionPublicidad, fechaInicio?: string): Promise<void> {
    const aviso = CONFIRMAR[accion];
    if (aviso && !window.confirm(aviso)) return;
    setEnCurso(accion);
    setError(null);
    try {
      const r =
        accion === "BORRAR"
          ? await delCsrf(`/api/empresa/publicidad/${id}`)
          : await postJsonCsrf<{ primeraLibre?: string | null }>(`/api/empresa/publicidad/${id}`, {
              accion,
              ...(fechaInicio ? { fechaInicio } : {}),
            });
      if (r.ok) {
        setLibre(null);
        if (accion === "BORRAR") {
          router.push("/empresa/publicidad");
        }
        router.refresh();
      } else if (r.code === "ZONA_LLENA") {
        const fecha = (r.data as { primeraLibre?: string | null }).primeraLibre ?? null;
        setLibre(fecha ? { accion, fecha } : null);
        setError(mensajeDe(r.data));
      } else {
        setError(mensajeDe(r.data) || "No hemos podido hacerlo. Inténtalo otra vez.");
      }
    } catch {
      setError("No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.");
    }
    setEnCurso(null);
  }

  if (acciones.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {acciones.map((a) => (
          <Boton
            key={a}
            type="button"
            variante={
              a === "ACTIVAR" || a === "REANUDAR"
                ? "principal"
                : a === "BORRAR" || a === "TERMINAR"
                  ? "fantasma"
                  : "secundario"
            }
            disabled={enCurso !== null}
            onClick={() => void hacer(a)}
            className="w-full sm:w-auto"
          >
            {enCurso === a
              ? "Un momento…"
              : a === "ACTIVAR" && !empiezaHoy
                ? "Programar"
                : TEXTO[a]}
          </Boton>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      ) : null}
      {libre ? (
        <div className="rounded-sm border border-line bg-raised p-4">
          <p className="text-sm text-text">
            El primer hueco libre para todos sus días empieza el{" "}
            <span className="font-semibold">{fechaLarga(libre.fecha, idioma)}</span>.
          </p>
          <Boton
            type="button"
            variante="secundario"
            className="mt-3 w-full sm:w-auto"
            disabled={enCurso !== null}
            onClick={() => void hacer(libre.accion, libre.fecha)}
          >
            Programar para el {fechaLarga(libre.fecha, idioma)}
          </Boton>
        </div>
      ) : null}
    </div>
  );
}
