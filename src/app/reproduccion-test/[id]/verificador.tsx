"use client";

import { useEffect, useState } from "react";

import { ReproductorHls } from "@/components/ui/reproductor-hls";

/**
 * Cliente del arnés: GET /api/videos/{id}/reproduccion (mismo-origen, con cookie de sesión) y
 * renderiza el reproductor con la URL firmada. Estados: cargando / no disponible (404) / error / ok.
 */
type Estado =
  | { fase: "cargando" }
  | { fase: "ok"; src: string; poster: string }
  | { fase: "no-disponible" }
  | { fase: "error" };

export function VerificadorReproduccion({ id }: { id: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/videos/${id}/reproduccion`, { credentials: "include" });
        if (!vivo) return;
        if (res.status === 404) {
          setEstado({ fase: "no-disponible" });
          return;
        }
        if (!res.ok) {
          setEstado({ fase: "error" });
          return;
        }
        const { src, poster } = (await res.json()) as { src: string; poster: string };
        if (vivo) setEstado({ fase: "ok", src, poster });
      } catch {
        if (vivo) setEstado({ fase: "error" });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [id]);

  if (estado.fase === "cargando") return <p className="text-sm text-text-dim">Cargando…</p>;
  if (estado.fase === "no-disponible")
    return <p className="text-sm text-text-dim">Vídeo no disponible.</p>;
  if (estado.fase === "error")
    return <p className="text-sm text-text-dim">No se pudo cargar el vídeo. Reintenta.</p>;

  return (
    <div className="overflow-hidden rounded-sm border border-line">
      <ReproductorHls variante="detalle" src={estado.src} poster={estado.poster} />
    </div>
  );
}
