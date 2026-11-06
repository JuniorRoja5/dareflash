"use client";

import { ErrorPantalla } from "@/components/ui/error-pantalla";

/** Si /puntos falla al cargar: el error diseñado, sin el mensaje interno. Ver `ErrorPantalla`. */
export default function ErrorPuntos({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorPantalla titulo="No hemos podido cargar tus puntos" retry={retry} />;
}
