"use client";

import { useTextos } from "@/components/textos-provider";
import { ErrorPantalla } from "@/components/ui/error-pantalla";

/** Si /puntos falla al cargar: el error diseñado, sin el mensaje interno. Ver `ErrorPantalla`. */
export default function ErrorPuntos({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTextos("errorPantalla");
  return <ErrorPantalla titulo={t("titulo_puntos")} retry={retry} />;
}
