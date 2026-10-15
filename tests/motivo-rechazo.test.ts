/**
 * POR QUÉ SE RECHAZÓ UN COBRO — la lista cerrada, su copy y el fail-open.
 *
 * ┌─ QUIÉN LEE ESTO ──────────────────────────────────────────────────────────────────────────────┐
 * │ La persona a la que le acaban de rechazar su dinero. Por eso el motivo es una LISTA CERRADA y │
 * │ no un campo libre: un texto a mano acaba, un martes con prisa, en un "datos mal", y eso es lo │
 * │ que lee alguien que esperaba 50 $. Y por eso se guarda la CLAVE y no la frase: reescribir el  │
 * │ texto para que se entienda mejor reescribe también los rechazos antiguos.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que se fija aquí, todo puro:
 *  - EL MOTIVO ES OBLIGATORIO al rechazar; "OTRO" exige su texto; y una clave de la lista NO admite
 *    texto (si lo admitiera, el mismo motivo se contaría de dos maneras).
 *  - LA FRASE LA PONE EL COPY, no la fila: cambiar el copy cambia lo que ven los rechazos viejos.
 *  - FAIL-OPEN: una clave que ya no existe cae en una frase genérica en vez de romper o dejar un
 *    hueco. Y el GUARD que impide llegar ahí: toda clave elegible tiene su frase.
 *
 * Para romperlo a propósito: aceptar un motivo vacío (rojo), aceptar `OTRO` sin texto (rojo),
 * devolver la clave cruda en vez de la frase (rojo), o añadir una opción a la lista sin su frase
 * (rojo en el guard).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FRASE_RECHAZO,
  FRASE_RECHAZO_DESCONOCIDO,
  MOTIVO_RECHAZO_LIBRE,
  MotivoRechazoSchema,
} from "@/config/constants";
import { fraseDeRechazo, validarMotivoRechazo } from "../src/lib/retirada";

const TEXTO = "El banco nos devolvió la transferencia sin decir por qué";

describe("el motivo es obligatorio al rechazar", () => {
  it("sin motivo, con uno vacío o con uno que no está en la lista: no pasa", () => {
    for (const motivo of [null, undefined, "", "   ", "LO_QUE_SEA", "otro"]) {
      const r = validarMotivoRechazo(motivo, null);
      expect(r.ok, `motivo ${JSON.stringify(motivo)}`).toBe(false);
      expect(r.ok === false && r.rechazo).toBe("MOTIVO_OBLIGATORIO");
    }
  });

  it("cualquier clave de la lista, sin texto: pasa", () => {
    for (const m of MotivoRechazoSchema.options.filter((o) => o !== MOTIVO_RECHAZO_LIBRE)) {
      expect(validarMotivoRechazo(m, null).ok, m).toBe(true);
      expect(validarMotivoRechazo(m, "").ok, m).toBe(true);
      expect(validarMotivoRechazo(m, "   ").ok, m).toBe(true);
    }
  });
});

describe('"OTRO" es la única que escribe, y la única que puede', () => {
  it("OTRO sin texto, o con un texto que no dice nada: no pasa", () => {
    for (const texto of [null, undefined, "", "   ", "no"]) {
      const r = validarMotivoRechazo(MOTIVO_RECHAZO_LIBRE, texto);
      expect(r.ok, `texto ${JSON.stringify(texto)}`).toBe(false);
      expect(r.ok === false && r.rechazo).toBe("TEXTO_OBLIGATORIO");
    }
  });

  it("OTRO con su texto: pasa", () => {
    expect(validarMotivoRechazo(MOTIVO_RECHAZO_LIBRE, TEXTO).ok).toBe(true);
  });

  it("una clave de la lista CON texto NO pasa: el mismo motivo contado dos veces", () => {
    // Si se admitiera, habría un rechazo con su frase revisada Y un texto escrito al lado, y la
    // pantalla tendría que elegir cuál enseñar. La que se enseña es la revisada, así que el texto
    // sobraría — y lo que sobra, a la larga, se acaba enseñando.
    const r = validarMotivoRechazo("RED_INCORRECTA", TEXTO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.rechazo).toBe("TEXTO_SOBRA");
  });
});

describe("la frase la pone el copy, no la fila", () => {
  it("cada clave de la lista se traduce a SU frase", () => {
    for (const m of MotivoRechazoSchema.options) {
      expect(fraseDeRechazo(m), m).toBe(FRASE_RECHAZO[m]);
    }
  });

  it("y la frase no es la clave: nadie lee un código", () => {
    for (const m of MotivoRechazoSchema.options) {
      const frase = FRASE_RECHAZO[m];
      expect(frase, `falta la frase de ${m}`).toBeTruthy();
      expect(frase).not.toBe(m);
      expect(frase, `${m} enseña su código`).not.toMatch(/[A-Z]{3,}_/);
      // Una frase de una línea no explica un rechazo de dinero.
      expect(frase.length, `la frase de ${m} es demasiado corta`).toBeGreaterThan(30);
    }
  });

  it("OTRO enseña el TEXTO escrito, no su frase de respaldo", () => {
    expect(fraseDeRechazo(MOTIVO_RECHAZO_LIBRE, TEXTO)).toBe(TEXTO);
    // Sin texto —una fila a medias— cae en su frase, no en un hueco.
    expect(fraseDeRechazo(MOTIVO_RECHAZO_LIBRE, "  ")).toBe(FRASE_RECHAZO.OTRO);
  });

  it("y una clave de la lista IGNORA un texto que le hayan colgado", () => {
    // Puede pasar con una fila vieja o un arreglo a mano. Se enseña la frase revisada, que es la
    // que alguien escribió pensando en quién la lee.
    expect(fraseDeRechazo("RED_INCORRECTA", "lo que sea")).toBe(FRASE_RECHAZO.RED_INCORRECTA);
  });
});

describe("fail-open: una clave desconocida no rompe nada", () => {
  it("cae en una frase genérica honesta", () => {
    for (const motivo of ["YA_NO_EXISTE", "renombrada", "123"]) {
      expect(fraseDeRechazo(motivo), motivo).toBe(FRASE_RECHAZO_DESCONOCIDO);
    }
  });

  it("y sin motivo no se inventa ninguno: `null`", () => {
    // Las rechazadas de antes de que esto existiera no tienen motivo. Lo honesto es no decir nada
    // —la vista dirá lo único cierto, que el dinero volvió—, no fabricar una razón.
    expect(fraseDeRechazo(null)).toBeNull();
    expect(fraseDeRechazo(undefined)).toBeNull();
    expect(fraseDeRechazo("")).toBeNull();
  });

  it("el genérico NO se parece a una razón: no finge saber por qué", () => {
    expect(FRASE_RECHAZO_DESCONOCIDO.toLowerCase()).not.toMatch(/porque|debido|motivo:/);
  });
});

describe("el guard: toda clave ELEGIBLE tiene su frase", () => {
  it("la lista cerrada y el copy no se pueden separar", () => {
    // Este es el candado que impide llegar al fail-open: añadir una opción al desplegable sin su
    // frase dejaría a alguien leyendo el genérico en vez del motivo real de su rechazo.
    const sinFrase = MotivoRechazoSchema.options.filter((m) => !FRASE_RECHAZO[m]);
    expect(sinFrase, "hay motivos elegibles sin frase").toEqual([]);

    // Y al revés: una frase sin su clave es copy muerto que nadie verá nunca.
    const claves = new Set<string>(MotivoRechazoSchema.options);
    expect(Object.keys(FRASE_RECHAZO).filter((k) => !claves.has(k))).toEqual([]);
  });

  it("ninguna frase se repite: dos motivos distintos no pueden leerse igual", () => {
    const frases = Object.values(FRASE_RECHAZO);
    expect(new Set(frases).size).toBe(frases.length);
  });

  it("y el motivo libre es UNO solo, y está en la lista", () => {
    expect(MotivoRechazoSchema.options).toContain(MOTIVO_RECHAZO_LIBRE);
  });

  it("el DESPLEGABLE del panel sale de la lista, no de una copia", () => {
    // ┌─ LA MITAD QUE NO SE PUEDE EJECUTAR ─────────────────────────────────────────────────────┐
    // │ Las reglas de arriba prueban que toda clave de la unión tiene frase. Lo que no prueban es│
    // │ que el panel OFREZCA esas claves y no otras: si el `<select>` enumerara sus opciones a   │
    // │ mano, podría ofrecer una que la unión no tiene —el servidor la rechazaría— o quedarse sin│
    // │ una nueva, y todo lo demás seguiría verde. Se mira el código porque el resultado no      │
    // │ distingue (y renderizar el panel para comprobarlo sería montar media sesión de admin).   │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    const vista = readFileSync(
      path.resolve(__dirname, "..", "src", "app", "panel", "monedero", "acciones-retirada.tsx"),
      "utf8",
    ).replace(/^\s*\/\/.*$/gm, "");
    expect(vista, "el desplegable enumera los motivos a mano").toMatch(
      /MotivoRechazoSchema\.options\.map/,
    );
    // Y cada opción tiene su etiqueta corta: una sin ella saldría vacía en el desplegable.
    const etiquetas = /const ETIQUETA_MOTIVO[\s\S]*?\n\};/.exec(vista)?.[0] ?? "";
    for (const m of MotivoRechazoSchema.options) {
      expect(etiquetas, `falta la etiqueta corta de ${m}`).toMatch(new RegExp(`${m}:\\s*"`));
    }
  });

  it("y antes de rechazar se enseña la FRASE, no solo la etiqueta corta", () => {
    // Quien rechaza tiene que ver lo que la persona va a leer: la etiqueta del desplegable es un
    // resumen para elegir, no el mensaje. Sin esto, se envía una frase que nadie revisó al enviarla.
    const vista = readFileSync(
      path.resolve(__dirname, "..", "src", "app", "panel", "monedero", "acciones-retirada.tsx"),
      "utf8",
    ).replace(/^\s*\/\/.*$/gm, "");
    expect(vista).toMatch(/FRASE_RECHAZO\[motivo\]/);
  });
});
