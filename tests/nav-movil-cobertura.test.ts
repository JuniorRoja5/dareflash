/**
 * EN MÓVIL NO QUEDA NINGÚN DESTINO SIN PUERTA.
 *
 * ┌─ EL FALLO QUE ESTO CIERRA ────────────────────────────────────────────────────────────────────┐
 * │ La barra inferior llevaba cinco destinos fijos y los otros cinco de escritorio —Inicio,       │
 * │ Ranking, Puntos, Referidos y Boost— no tenían puerta en móvil: se llegaba por los botones del │
 * │ perfil propio, por un enlace suelto de la portada, o no se llegaba (Inicio).                  │
 * │                                                                                               │
 * │ Y NO LO CAZABA NADA, porque un destino que nadie puede abrir no rompe ninguna pantalla: la     │
 * │ ruta existe, renderiza, pasa sus tests. Lo único que falta es el camino, y eso solo se ve      │
 * │ mirando las dos listas a la vez — que es lo que hace este fichero.                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que se fija:
 *  - COBERTURA: todo destino de escritorio está en la barra de móvil O en el menú "Más".
 *  - DERIVACIÓN: el menú es EXACTAMENTE escritorio menos barra. No hay una tercera lista.
 *  - SIN DUPLICADOS: nada aparece en los dos sitios.
 *  - CINCO HUECOS: cuatro destinos y el botón. Un sexto aprieta los objetivos táctiles por debajo
 *    de los 44 px, que es el mínimo del brief.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  destinosDe,
  NAV_DESTINOS,
  NAV_ESCRITORIO,
  NAV_MOVIL,
  NAV_MOVIL_MAS,
} from "../src/components/ui/logic";

const RAIZ = process.cwd();
const crudo = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
/** Sin comentarios: los docblocks de esta pieza explican la regla, y explicarla no es aplicarla. */
const leer = (...p: string[]) =>
  crudo(...p)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const LOGIC = ["src", "components", "ui", "logic.ts"];
const NAV = ["src", "components", "ui", "navegacion.tsx"];
const MENU = ["src", "components", "ui", "menu-mas-movil.tsx"];

describe("nadie queda inalcanzable en móvil", () => {
  it("TODO destino de escritorio está en la barra o en el menú", () => {
    const enMovil = new Set<string>([...NAV_MOVIL, ...NAV_MOVIL_MAS]);
    const huerfanos = NAV_ESCRITORIO.filter((c) => !enMovil.has(c));
    // Si esto falla: has sacado un destino de la barra sin meterlo en el menú (o has roto la
    // derivación). Mover algo nunca puede esconderlo.
    expect(huerfanos).toEqual([]);
  });

  it("y ninguno está en los DOS sitios", () => {
    const repetidos = NAV_MOVIL.filter((c) => (NAV_MOVIL_MAS as readonly string[]).includes(c));
    expect(repetidos).toEqual([]);
  });

  it("los cinco que hoy viven en el menú son los que no caben en la barra", () => {
    // Clavados: si alguien los mueve, que tenga que venir aquí y decidirlo.
    expect([...NAV_MOVIL_MAS]).toEqual(["inicio", "ranking", "destacados", "puntos", "referidos"]);
  });

  it("y cada uno se resuelve a un destino de verdad, con su ruta", () => {
    const resueltos = destinosDe(NAV_MOVIL_MAS);
    expect(resueltos).toHaveLength(NAV_MOVIL_MAS.length);
    for (const d of resueltos) {
      expect(d.href.startsWith("/"), d.clave).toBe(true);
      expect(
        NAV_DESTINOS.some((x) => x.clave === d.clave),
        d.clave,
      ).toBe(true);
    }
  });
});

