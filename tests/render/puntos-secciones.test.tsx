/**
 * RENDER REAL DE LAS PIEZAS DE /puntos, EN LOS DOS TEMAS.
 *
 * QUÉ PUEDE Y QUÉ NO PUEDE ESTE TEST, dicho antes de que alguien confíe de más: jsdom NO aplica hojas
 * de estilo ni evalúa media queries, así que montar con `data-theme="light"` no cambia ni un color
 * calculado. Lo que sí demuestra —y es lo que se rompe de verdad— es que el MARKUP no depende del
 * tema: que ningún estilo inline lleve un color fijo, y que lo que se pinta sea igual en los dos.
 * Un componente que decidiera un color por su cuenta se vería bien en uno y mal en el otro.
 * El contraste de cada token en cada tema lo mide `tests/paleta-clara.test.ts`; aquí no se duplica.
 *
 * Y se monta de verdad, que es lo que pillan estos tests y no los estructurales: un Rookie sin
 * emblema, un Legend sin barra, una fila "próximamente" sin CTA.
 */
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ACCIONES_PUNTOS } from "@/config/constants";
import { NIVELES } from "@/lib/niveles";

import { EscaleraNiveles } from "@/app/(app)/(shell)/puntos/escalera-niveles";
import { HeroNivel } from "@/app/(app)/(shell)/puntos/hero-nivel";
import { HistorialMisPuntos } from "@/app/(app)/(shell)/puntos/historial-mis-puntos";
import { TablaPuntos } from "@/app/(app)/(shell)/puntos/tabla-puntos";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

const TEMAS = ["dark", "light"] as const;
const legend = NIVELES[NIVELES.length - 1]!;
const rookie = NIVELES[0]!;

/** Todo color de un estilo inline tiene que venir de un token: un hex solo vale en un tema. */
function coloresInline(c: HTMLElement): string[] {
  return [...c.querySelectorAll<HTMLElement>("[style]")].flatMap((el) => {
    const s = el.getAttribute("style") ?? "";
    return [...s.matchAll(/(?:^|;)\s*[\w-]*color[\w-]*\s*:\s*([^;]+)/gi)].map((m) => m[1]!.trim());
  });
}

