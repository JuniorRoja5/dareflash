/**
 * Tests ESTRUCTURALES del DETALLE PÚBLICO del reto. No prueban píxeles: fijan las cuatro decisiones
 * que la revisión pidió y que un refactor podría deshacer sin que nada más se queje.
 *
 *  1. Las participaciones se presentan con la primitiva `CajaVideo` (formato del sistema: 9:16 móvil /
 *     16:9 escritorio con blurred-fill), NO con una rejilla propia inventada al lado.
 *  2. La vista pública NO tiene moderación: ni botón "Retirar" ni llamada al endpoint del panel.
 *  3. La paginación es por CURSOR contra el endpoint público (nada de volcar la lista entera).
 *  4. El detalle usa el MISMO contenedor a ancho completo que /inicio y /retos (antes iba encajonado
 *     en una columna estrecha, que es lo que había que arreglar).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const DIR_DETALLE = join(RAIZ, "src", "app", "(app)", "(shell)", "retos", "[codigo]");

const leer = (...tramos: string[]): string => readFileSync(join(...tramos), "utf8");

const VISTA_PARTICIPACIONES = leer(DIR_DETALLE, "participaciones-reto.tsx");
const PAGINA_DETALLE = leer(DIR_DETALLE, "page.tsx");

/**
 * Quita comentarios (`/* *\/`, `{/* *\/}` y `//`). Lo que se afirma abajo es sobre el CÓDIGO: un
 * comentario que EXPLICA dónde vive ahora la moderación no es un botón de moderación.
 */
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const CODIGO_VISTA = soloCodigo(VISTA_PARTICIPACIONES);
const CODIGO_PAGINA = soloCodigo(PAGINA_DETALLE);

/** Extrae el `max-w-*` del contenedor raíz de una página (el primero que aparece). */
function anchoContenedor(fuente: string): string | undefined {
  return /className="mx-auto w-full (max-w-[\w-]+)/.exec(fuente)?.[1];
}

describe("presentación de las participaciones", () => {
  it("usa las primitivas del sistema: CajaVideo + ModalReproductor", () => {
    // CajaVideo es la regla CERRADA de formato de vídeo. Una rejilla propia con su `aspect-[9/16]`
    // a mano se saldría del sistema y volvería a divergir del feed/perfil en cuanto cambie la regla.
    expect(VISTA_PARTICIPACIONES).toContain('from "@/components/ui/caja-video"');
    expect(VISTA_PARTICIPACIONES).toContain("<CajaVideo");
    expect(VISTA_PARTICIPACIONES).toContain('from "@/components/ui/modal-reproductor"');
    expect(VISTA_PARTICIPACIONES).toContain("<ModalReproductor");
  });

  it("muestra autor y votos con las piezas compartidas (misma lectura que el feed)", () => {
    expect(VISTA_PARTICIPACIONES).toContain('from "@/lib/identidad"');
    expect(VISTA_PARTICIPACIONES).toContain("<ContadorVotos");
  });
});

describe("la vista pública NO modera", () => {
  it("no queda ningún botón de Retirar en el árbol público del detalle", () => {
    // Retirar se trasladó al panel: aquí estaba a un clic del público y fuera de sitio.
    expect(CODIGO_VISTA).not.toMatch(/Retirar/);
    expect(CODIGO_PAGINA).not.toMatch(/Retirar/);
  });

  it("no llama al endpoint de moderación del panel desde la vista pública", () => {
    for (const codigo of [CODIGO_VISTA, CODIGO_PAGINA]) {
      expect(codigo).not.toContain("/api/panel/");
    }
  });

  it("la vista pública no MUTA nada (solo lee): sin helpers CSRF de escritura", () => {
    // Si alguien vuelve a colar una acción de moderación aquí, tendrá que traerse uno de estos.
    expect(CODIGO_VISTA).not.toMatch(/postJsonCsrf|patchJsonCsrf|delCsrf/);
  });

  it("no pinta nada condicionado a ser admin (el detalle público es igual para todos)", () => {
    expect(CODIGO_VISTA).not.toMatch(/esAdmin|role === "ADMIN"/);
    expect(CODIGO_PAGINA).not.toMatch(/esAdmin|role === "ADMIN"/);
  });
});

describe("paginación", () => {
  it("pide las páginas siguientes al endpoint público con cursor", () => {
    expect(VISTA_PARTICIPACIONES).toContain("/participaciones?cursor=");
  });

  it("la página inicial pasa el cursor del servidor al cliente (no vuelca la lista entera)", () => {
    expect(PAGINA_DETALLE).toContain("cursorInicial={pagina.nextCursor}");
  });
});

describe("maqueta", () => {
  it("usa el MISMO contenedor a ancho completo que /inicio y /retos", () => {
    const inicio = anchoContenedor(
      leer(RAIZ, "src", "app", "(app)", "(shell)", "inicio", "page.tsx"),
    );
    const listado = anchoContenedor(
      leer(RAIZ, "src", "app", "(app)", "(shell)", "retos", "page.tsx"),
    );
    const detalle = anchoContenedor(PAGINA_DETALLE);

    expect(inicio).toBeDefined();
    expect(detalle).toBe(inicio);
    expect(detalle).toBe(listado);
  });

  it("la rejilla de participaciones se ensancha en escritorio (no se queda en una columna)", () => {
    expect(VISTA_PARTICIPACIONES).toMatch(/grid[^"]*sm:grid-cols-2[^"]*xl:grid-cols-3/);
  });
});
