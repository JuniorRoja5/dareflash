/**
 * QUIEN SOLO MIRA NO VE NI UN CONTROL DE PARTICIPACIÓN ACTIVO (Fase 9, P2).
 *
 * Una cuenta de empresa mira todo y no participa: `mutatingRoute` le responde 403 en votar, dar like,
 * comentar o denunciar. La pantalla no le ofrece esos controles. La decisión sale de UNA función,
 * `soloMirar` (`lib/solo-mirar`), y aquí se fija en tres capas:
 *
 *  1. EL FEED PINTADO, con los componentes de verdad (voto, like, denuncia, comentarios): con
 *     `soloMirar`, todo botón está en una LISTA DE PERMITIDOS (mirar: sonido, compartir, abrir los
 *     comentarios, navegar) y no hay caja de escribir. La lista de permitidos es el diente: un control
 *     nuevo de participación que alguien añada al feed sin pensar en esto la rompe. Y el mismo render
 *     SIN `soloMirar` sí tiene los controles, para que el test no pase por vacío.
 *  2. EL PIE: sin "Para empresas" para una cuenta de empresa; con él para el resto.
 *  3. EL CABLEADO: cada sitio que monta el feed, la rejilla del reto, el botón "Participar" o el
 *     toque saca la decisión de `soloMirar(sesión)`, nunca de un valor fijo.
 *
 * Para romperlo a propósito: volver a pintar `<BotonVoto>` sin mirar `soloMirar` (rojo el 1); quitar el
 * `soloMirar` de la caja de comentarios (rojo el 1); pasar `soloMirar={false}` en el detalle del reto
 * (rojo el 3); pintar "Para empresas" siempre (rojo el 2).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/reproductor-hls", () => ({
  ReproductorHls: () => <div data-testid="video" />,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/feed" }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { FeedVertical } from "@/components/feed/feed-vertical";
import { PieLegal } from "@/components/ui/pie-legal";
import { ENLACE_PIE_EMPRESAS, MSG_EMPRESA_SOLO_MIRA } from "@/config/constants";
import type { PostFeed } from "@/server/services/feed";

afterEach(cleanup);

beforeAll(() => {
  class IO {
    observe(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  // Los comentarios se piden al montar: una lista vacía basta (aquí se prueba la caja, no la lista).
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
  window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
});

/** Un vídeo que ES participación de un reto abierto: lleva todos los controles posibles. */
const post: PostFeed = {
  id: "v1",
  displayName: "Lucía",
  username: "lucia",
  imagen: null,
  puntos: 0,
  retoTitulo: "Reto",
  categoria: null,
  votos: 12,
  comentarios: 3,
  likes: 7,
  miLike: false,
  src: "s",
  poster: "p",
  participacionId: "s1",
  retoId: "r1",
  retoAbierto: true,
  miVoto: null,
  esMio: false,
} as PostFeed;

async function feed(soloMirar: boolean) {
  await act(async () => {
    render(
      <FeedVertical
        postsIniciales={[post]}
        cursorInicial={null}
        haySesion
        emailVerificado
        soloMirar={soloMirar}
      />,
    );
  });
}

/**
 * LO QUE QUIEN SOLO MIRA PUEDE PULSAR en el feed: nada de esto participa. Un botón fuera de esta
 * lista, con `soloMirar`, es un control que nadie ha pensado para una empresa.
 */
const PERMITIDOS = [
  /^Ver comentarios \(/, // abrir los comentarios, para LEERLOS
  /^Compartir$/,
  /^(Activar sonido|Silenciar)$/,
  /^Vídeo (anterior|siguiente)$/,
  /^Ver más comentarios$/,
];

const nombres = () =>
  screen
    .queryAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "");

