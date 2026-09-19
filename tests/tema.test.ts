/**
 * EL TEMA — la pieza pura. Dos temas, uno por defecto, y una cookie que NO es una credencial.
 *
 * Para romperlo a propósito: devolver "claro" ante un valor desconocido (el sitio cambiaría de tema
 * por una cookie manipulada), o marcar la cookie `HttpOnly` (el conmutador dejaría de poder
 * escribirla y el cambio no sobreviviría a la recarga).
 */
import { describe, expect, it } from "vitest";

import {
  atributoTema,
  cookieDeTema,
  TEMA_COLOR_BARRA,
  TEMA_COOKIE,
  TEMA_COOKIE_MAX_EDAD_S,
  TEMA_POR_DEFECTO,
  temaContrario,
  temaDesdeCookie,
} from "../src/lib/tema";

describe("temaDesdeCookie", () => {
  it("lee los dos temas que existen", () => {
    expect(temaDesdeCookie("claro")).toBe("claro");
    expect(temaDesdeCookie("oscuro")).toBe("oscuro");
  });

  it("sin cookie, o con basura, el de por defecto: OSCURO", () => {
    expect(TEMA_POR_DEFECTO).toBe("oscuro");
    for (const v of [undefined, null, "", "light", "CLARO", "dark ", "<script>", "1"]) {
      expect(temaDesdeCookie(v), String(v)).toBe("oscuro");
    }
  });
});

describe("atributo y contrario", () => {
  it("el HTML habla en inglés: light/dark", () => {
    expect(atributoTema("claro")).toBe("light");
    expect(atributoTema("oscuro")).toBe("dark");
  });

  it("el conmutador es un interruptor: el contrario, y volver deja igual", () => {
    expect(temaContrario("claro")).toBe("oscuro");
    expect(temaContrario("oscuro")).toBe("claro");
    expect(temaContrario(temaContrario("claro"))).toBe("claro");
  });

  it("cada tema tiene su color de barra del navegador, y son distintos", () => {
    expect(TEMA_COLOR_BARRA.oscuro).toMatch(/^#[0-9a-f]{6}$/);
    expect(TEMA_COLOR_BARRA.claro).toMatch(/^#[0-9a-f]{6}$/);
    expect(TEMA_COLOR_BARRA.claro).not.toBe(TEMA_COLOR_BARRA.oscuro);
  });
});

describe("la cookie", () => {
  it("dura un año, vale para todo el sitio y es Lax", () => {
    const c = cookieDeTema("claro");
    expect(c).toContain(`${TEMA_COOKIE}=claro`);
    expect(c).toContain(`max-age=${TEMA_COOKIE_MAX_EDAD_S}`);
    expect(TEMA_COOKIE_MAX_EDAD_S).toBe(60 * 60 * 24 * 365);
    expect(c).toContain("path=/");
    expect(c).toContain("samesite=lax");
  });

  it("NO es HttpOnly: la escribe el navegador, y no autoriza nada", () => {
    // Una preferencia de lectura no es una credencial. Si fuera HttpOnly, el conmutador no podría
    // guardarla y el tema volvería atrás en cuanto recargaras.
    expect(cookieDeTema("oscuro").toLowerCase()).not.toContain("httponly");
  });
});
