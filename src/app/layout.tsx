import type { Metadata } from "next";
import { Archivo, IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

/**
 * Tipografia del sistema (brief de marca, seccion 5). Dos familias, las dos de licencia libre:
 *  - DISPLAY: Archivo (variable, con eje de ANCHURA `wdth`). Cifras y titulares; los importes de
 *    premio van en Archivo Expanded (ancho alto) + peso alto.
 *  - TEXTO: IBM Plex Sans (no variable en Google Fonts -> pesos explicitos). Cuerpo y formularios.
 * Prohibidas como cara del producto: Inter, Geist, Roboto, Open Sans, Poppins, Montserrat.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"], // ancho variable, para el "Expanded" de los importes
  display: "swap",
  variable: "--font-archivo",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "DareFlash",
  description: "DareFlash — retos en vídeo corto con premios reales.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // lang="es" fijo por ahora: el bilingue en/es de la Fase 1 se resuelve en su paso; PASO A es
  // solo tokens. El producto es OSCURO SIEMPRE (no hay modo claro): se fija en globals.css.
  return (
    <html lang="es" className={`${archivo.variable} ${plex.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
