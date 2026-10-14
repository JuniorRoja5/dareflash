/**
 * LAS PÁGINAS LEGALES Y LA CASILLA QUE LAS NOMBRA.
 *
 * La casilla del registro decía "acepto los términos y la política de privacidad" y no enlazaba a
 * ninguna parte: se pedía consentimiento sobre un documento que no se podía leer. Ahora la política
 * existe. Lo que se fija aquí es lo que se puede deshacer sin que falle nada:
 *
 *  - LEER LA POLÍTICA NO CAMBIA EL CONSENTIMIENTO. El enlace vive DENTRO del `<label>` de la
 *    casilla, y un enlace dentro de una etiqueta hereda su comportamiento: al pulsarlo, el navegador
 *    marca o desmarca la casilla además de navegar. En una casilla cualquiera es una molestia; en
 *    una de consentimiento es un fallo — vas a leer qué aceptas y al volver has aceptado otra cosa.
 *  - `/terminos` NO SE ENLAZA MIENTRAS NO EXISTA. Un enlace a una página que no está es un 404 en
 *    mitad de la frase que pide el consentimiento. Se nombra, no se enlaza, y este test se pondrá
 *    rojo el día que la página aparezca — que es cuando toca enlazarla.
 *  - LA PÁGINA ES ESTÁTICA DE VERDAD. Bajo `src/app/**`, leer `env` o `prisma` en ámbito de módulo
 *    se evalúa durante el build y tumba el despliegue (ver CLAUDE.md).
 *  - LOS HUECOS SE VEN. Un documento legal con un dato inventado es peor que uno con un hueco
 *    declarado, así que los `[PENDIENTE]` se pintan, no se disimulan.
 *
 * Para romperlo a propósito: quitar el `stopPropagation` del enlace (rojo), enlazar `/terminos`
 * (rojo), o leer `env` en la página (rojo).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.resolve(RAIZ, rel), "utf8");
/** Sin comentarios: un docblock que EXPLIQUE la regla no la aplica. */
const codigo = (rel: string): string =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PRIVACIDAD = "src/app/privacidad/page.tsx";
const REGISTRO = "src/app/entrar/formulario-registro.tsx";

describe("la política de privacidad existe y se puede leer", () => {
  it("la página está donde dice su ruta", () => {
    expect(existsSync(path.resolve(RAIZ, PRIVACIDAD)), `falta ${PRIVACIDAD}`).toBe(true);
  });

  it("es ESTÁTICA: ni `env`, ni `prisma`, ni sesión", () => {
    // Una página bajo `src/app/**` se prerenderiza en el build, y en el build no hay variables de
    // entorno: un `env` aquí es un despliegue caído, no un fallo de esta página.
    const v = codigo(PRIVACIDAD);
    expect(v, "la página lee env").not.toMatch(/\benv\b|process\.env/);
    expect(v, "la página toca la base de datos").not.toMatch(/prisma|db\/client/);
    expect(v, "la página pide sesión").not.toMatch(/getCurrentUser|requireUser/);
  });

  it("los huecos sin rellenar se VEN", () => {
    // Si alguien los rellena con texto plausible para que "quede bonito", el documento pasa a
    // afirmar datos que nadie ha dado. Mejor un hueco declarado.
    const v = codigo(PRIVACIDAD);
    expect(v).toMatch(/<Pendiente>/);
    expect(v).toMatch(/PENDIENTE/);
  });

  it("y el marcador de hueco no le roba el color a otro significado", () => {
    // ME PASÓ. Lo pinté con `--df-time` porque se veía bien, y ese token es "tiempo restante no
    // crítico" y nada más (MARCA.md: un token, un trabajo). Un hueco pendiente no es tiempo, ni
    // dinero, ni alarma, ni una acción: es una anotación, y va en neutro. Lo que lo hace visible es
    // que rompe el ritmo del texto, no quitarle el color a otro significado.
    const marcador = /function Pendiente[\s\S]*?\n\}/.exec(codigo(PRIVACIDAD))?.[0] ?? "";
    expect(marcador.length, "no encuentro el marcador de hueco").toBeGreaterThan(50);
    for (const token of ["time", "money", "alarm", "action", "ok", "rank"]) {
      expect(marcador, `el marcador usa el color de ${token}`).not.toMatch(
        new RegExp(`\\b(bg|text|border)-${token}\\b`),
      );
    }
  });

  it("y dice en la propia página que todavía no es definitiva", () => {
    // El aviso va EN LA PÁGINA, no solo en un comentario del fuente: quien la lee tiene que saber
    // en qué estado está. Un comentario no se lo cuenta a nadie.
    expect(codigo(PRIVACIDAD)).toMatch(/Documento en preparación/);
  });
});

describe("la casilla del registro: leerla no cambia lo que aceptas", () => {
  const v = codigo(REGISTRO);

  it("nombra la política y la enlaza", () => {
    expect(v).toMatch(/href="\/privacidad"/);
    expect(v).toMatch(/política de privacidad/);
  });

  it("y el enlace CORTA el clic antes de que llegue a la etiqueta", () => {
    // ┌─ EL CASO QUE JUSTIFICA ESTE FICHERO ──────────────────────────────────────────────────────┐
    // │ Sin esto, pulsar "política de privacidad" marca o desmarca la casilla de consentimiento   │
    // │ ADEMÁS de navegar. No falla nada, no salta nada: simplemente vuelves con el consentimiento│
    // │ al revés de como lo dejaste. Se ata a la FORMA concreta y junto al `href`, no sueltos.    │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    expect(v, "el enlace ya no corta la propagación del clic").toMatch(
      /href="\/privacidad"[\s\S]{0,200}?stopPropagation\(\)/,
    );
  });

  it("y la casilla sigue siendo obligatoria", () => {
    // El consentimiento no puede volverse opcional de paso.
    expect(v).toMatch(/type="checkbox"[\s\S]{0,400}?required/);
  });
});

describe("`/terminos` se nombra, pero no se enlaza mientras no exista", () => {
  const existe = existsSync(path.resolve(RAIZ, "src/app/terminos/page.tsx"));

  it("si la página no está, nadie enlaza a ella (sería un 404 pidiendo consentimiento)", () => {
    if (existe) {
      // Ha llegado el texto final: este caso cambia de lado y toca enlazarlo desde el registro.
      expect(codigo(REGISTRO), "`/terminos` ya existe: enlázalo en la casilla").toMatch(
        /href="\/terminos"/,
      );
      return;
    }
    expect(codigo(REGISTRO), "enlaza a `/terminos`, que no existe").not.toMatch(
      /href="\/terminos"/,
    );
    expect(v_terminos_nombrados(), "la casilla dejó de nombrar los términos").toBe(true);
  });

  function v_terminos_nombrados(): boolean {
    return /t[ée]rminos/i.test(codigo(REGISTRO));
  }
});