describe("el feed, para quien solo mira", () => {
  it("todo botón es de MIRAR, y no hay caja de escribir", async () => {
    await feed(true);
    const ajenos = nombres().filter((n) => !PERMITIDOS.some((p) => p.test(n)));
    expect(ajenos).toEqual([]);
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });

  it("las cifras se siguen viendo (mirar), y la caja dice por qué no está", async () => {
    await feed(true);
    const cifras = [...document.querySelectorAll("[data-cifra-solo-lectura]")].map(
      (c) => c.textContent,
    );
    expect(cifras).toEqual(["7me gusta", "12votos"]);
    // En el hueco de la caja de comentar —panel de escritorio—, la línea.
    expect(screen.getAllByText(MSG_EMPRESA_SOLO_MIRA).length).toBeGreaterThan(0);
  });

  it("SIN soloMirar, los controles están (el test no pasa por vacío)", async () => {
    await feed(false);
    const n = nombres();
    expect(n.some((x) => /^Me gusta/.test(x))).toBe(true);
    expect(n.some((x) => /^Denunciar$/.test(x))).toBe(true);
    expect(n.some((x) => /^Comentar \(/.test(x))).toBe(true);
    expect(n.filter((x) => !PERMITIDOS.some((p) => p.test(x))).length).toBeGreaterThan(2);
    expect(document.querySelector("textarea")).not.toBeNull();
  });
});

describe("el pie: «Para empresas» no se le enseña a una empresa", () => {
  it("una cuenta de empresa no lo ve", () => {
    render(<PieLegal sobreNavMovil esCuentaEmpresa />);
    expect(screen.queryByText(ENLACE_PIE_EMPRESAS.texto)).toBeNull();
    // El resto del pie sigue: es la puerta a /privacidad.
    expect(screen.getByText("Privacidad")).toBeTruthy();
  });

  it("invitados y participantes, sí", () => {
    render(<PieLegal sobreNavMovil />);
    expect(screen.getByText(ENLACE_PIE_EMPRESAS.texto).getAttribute("href")).toBe(
      ENLACE_PIE_EMPRESAS.href,
    );
  });
});

// ---------------------------------------------------------------------------------------------------
// 3. El cableado: la decisión sale SIEMPRE de `soloMirar(sesión)`
// ---------------------------------------------------------------------------------------------------

const RAIZ = path.resolve(__dirname, "..", "..");
const leer = (...p: string[]) =>
  readFileSync(path.join(RAIZ, ...p), "utf8")
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("cada página compartida saca la decisión de `soloMirar`", () => {
  it("el feed", () => {
    expect(leer("src", "app", "(app)", "feed", "page.tsx")).toMatch(
      /soloMirar=\{soloMirar\(usuario\)\}/,
    );
  });

  it("el detalle del reto: «Participar» y la rejilla (con su feed)", () => {
    const reto = leer("src", "app", "(app)", "(shell)", "retos", "[codigo]", "page.tsx");
    // El botón va DENTRO de la rama de quien participa.
    expect(reto).toMatch(
      /\{soloMirar\(usuario\) \? \([\s\S]*?MSG_EMPRESA_SOLO_MIRA[\s\S]*?\) : \([\s\S]*?<BotonParticipar/,
    );
    expect(reto).toMatch(/soloMirar=\{soloMirar\(usuario\)\}/);
    const rejilla = leer(
      "src",
      "app",
      "(app)",
      "(shell)",
      "retos",
      "[codigo]",
      "participaciones-reto.tsx",
    );
    expect(rejilla).toMatch(/<FeedVertical[\s\S]*?soloMirar=\{soloMirar\}/);
  });

  it("el perfil público: quien solo mira no toca", () => {
    expect(leer("src", "app", "(app)", "(shell)", "u", "[username]", "page.tsx")).toMatch(
      /!soloMirar\(yo\)/,
    );
  });

  it("el feed le pasa la decisión a las tres piezas de comentarios y controles", () => {
    const f = leer("src", "components", "feed", "feed-vertical.tsx");
    // Cinco: el post, el panel y la hoja (desde `FeedVertical`) y los comentarios del panel y de la
    // hoja (desde cada uno). Uno de menos es una pieza que vuelve a ofrecer controles.
    expect(f.match(/soloMirar=\{soloMirar\}/g)?.length).toBe(5);
    const c = leer("src", "components", "feed", "comentarios-video.tsx");
    expect(c).toMatch(/\{soloMirar \? \(/);
  });

  it("nadie fija `soloMirar` a mano en una página", () => {
    for (const rel of [
      ["src", "app", "(app)", "feed", "page.tsx"],
      ["src", "app", "(app)", "(shell)", "retos", "[codigo]", "page.tsx"],
      ["src", "app", "(app)", "(shell)", "inicio", "page.tsx"],
    ]) {
      expect(leer(...rel), rel.join("/")).not.toMatch(/soloMirar=\{(true|false)\}/);
    }
  });

  it("el pie del shell lee la sesión", () => {
    expect(leer("src", "app", "(app)", "(shell)", "layout.tsx")).toMatch(
      /<PieLegal sobreNavMovil esCuentaEmpresa=\{user\?\.esCuentaEmpresa \?\? false\} \/>/,
    );
  });
});
