/**
 * BOTON polimorfico — test ESTRUCTURAL con dientes. Sin `href` renderiza <button type="button">; con
 * `href`, un <a> (Link) con ese href. Se renderiza a HTML estatico con react-dom/server SIN JSX
 * (createElement) ni DOM: encaja en el entorno `node` de vitest, sin dependencias nuevas. `next/link`
 * se dobla a un <a> simple (no necesita el contexto del router). Romper la eleccion (renderizar <a>
 * sin href, o <button> con href) o dejar de pasar el href al enlace cae en ROJO.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (props: Record<string, unknown>) => createElement("a", props),
}));

import { Boton } from "@/components/ui/boton";

describe("Boton polimorfico (estructural, con dientes)", () => {
  it('SIN href renderiza <button type="button"> y NO un <a>', () => {
    const html = renderToStaticMarkup(createElement(Boton, {}, "Hola"));
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href=");
  });

  it("CON href renderiza <a> (Link) con ESE href y NO un <button>", () => {
    const html = renderToStaticMarkup(createElement(Boton, { href: "/crear" }, "Hola"));
    expect(html).toContain("<a");
    expect(html).toContain('href="/crear"');
    expect(html).not.toContain("<button");
  });

  it("el enlace conserva los tokens de la variante (principal = magenta: bg-action + text-void)", () => {
    const html = renderToStaticMarkup(
      createElement(Boton, { href: "/crear", variante: "principal" }, "x"),
    );
    expect(html).toContain("bg-action");
    expect(html).toContain("text-void");
  });

  it("el enlace atenuado usa el filete secundario (border-line), sin relleno magenta", () => {
    const html = renderToStaticMarkup(
      createElement(Boton, { href: "/inicio", variante: "secundario" }, "x"),
    );
    expect(html).toContain("border-line");
    expect(html).not.toContain("bg-action");
  });

  it("la forma <button> conserva el spread de atributos (aria-label, disabled)", () => {
    const html = renderToStaticMarkup(
      createElement(Boton, { "aria-label": "Guardar", disabled: true }, "x"),
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Guardar"');
    expect(html).toContain("disabled");
  });
});
