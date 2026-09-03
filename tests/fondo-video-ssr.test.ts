/**
 * EL HTML DEL SERVIDOR NO LLEVA EL VÍDEO.
 *
 * Esto NO es estructural: renderiza el componente de verdad y mira el marcado. Es lo más cerca que se
 * puede estar en Node del invariante duro ("en móvil no se piden los bytes"): si el `.mp4` no aparece
 * en el HTML que sale del servidor, ningún navegador —móvil o no— puede pedirlo antes de hidratar. Lo
 * que ocurre DESPUÉS de hidratar lo decide `debeMontarVideoFondo`, probado aparte.
 *
 * Se usa `createElement` y no JSX porque la suite solo recoge `tests/**\/*.test.ts`: no merece la pena
 * tocar la configuración de vitest por un fichero.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FondoVideo } from "../src/components/ui/fondo-video";
import { VIDEO_FONDO_HOME } from "../src/config/constants";

describe("render de servidor", () => {
  const html = renderToStaticMarkup(createElement(FondoVideo, { src: VIDEO_FONDO_HOME }));

  it("no hay <video> ni rastro de la URL del .mp4", () => {
    expect(html).not.toContain("<video");
    expect(html).not.toContain(".mp4");
    expect(html).not.toContain("dareflash-assets");
  });

  it("pero el TELÓN sí está: nada de fogonazo de fondo vacío", () => {
    // El velo se pinta desde el primer byte de HTML, y es también lo que ven móvil y movimiento
    // reducido. Por eso no hace falta un póster.
    expect(html).toContain("--df-velo-fondo");
    expect(html).toContain("bg-void");
  });

  it("y es decoración inerte: aria-hidden y sin capturar clics", () => {
    expect(html).toContain("aria-hidden");
    expect(html).toContain("pointer-events-none");
  });
});
