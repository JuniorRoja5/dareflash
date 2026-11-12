import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { atributoTema, TEMA_COLOR_BARRA, TEMA_COOKIE, temaDesdeCookie } from "@/lib/tema";

// Tipografía del sistema (MARCA.md): Archivo + IBM Plex Sans, servidas desde el repositorio. El porqué,
// los ficheros y sus licencias, en `./fuentes`.
import { variablesFuentes } from "./fuentes";
import "./globals.css";

export const metadata: Metadata = {
  title: "DareFlash",
  description: "DareFlash — retos en vídeo corto con premios reales.",
};

/**
 * `viewport-fit=cover` es OBLIGATORIO para que `env(safe-area-inset-*)` tenga valor (>0) en móviles
 * con notch/gestos: sin él, las áreas seguras que usan el feed inmersivo y sus controles quedan a 0 y
 * los botones se meten bajo la barra del sistema.
 *
 * El `themeColor` (el color que pinta la barra del navegador) se calcula POR PETICIÓN a partir del
 * tema: con uno fijo, el móvil enseñaría una barra oscura encima de una página blanca.
 */
export async function generateViewport(): Promise<Viewport> {
  const tema = temaDesdeCookie((await cookies()).get(TEMA_COOKIE)?.value);
  return { viewportFit: "cover", themeColor: TEMA_COLOR_BARRA[tema] };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // lang="es" fijo por ahora: el bilingue en/es de la Fase 1 se resuelve en su paso.
  //
  // EL TEMA SE SIRVE DESDE EL SERVIDOR: `data-theme` sale ya en el HTML, leído de la cookie. Es lo que
  // evita el parpadeo — con la preferencia en `localStorage` el primer pintado sería siempre oscuro y
  // el claro entraría de golpe al hidratar. Sin cookie, oscuro (ver `lib/tema`).
  const tema = temaDesdeCookie((await cookies()).get(TEMA_COOKIE)?.value);
  return (
    <html
      lang="es"
      data-theme={atributoTema(tema)}
      className="h-full antialiased"
      style={variablesFuentes}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
