"use client";

import { useTextos } from "@/components/textos-provider";
import { ErrorPantalla } from "@/components/ui/error-pantalla";

/** Si el monedero falla al cargar: el error diseñado, sin el mensaje interno. Ver `ErrorPantalla`. */
export default function ErrorMonedero({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTextos("errorPantalla");
  return <ErrorPantalla titulo={t("titulo_monedero")} retry={retry} />;
}
