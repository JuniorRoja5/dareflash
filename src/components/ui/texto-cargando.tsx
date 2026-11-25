"use client";

import { useTextos } from "@/components/textos-provider";

/**
 * «Cargando…» para un lector de pantalla (Fase 11 · P5b2a). Una HOJA DE CLIENTE y no un componente de
 * servidor asíncrono: la monta `PantallaCargando`, que usan los `loading.tsx` del armazón y del panel, y
 * así lee su texto del proveedor (`carga`) sin obligar a cada pantalla de carga a ser asíncrona.
 */
export function TextoCargando() {
  const t = useTextos("carga");
  return <span className="sr-only">{t("cargando")}</span>;
}