describe("el menú se DERIVA: no hay una tercera lista", () => {
  it("es exactamente escritorio menos barra", () => {
    const esperado = NAV_ESCRITORIO.filter((c) => !(NAV_MOVIL as readonly string[]).includes(c));
    expect([...NAV_MOVIL_MAS]).toEqual([...esperado]);
  });

  it("y está escrito como una derivación, no enumerado a mano", () => {
    // La igualdad de arriba la cumple también una lista escrita a mano que HOY coincida; mañana
    // divergiría en silencio. Lo que hace imposible la divergencia es que se calcule.
    const src = leer(...LOGIC);
    expect(src).toMatch(/NAV_MOVIL_MAS = NAV_ESCRITORIO\.filter\(/);
    expect(src, "el menú se ha enumerado a mano").not.toMatch(/NAV_MOVIL_MAS[^=]*=\s*\[\s*"/);
  });

  it("un destino NUEVO de escritorio aparece en el menú solo", () => {
    // Se simula sobre la misma operación: añadir una clave a escritorio y ver que cae en el menú
    // sin tocar nada más. Es la propiedad que la derivación garantiza.
    const escritorioMas = [...NAV_ESCRITORIO, "una-seccion-nueva"];
    const menu = escritorioMas.filter((c) => !(NAV_MOVIL as readonly string[]).includes(c));
    expect(menu).toContain("una-seccion-nueva");
  });

  it("y el componente lo lee de ahí, no de una lista propia", () => {
    const src = leer(...MENU);
    expect(src).toContain("NAV_MOVIL_MAS");
    expect(src).toContain("destinosDe(");
    // Ni rutas escritas a mano: eso sería la tercera lista por la puerta de atrás.
    expect(src, "hay rutas escritas a mano en el menú").not.toMatch(/href="\/[a-z]/);
  });
});

describe("la barra tiene CINCO huecos", () => {
  it("cuatro destinos y el botón del menú", () => {
    // Un sexto aprieta los objetivos táctiles por debajo de 44 px.
    expect(NAV_MOVIL).toHaveLength(4);
    expect([...NAV_MOVIL]).toEqual(["feed", "retos", "crear", "perfil"]);
  });

  it("Ranking ya NO está en la barra, y Perfil sí", () => {
    expect([...NAV_MOVIL]).not.toContain("ranking");
    expect([...NAV_MOVIL]).toContain("perfil");
    // Ranking no se perdió: está en el menú.
    expect([...NAV_MOVIL_MAS]).toContain("ranking");
  });

  it("el [+] sigue siendo el central, y solo en móvil", () => {
    const central = destinosDe(NAV_MOVIL).find((d) => "central" in d && d.central);
    expect(central?.clave).toBe("crear");
    expect([...NAV_ESCRITORIO]).not.toContain("crear");
  });

  it("y la barra monta el menú UNA vez, después del bucle", () => {
    const src = leer(...NAV);
    expect(src.match(/<MenuMasMovil/g) ?? []).toHaveLength(1);
    // Después del bucle: no es un destino del catálogo, es la puerta al resto.
    expect(src.indexOf("<MenuMasMovil")).toBeGreaterThan(src.indexOf("destinosDe(NAV_MOVIL)"));
  });
});

describe("el menú empieza cerrado y no recuerda nada", () => {
  const src = leer(...MENU);

  it("el estado arranca en `false`", () => {
    expect(src).toMatch(/useState\(false\)/);
  });

  it("y no se persiste en ninguna parte", () => {
    // La nav vive en el armazón y no se desmonta al navegar: un menú con memoria se quedaría
    // abierto tapando la pantalla a la que acabas de llegar.
    expect(src, "el menú guarda su estado").not.toMatch(
      /localStorage|sessionStorage|cookie|searchParams/,
    );
  });

  it("se cierra al elegir un destino, al tocar fuera y con Escape", () => {
    expect(src).toMatch(/onClick=\{cerrar\}/);
    expect(src).toMatch(/pointerdown/);
    expect(src).toMatch(/"Escape"/);
  });
});

describe("accesibilidad y movimiento", () => {
  const src = leer(...MENU);

  it("el botón dice si está desplegado, y a qué manda", () => {
    expect(src).toMatch(/aria-expanded=\{abierto\}/);
    expect(src).toMatch(/aria-controls=\{idMenu\}/);
  });

  it("no promete un patrón ARIA que no implementa", () => {
    // `role="menu"` obliga a navegación por flechas y foco gestionado a mano. Declararlo sin eso le
    // promete a un lector de pantalla algo que no está. Esto es un botón y una lista de enlaces.
    expect(src, "declara role=menu sin implementarlo").not.toMatch(/role="menu/);
  });

  it("los objetivos táctiles llegan a 44 px", () => {
    expect(src.match(/min-h-\[44px\]/g) ?? []).not.toHaveLength(0);
  });

  it("el giro de la flecha es CSS, no JS", () => {
    // La regla global de `prefers-reduced-motion` apaga transiciones y animaciones con `!important`
    // sobre `*`. Un giro animado desde JS se saltaría esa red sin que nada avisara.
    expect(src).toMatch(/transition-transform/);
    expect(src).toMatch(/rotate-180/);
    expect(src, "el movimiento se hace desde JS").not.toMatch(
      /requestAnimationFrame|\.animate\(|setInterval/,
    );
  });
});

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia los ficheros", () => {
    for (const ruta of [LOGIC, NAV, MENU]) {
      expect(leer(...ruta).length, ruta.join("/")).toBeLessThan(crudo(...ruta).length);
    }
    // Control real: el menú EXPLICA en prosa que no declara `role="menu"`.
    expect(crudo(...MENU)).toMatch(/role="menu/);
    expect(leer(...MENU)).not.toMatch(/role="menu/);
  });
});
