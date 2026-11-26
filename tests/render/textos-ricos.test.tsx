/**
 * `tRico` PINTADO DE VERDAD (Fase 11 · P5b1): lo que una plantilla con formato pone en el DOM.
 *
 *  - Un diccionario con HTML crudo (un `<script>`, un `<b>`, un `<img onerror>`) se pinta como TEXTO: ni
 *    un elemento de más en el DOM. Es la barrera frente a lo que escriba un traductor (P5c) o quien
 *    edite un diccionario a mano.
 *  - Lo que llega por PARÁMETRO (el título de un reto, que escribe una persona) tampoco se interpreta,
 *    ni como HTML ni como marca: un título «{resaltado:x}» se lee tal cual.
 *  - El pseudo-idioma `xx` conserva el formato: el resaltado sigue siendo un `<span>` con su clase, con
 *    las palabras cambiadas dentro, y no asoma ninguna llave.
 *  - Mismo resultado en el servidor y en el cliente: `crearTRico` no tiene hooks; el proveedor solo le
 *    pasa el espacio y el idioma.
 *
 * Para romperlo: pintar los trozos con `dangerouslySetInnerHTML` (rojo: aparece el `<b>`), o acentuar
 * los nombres de marca en `pseudo.ts` (rojo: el resaltado se pierde y asoman las llaves).
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { es } from "@/textos/es";
import { pseudoDiccionario } from "@/textos/pseudo";
import { crearTRico } from "@/textos/rico";

describe("el diccionario no mete HTML", () => {
  it("un `<script>`, un `<b>` o un `<img onerror>` en una plantilla salen como texto", () => {
    const CRUDO = '<script>alert(1)</script> y <b>negrita</b> <img src=x onerror="alert(2)">';
    const espacio = { k: `${CRUDO} {resaltado:<i>dentro</i>}` } as const;
    const { container } = render(
      <p>{crearTRico(espacio, "es")("k", { resaltado: { className: "r" } })}</p>,
    );
    // El ÚNICO elemento que entra es el de la marca del catálogo.
    expect([...container.querySelectorAll("p *")].map((e) => e.tagName)).toEqual(["SPAN"]);
    expect(container.querySelector("script, b, img, i")).toBeNull();
    expect(container.textContent).toBe(`${CRUDO} <i>dentro</i>`);
  });

  it("lo que llega por parámetro no se interpreta: ni HTML ni marcas", () => {
    const espacio = { k: "ganó {enlace:{reto}}" } as const;
    const { container } = render(
      <p>
        {crearTRico(espacio, "es")(
          "k",
          { enlace: { href: "/r" } },
          { reto: "<b>x</b> {resaltado:y} {n}" },
        )}
      </p>,
    );
    expect([...container.querySelectorAll("p *")].map((e) => e.tagName)).toEqual(["A"]);
    expect(container.querySelector("a")!.textContent).toBe("<b>x</b> {resaltado:y} {n}");
  });

  it("una marca que no está en el catálogo (no compila; si llegara) deja sus palabras, sin etiqueta", () => {
    const espacio = { k: "hola {parpadeo:mundo}" } as const;
    // @ts-expect-error — es justo lo que no compila; aquí se mira qué haría si llegara igualmente
    const nodo = crearTRico(espacio, "es")("k", { parpadeo: {} });
    const { container } = render(<p>{nodo}</p>);
    expect(container.innerHTML).toBe("<p>hola mundo</p>");
  });
});

describe("el pseudo-idioma xx respeta el formato", () => {
  it("el resaltado del hero sigue siendo un <span> con su clase, con las palabras cambiadas dentro", () => {
    const xx = pseudoDiccionario(es);
    const { container } = render(
      <p>
        {crearTRico(xx.inicio, "es")("mayorPremio", {
          resaltado: { className: "font-medium text-text" },
        })}
      </p>,
    );
    const span = container.querySelector("span.font-medium.text-text");
    expect(span, "el resaltado se perdió en xx").not.toBeNull();
    expect(span!.textContent).toBe("måýöŕ pŕémîö");
    expect(container.textContent).toMatch(/^\[Él måýöŕ pŕémîö éñ jüégö åhöŕå mîšmö ·+\]$/);
    expect(container.textContent).not.toMatch(/[{}]/);
  });

  it("y el enlace con un parámetro dentro, también", () => {
    const xx = pseudoDiccionario(es);
    const { container } = render(
      <p>{crearTRico(xx.inicio, "es")("gano", { enlace: { href: "/r" } }, { reto: "Reto X" })}</p>,
    );
    // El parámetro es contenido de una persona: no se acentúa; lo de alrededor, sí.
    expect(container.querySelector("a")!.textContent).toBe("Reto X");
    expect(container.textContent).toMatch(/^\[gåñó Reto X ·+\]$/);
  });
});

describe("plurales y números, como en `t`", () => {
  it("la forma la elige `n`, y el `{n}` lo formatea la P1", () => {
    const tr = crearTRico(es.inicio, "es");
    const pinta = (n: number) => render(<p>{tr("abiertos", { oculto: {} }, { n })}</p>).container;
    expect(pinta(1).innerHTML).toBe('<p>1<span class="sr-only"> abierto</span></p>');
    expect(pinta(1234).innerHTML).toBe('<p>1234<span class="sr-only"> abiertos</span></p>');
  });
});

describe("la marca `salto` (P5b2a): el corte de línea de un titular", () => {
  it("pinta un `<br>` donde la plantilla lo dice, y nada más", () => {
    const t = crearTRico(es.destacados, "es");
    const { container } = render(<h1>{t("titular", { salto: {} })}</h1>);
    expect(container.innerHTML).toBe("<h1>Bajo los focos<br>ahora mismo</h1>");
  });

  it("y el pseudo-idioma la conserva (si no, el titular saldría sin corte en `xx`)", () => {
    const pseudo = pseudoDiccionario(es).destacados.titular;
    expect(pseudo).toContain("{salto:}");
    const t = crearTRico({ titular: pseudo }, "es");
    const { container } = render(<h1>{t("titular", { salto: {} })}</h1>);
    expect(container.querySelectorAll("br")).toHaveLength(1);
  });
});

describe("las marcas `pendiente` y `externo` (P5b2b)", () => {
  const MARCAS = {
    resaltado: { className: "r" },
    pendiente: { className: "p" },
    externo: { hrefs: ["https://a.test", "https://b.test"], className: "e" },
  };

  it("`pendiente` es un <mark> con su clase, en la misma frase que otro resaltado", () => {
    const t = crearTRico(
      { x: "{resaltado:Ojo.} Falta {pendiente:[PENDIENTE — dato]} aquí" } as const,
      "es",
    );
    const { container } = render(<p>{t("x", MARCAS)}</p>);
    expect(container.innerHTML).toBe(
      '<p><span class="r">Ojo.</span> Falta <mark class="p">[PENDIENTE — dato]</mark> aquí</p>',
    );
  });

  it("`externo`: un <a href> normal por enlace, cada uno con el SUYO, en el orden de la frase", () => {
    const t = crearTRico({ x: "De {externo:A} y de {externo:B}." } as const, "es");
    const { container } = render(<p>{t("x", MARCAS)}</p>);
    expect(container.innerHTML).toBe(
      '<p>De <a href="https://a.test" class="e">A</a> y de <a href="https://b.test" class="e">B</a>.</p>',
    );
  });

  it("y uno de más, sin destino, deja sus palabras: nunca un enlace a ninguna parte", () => {
    const t = crearTRico({ x: "{externo:A}, {externo:B} y {externo:C}" } as const, "es");
    const { container } = render(<p>{t("x", MARCAS)}</p>);
    expect(container.querySelectorAll("a")).toHaveLength(2);
    expect(container.textContent).toBe("A, B y C");
  });

  it("y el pseudo-idioma conserva las dos (si no, en `xx` asomarían las llaves)", () => {
    const pseudo = pseudoDiccionario(es).privacidad.s5_fuentes;
    const t = crearTRico({ x: pseudo }, "es");
    const { container } = render(<p>{t("x", MARCAS)}</p>);
    expect(container.querySelectorAll("a")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/[{}]/);
  });
});