describe.each(TEMAS)("tema %s", (tema) => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-theme", tema);
  });

  describe("hero de nivel", () => {
    it("un nivel intermedio enseña su nombre, sus puntos y su barra", () => {
      const c = render(<HeroNivel puntos={750} />).container;
      expect(c.textContent).toContain("Pro");
      expect(c.textContent).toContain("750");
      const barra = c.querySelector('[role="progressbar"]');
      expect(barra, "falta la barra de progreso").not.toBeNull();
      // 750 puntos son 250 del tramo Pro (500 -> 2000), que son 1500: el 16%. Se escribe el número
      // esperado y no la fórmula: una fórmula repetida aquí pasaría en verde aunque la de producción
      // estuviera mal, porque sería la misma fórmula equivocada dos veces.
      expect(barra?.getAttribute("aria-valuenow")).toBe("16");
      expect(c.querySelector('[data-progreso="parcial"]')).not.toBeNull();
      expect(c.textContent).toContain("Elite");
    });

    it("en el nivel MÁXIMO no hay barra, hay techo", () => {
      const c = render(<HeroNivel puntos={legend.minimo + 500} />).container;
      expect(c.querySelector('[role="progressbar"]'), "Legend no debe tener barra").toBeNull();
      expect(c.querySelector('[data-progreso="maximo"]')).not.toBeNull();
      expect(c.textContent).toContain("Nivel máximo");
      expect(c.textContent).not.toContain("faltan");
    });

    it("ROOKIE no tiene emblema: en su hueco va el medidor, no un hueco vacío", () => {
      const c = render(<HeroNivel puntos={0} />).container;
      expect(c.textContent).toContain(rookie.nombre);
      // Sin emblema (no hay `role="img"` de nivel) pero con algo dibujado dentro del aro.
      expect(c.querySelector('svg[role="img"]')).toBeNull();
      const aro = c.querySelector<HTMLElement>("[data-nivel]");
      expect(aro?.getAttribute("data-nivel")).toBe("rookie");
      expect(within(aro!).queryAllByRole("generic").length).toBeGreaterThan(0);
      expect(aro!.querySelectorAll("span > span").length).toBe(NIVELES.length);
    });

    it("la insignia flota con la clase del sistema (la que apaga `prefers-reduced-motion`)", () => {
      const c = render(<HeroNivel puntos={750} />).container;
      expect(c.querySelector(".df-float"), "el medallón no lleva df-float").not.toBeNull();
    });

    it("y no fija ni un color: todo sale de un token", () => {
      for (const puntos of [0, 750, legend.minimo]) {
        const c = render(<HeroNivel puntos={puntos} />).container;
        for (const color of coloresInline(c)) {
          expect(color, `${puntos} puntos: ${color}`).toMatch(/^var\(--df-/);
        }
        cleanup();
      }
    });
  });

  describe("escalera de niveles", () => {
    it("están los cinco, y solo uno es el actual", () => {
      const c = render(<EscaleraNiveles puntos={750} />).container;
      expect(c.querySelectorAll("[data-nivel]")).toHaveLength(NIVELES.length);
      const actuales = c.querySelectorAll('[data-estado="actual"]');
      expect(actuales).toHaveLength(1);
      expect(actuales[0]?.getAttribute("data-nivel")).toBe("pro");
      expect(actuales[0]?.getAttribute("aria-current")).toBe("step");
    });

    it("distingue lo conseguido de lo que queda", () => {
      const c = render(<EscaleraNiveles puntos={750} />).container;
      const estado = (clave: string) =>
        c.querySelector(`[data-nivel="${clave}"]`)?.getAttribute("data-estado");
      expect(estado("rookie")).toBe("conseguido");
      expect(estado("challenger")).toBe("conseguido");
      expect(estado("pro")).toBe("actual");
      expect(estado("elite")).toBe("pendiente");
      expect(estado("legend")).toBe("pendiente");
    });

    it("enseña el umbral de cada uno, de la config y no a mano", () => {
      const c = render(<EscaleraNiveles puntos={0} />).container;
      for (const n of NIVELES) {
        if (n.minimo === 0) continue;
        expect(c.textContent, n.clave).toContain(n.minimo.toLocaleString("es-ES"));
      }
    });
  });

  describe("tabla de cómo ganar puntos", () => {
    it("salen todas las acciones del catálogo", () => {
      const c = render(<TablaPuntos />).container;
      expect(c.querySelectorAll("[data-accion]")).toHaveLength(ACCIONES_PUNTOS.length);
      for (const a of ACCIONES_PUNTOS) {
        expect(c.querySelector(`[data-accion="${a.razon}"]`), a.razon).not.toBeNull();
      }
    });

    it("una fila que aún no paga NO ofrece nada: sin CTA y con su estado dicho", () => {
      const c = render(<TablaPuntos />).container;
      const proximas = [...c.querySelectorAll<HTMLElement>('[data-estado="proximamente"]')];
      expect(proximas.length).toBe(ACCIONES_PUNTOS.filter((a) => !a.activa).length);
      for (const fila of proximas) {
        const clave = fila.getAttribute("data-accion")!;
        const config = ACCIONES_PUNTOS.find((a) => a.razon === clave)!;
        // Ni enlaces ni botones: anticipa, no ofrece.
        expect(fila.querySelector("a,button"), `${clave} ofrece una acción`).toBeNull();
        expect(fila.textContent, clave).toContain(
          config.fase ? `Fase ${config.fase}` : "Próximamente",
        );
      }
    });

    it("y el importe de una fila activa sale de la config", () => {
      const c = render(<TablaPuntos />).container;
      for (const a of ACCIONES_PUNTOS.filter((x) => x.activa)) {
        const fila = c.querySelector(`[data-accion="${a.razon}"]`);
        expect(fila?.textContent, a.razon).toContain(`+${a.puntos}`);
      }
    });
  });

  describe("historial propio", () => {
    const mov = (id: string, delta: number, razon: string, referencia = "—") => ({
      id,
      delta,
      razon,
      nota: null,
      creadoEnMs: Date.UTC(2026, 4, 12),
      referencia,
    });

    it("traduce el motivo y enseña el signo", () => {
      const c = render(
        <HistorialMisPuntos
          items={[mov("a", 30, "WIN_CHALLENGE", "El reto del agua"), mov("b", -5, "ADMIN_AJUSTE")]}
        />,
      ).container;
      expect(c.textContent).toContain("Ganaste un reto");
      expect(c.textContent).toContain("+30");
      expect(c.textContent).toContain("-5");
      expect(c.textContent).toContain("El reto del agua");
      // El código crudo NO se cuela.
      expect(c.textContent).not.toContain("WIN_CHALLENGE");
      expect(c.textContent).not.toContain("ADMIN_AJUSTE");
    });

    it("una referencia vacía no deja un guion suelto en la fila", () => {
      const c = render(<HistorialMisPuntos items={[mov("a", 5, "VIDEOS_PUBLICADOS")]} />).container;
      expect(c.textContent).not.toContain("· —");
    });

    it("sin movimientos, invita a hacer algo en vez de dejar un hueco", () => {
      const c = render(<HistorialMisPuntos items={[]} />).container;
      expect(c.textContent).toMatch(/Gana un reto o invita/);
    });
  });
});
