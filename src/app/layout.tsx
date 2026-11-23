import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { FormatoProvider } from "@/components/formato-provider";
import { atributoTema, TEMA_COLOR_BARRA, TEMA_COOKIE, temaDesdeCookie } from "@/lib/tema";
import { SCRIPT_ZONA } from "@/lib/zona-espectador";
import { idiomaDeLaPeticion, zonaDeLaPeticion } from "@/server/formato-peticion";

// Tipografía del sistema (MARCA.md): Archivo + IBM Plex Sans, servidas desde el repositorio. El porqué,
// los ficheros y sus licencias, en `./fuentes`.
import { variablesFuentes } from "./fuentes";
import "./globals.css";
import { MARCA, TITULO_RAIZ } from "@/config/marca";

/**
 * LA MARCA DE LOS TÍTULOS VIVE AQUÍ, una vez (`TITULO_RAIZ`, de `config/marca`): cada página pone solo
 * su sección («Retos») y la plantilla añade la marca. Las excepciones usan `title.absolute` (la guía
 * de estilo, con la marca delante). El panel encadena la suya (« · Panel») en su layout.
 *
 * Y LA CANÓNICA Y EL `hreflang` TAMBIÉN VIVEN AQUÍ, una vez (Fase 11 · P5a): los de la ruta de la
 * petición en cada idioma publicado, más `x-default` (ver `server/metadatos-idioma`). Ninguna página
 * pone los suyos. Por petición (`generateMetadata`), nunca en ámbito de módulo: el build no tiene una.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { alternativasDeLaPeticion } = await import("@/server/metadatos-idioma");
  return {
    title: TITULO_RAIZ,
    description: `${MARCA} — retos en vídeo corto con premios reales.`,
    alternates: await alternativasDeLaPeticion(),
  };
}

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
  // `lang` = el idioma de la URL (Fase 11 · P5a): «es» en la raíz, el del prefijo en `/en/…`.
  //
  // EL TEMA SE SIRVE DESDE EL SERVIDOR: `data-theme` sale ya en el HTML, leído de la cookie. Es lo que
  // evita el parpadeo — con la preferencia en `localStorage` el primer pintado sería siempre oscuro y
  // el claro entraría de golpe al hidratar. Sin cookie, oscuro (ver `lib/tema`).
  const tema = temaDesdeCookie((await cookies()).get(TEMA_COOKIE)?.value);
  // EL IDIOMA Y LA ZONA DE QUIEN MIRA (Fase 11 · P1), para los componentes de cliente que formatean:
  // los mismos que usa el servidor, así el HTML hidrata igual a los dos lados (ver `lib/zona-espectador`).
  const [idioma, zona] = await Promise.all([idiomaDeLaPeticion(), zonaDeLaPeticion()]);
  return (
    <html
      lang={idioma}
      data-theme={atributoTema(tema)}
      className="h-full antialiased"
      style={variablesFuentes}
    >
      <head>
        {/* Guarda la zona del navegador en una cookie para el servidor. En línea y antes que nada: no
            añade JS al bundle (ver `SCRIPT_ZONA`). */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ZONA }} />
      </head>
      <body className="flex min-h-full flex-col">
        <FormatoProvider idioma={idioma} zona={zona}>
          {children}
        </FormatoProvider>
      </body>
    </html>
  );
}
