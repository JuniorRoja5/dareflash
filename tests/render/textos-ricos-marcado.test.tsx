/**
 * LAS FRASES CON FORMATO, LETRA A LETRA Y ETIQUETA A ETIQUETA (Fase 11 · P5b1 · `tRico`).
 *
 * Ocho sitios pintaban UNA frase partida en varias claves para meter un formato en medio (el resaltado
 * del hero, un enlace, un `sr-only`). Al pasarlos a `tRico` el castellano no puede cambiar NI EN EL
 * MARCADO: la misma etiqueta, con la misma clase, alrededor de las mismas palabras. Este test fija el
 * HTML exacto de cada uno, sacado del código ANTERIOR a la conversión. Seis de los ocho no salen en las
 * páginas de muestra (dependen de un estado que la semilla no pinta: el destacado elegido por el
 * admin, los ganadores, la portada vacía, los avisos), así que esta es su única red.
 *
 * Para romperlo: mover la negrita una palabra («El mayor {resaltado:premio}…»), cambiarle la clase, o
 * quitar un espacio de una plantilla. Cualquiera de los tres, rojo con el HTML de antes y el de ahora.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

const mocks = vi.hoisted(() => ({ getJson: vi.fn(), postJsonCsrf: vi.fn() }));
vi.mock("@/lib/cliente-http", () => ({ getJson: mocks.getJson, postJsonCsrf: mocks.postJsonCsrf }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { ProveedorAvisos } from "@/app/(app)/avisos-contexto";
import { CampanaNotificaciones } from "@/app/(app)/(shell)/campana-notificaciones";
import { ComoFunciona } from "@/app/(app)/(shell)/inicio/como-funciona";
import { HeroDestacado } from "@/app/(app)/(shell)/inicio/hero-destacado";
import { RetosDestacados } from "@/app/(app)/(shell)/inicio/retos-destacados";
import { StatsInicio } from "@/app/(app)/(shell)/inicio/stats-inicio";
import { UltimosGanadores } from "@/app/(app)/(shell)/inicio/ultimos-ganadores";
import { NavegacionInferior } from "@/components/ui/navegacion";
import { MARCA } from "@/config/marca";
import type { RetoPortada } from "@/server/services/portada";

const RETO = {
  publicCode: "abc12345",
  slug: "reto",
  titulo: "Reto",
  categoria: "fitness",
  coverImage: null,
  participantes: 2,
  votos: 5,
  premioCents: 5000,
  deadlineMs: Date.now() + 5 * 86_400_000,
} as unknown as RetoPortada;

/** El `<p>` de debajo del hero: lo que dice por qué ESE reto está ahí. */
async function pieDelHero(elegido: boolean): Promise<string> {
  const { container } = render(
    await resolverServidor(<HeroDestacado destacado={{ reto: RETO, elegido }} idioma="es" />),
  );
  return container.querySelector("p.mt-3.text-center")!.outerHTML;
}

describe("el hero de la portada", () => {
  it("«El mayor premio en juego ahora mismo», con el resaltado en las mismas dos palabras", async () => {
    expect(await pieDelHero(false)).toBe(
      '<p class="mt-3 text-center text-sm text-text-dim">El <span class="font-medium text-text">mayor premio</span> en juego ahora mismo</p>',
    );
  });

  it("«Elegido por el equipo de <marca>», con el resaltado en «equipo de <marca>»", async () => {
    expect(await pieDelHero(true)).toBe(
      `<p class="mt-3 text-center text-sm text-text-dim">Elegido por el <span class="font-medium text-text">equipo de ${MARCA}</span></p>`,
    );
  });
});

