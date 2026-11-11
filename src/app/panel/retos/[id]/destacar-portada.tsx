"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

/**
 * EL BOTÓN DEL DESTACADO DE LA PORTADA (Fase 9 · P14), en la ficha de un reto. `DESTACAR` lo pone en el
 * hero de `/inicio` (sustituye al que hubiera); `QUITAR` devuelve la portada al automático. Quien decide
 * si se puede es el servidor (solo ADMIN, solo un reto abierto); aquí solo se pregunta y se enseña la
 * respuesta.
 */
export function DestacarPortada({ id, esElDestacado }: { id: string; esElDestacado: boolean }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  async function llamar(accion: "DESTACAR" | "QUITAR") {
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await postJsonCsrf<{ mensaje?: string }>(`/api/panel/retos/${id}/portada`, {
        accion,
      });
      if (r.ok) {
        setMensaje({ texto: r.data.mensaje ?? "Hecho.", error: false });
        router.refresh();
      } else {
        setMensaje({ texto: mensajeDe(r.data) || "No se ha podido.", error: true });
      }
    } catch {
      setMensaje({ texto: "No hemos podido conectar. Inténtalo otra vez.", error: true });
    }
    setEnviando(false);
  }

  return (
    <div className="space-y-2">
      <Boton
        type="button"
        variante="secundario"
        disabled={enviando}
        onClick={() => void llamar(esElDestacado ? "QUITAR" : "DESTACAR")}
      >
        {enviando
          ? "Un momento…"
          : esElDestacado
            ? "Quitar de la portada"
            : "Destacar en la portada"}
      </Boton>
      {mensaje ? (
        <p
          role={mensaje.error ? "alert" : "status"}
          className={`text-sm ${mensaje.error ? "text-alarm" : "text-text-dim"}`}
        >
          {mensaje.texto}
        </p>
      ) : null}
    </div>
  );
}
