import type { MetadataRoute } from "next";

/**
 * robots.txt: `Disallow: /` para TODOS los agentes. dareflash.com NO se indexa hasta la Fase 1
 * (decision de Junior). Esto evita el RASTREO; la cabecera `X-Robots-Tag: noindex` de
 * next.config.ts es la que impide de verdad la INDEXACION (una URL enlazada desde fuera puede
 * indexarse aunque no se rastree). Las dos capas hacen falta. Ver tests/noindex.test.ts (pestillo).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    // "/" = pestillo TEMPORAL de Fase 1 (todo el sitio, decision de Junior). "/panel" = PERMANENTE:
    // el panel de admin NO se indexa jamas, aunque algun dia se levante el bloqueo global de arriba.
    // Defensa en profundidad (+ noindex en el head del panel + requireRole en su layout).
    rules: { userAgent: "*", disallow: ["/", "/panel"] },
  };
}