describe("la portada sin retos", () => {
  it("las cifras: la frase con el enlace en medio y el punto detrás", () => {
    const { container } = render(<StatsInicio cifras={[]} tema="oscuro" />);
    expect(container.querySelector("p")!.outerHTML).toBe(
      '<p class="mt-8 max-w-prose text-sm text-text-dim">Ahora mismo no hay retos abiertos. <a href="/retos" class="text-text underline underline-offset-2">Mira los que vienen</a>.</p>',
    );
  });

  it("la rejilla, con y sin destacado: la frase y su enlace", async () => {
    const enlace =
      '<a href="/retos" class="text-text underline underline-offset-2">Ver los próximos</a>';
    const p =
      '<p class="rounded-sm border border-line bg-surface/60 px-4 py-6 text-center text-sm text-text-dim">';
    for (const [hayDestacado, frase] of [
      [true, "Ahora mismo no hay más retos abiertos que el destacado."],
      [false, "Ahora mismo no hay retos abiertos."],
    ] as const) {
      const { container, unmount } = render(
        await resolverServidor(
          <RetosDestacados retos={[]} hayDestacado={hayDestacado} idioma="es" />,
        ),
      );
      expect(container.querySelector("p")!.outerHTML, String(hayDestacado)).toBe(
        `${p}${frase} ${enlace}</p>`,
      );
      unmount();
    }
  });
});

describe("los últimos ganadores", () => {
  it("«ganó <reto>», con el reto como enlace", async () => {
    const { container } = render(
      await resolverServidor(
        <UltimosGanadores
          tema="oscuro"
          ganadores={[
            {
              userId: "u1",
              username: "ana",
              displayName: null,
              image: null,
              puntos: 0,
              esVip: false,
              colorNombre: null,
              retoTitulo: "Reto de prueba",
              retoHref: "/retos/abc12345-reto",
              premioCents: 5000,
              moneda: "USD",
              cuandoMs: 1,
            },
          ]}
        />,
      ),
    );
    expect(container.querySelector("p.truncate")!.outerHTML).toBe(
      '<p class="truncate text-2xs text-text-dim">ganó <a href="/retos/abc12345-reto" class="text-text hover:underline">Reto de prueba</a></p>',
    );
  });
});

describe("lo que solo oye un lector de pantalla", () => {
  it("«Paso 1: » delante del título del paso", async () => {
    const { container } = render(await resolverServidor(<ComoFunciona tema="oscuro" />));
    expect(container.querySelector("h3")!.outerHTML).toBe(
      '<h3 class="text-base font-semibold text-text"><span class="sr-only">Paso 1: </span>Elige un reto</h3>',
    );
  });

  it("« (3 avisos sin leer)» detrás de «Perfil» en la nav de móvil", () => {
    render(<NavegacionInferior rol="USER" noLeidas={3} />);
    expect(screen.getByText("Perfil").outerHTML).toBe(
      '<span>Perfil<span class="sr-only"> (3 avisos sin leer)</span></span>',
    );
  });

  it("«Nuevo: » delante de un aviso sin leer de la campana", async () => {
    mocks.getJson.mockResolvedValue({
      ok: true,
      status: 200,
      code: "",
      data: {
        items: [
          {
            id: "a",
            texto: "Aviso a",
            href: "/perfil",
            leida: false,
            creadaMs: Date.now() - 60_000,
          },
          {
            id: "b",
            texto: "Aviso b",
            href: "/perfil",
            leida: true,
            creadaMs: Date.now() - 60_000,
          },
        ],
        nextCursor: null,
        noLeidas: 1,
      },
    });
    mocks.postJsonCsrf.mockResolvedValue({
      ok: true,
      status: 200,
      code: "",
      data: { noLeidas: 0 },
    });
    render(
      <ProveedorAvisos inicial={1} activo={false}>
        <CampanaNotificaciones />
      </ProveedorAvisos>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Notificaciones/ }));
    await waitFor(() => expect(screen.getByText("Aviso b")).toBeDefined());
    const bloque = (texto: string) =>
      [...document.querySelectorAll("span.block.text-sm")].find((e) =>
        e.textContent?.includes(texto),
      )!.outerHTML;
    expect(bloque("Aviso a")).toBe(
      '<span class="block text-sm text-text"><span class="sr-only">Nuevo: </span>Aviso a</span>',
    );
    // Y el leído, SIN el «Nuevo: » (el control: si no, el caso de arriba no distinguiría nada).
    expect(bloque("Aviso b")).toBe('<span class="block text-sm text-text-dim">Aviso b</span>');
  });
});
