"use client";

import { ErrorPantalla } from "@/components/ui/error-pantalla";

/** Si el monedero falla al cargar: el error diseñado, sin el mensaje interno. Ver `ErrorPantalla`. */
export default function ErrorMonedero({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorPantalla titulo="No hemos podido cargar tu monedero" retry={retry} />;
}
