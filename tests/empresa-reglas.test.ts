/**
 * LAS REGLAS DE UNA CUENTA DE EMPRESA (Fase 9 · P1), puras y por tanto exactas.
 *
 * Tres cosas que un formulario no puede ser el único en saber:
 *
 *  1. QUÉ PUEDE COMPRAR cada tipo de negocio. La lista la aplicará la ruta que cree campañas (P6);
 *     si viviera en el `<select>`, un negocio digital podría comprar «su ciudad» llamando a la API a
 *     mano y nadie se enteraría.
 *  2. QUÉ PUEDE HACER con su estado. `puedeOperarEmpresa` es una lista BLANCA, no "todas menos las
 *     malas": un estado nuevo entra sin permiso de escritura hasta que alguien lo decida.
 *  3. QUE EL COPY CUBRE LA UNIÓN ENTERA. Un estado sin etiqueta se pinta como un código en la cara
 *     de quien se registró, y eso no lo ve ningún test de tipos: `Record<Union, string>` obliga en
 *     TypeScript, pero una unión que crece junto a un `as` o un cast deja el hueco.
 *
 * Para romperlo a propósito: meter CIUDAD en `MARCA_O_DIGITAL` (rojo el primero y el del espacio);
 * cambiar `puedeOperarEmpresa` por `estado !== "SUSPENDIDA"` (rojo el de la lista blanca); borrar una
 * entrada de `MSG_ESTADO_EMPRESA` (rojo el del copy); quitar el `+02:00` de la fecha de Socio
 * Fundador (rojo el del instante).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALCANCES_POR_NEGOCIO,
  AlcancePublicidadSchema,
  ETIQUETA_ESTADO_EMPRESA,
  ETIQUETA_TIPO_CUENTA,
  ETIQUETA_TIPO_NEGOCIO,
  EstadoEmpresaSchema,
  MSG_ESTADO_EMPRESA,
  MSG_MOTIVO_RECHAZO_EMPRESA,
  MotivoRechazoEmpresaSchema,
  SOCIO_FUNDADOR_CREDITOS,
  SOCIO_FUNDADOR_HASTA_ISO,
  TipoCuentaEmpresaSchema,
  TipoNegocioSchema,
} from "../src/config/constants";
import {
  alcancesPermitidos,
  espacioDeAlcance,
  espacioDeNegocio,
  puedeComprarAlcance,
  puedeOperarEmpresa,
} from "../src/lib/empresa";

describe("qué puede comprar cada tipo de negocio", () => {
  it("el negocio FÍSICO compra lo local, y SOLO lo local", () => {
    expect([...alcancesPermitidos("FISICO")]).toEqual(["CIUDAD", "ESTADO"]);
    expect(puedeComprarAlcance("FISICO", "PAIS")).toBe(false);
    expect(puedeComprarAlcance("FISICO", "GLOBAL")).toBe(false);
  });

  it("una marca o un producto digital NO puede comprar una ciudad", () => {
    // El caso que el encargo nombra explícitamente: no tienen "una ciudad" que anunciar.
    expect(puedeComprarAlcance("MARCA_O_DIGITAL", "CIUDAD")).toBe(false);
    expect(puedeComprarAlcance("MARCA_O_DIGITAL", "ESTADO")).toBe(false);
    expect([...alcancesPermitidos("MARCA_O_DIGITAL")]).toEqual(["PAIS", "GLOBAL"]);
  });

  it("el negocio ONLINE, país o global", () => {
    expect([...alcancesPermitidos("ONLINE")]).toEqual(["PAIS", "GLOBAL"]);
  });

  it("ningún tipo se queda sin nada que comprar", () => {
    for (const t of TipoNegocioSchema.options) {
      expect(alcancesPermitidos(t).length, t).toBeGreaterThan(0);
    }
  });

  it("y el catálogo cubre la unión entera (un tipo nuevo sin alcances sería un alta inútil)", () => {
    expect(Object.keys(ALCANCES_POR_NEGOCIO).sort()).toEqual([...TipoNegocioSchema.options].sort());
  });
});

describe("los dos espacios no se mezclan", () => {
  it("cada alcance pertenece a UN espacio", () => {
    expect(espacioDeAlcance("CIUDAD")).toBe("LOCAL");
    expect(espacioDeAlcance("ESTADO")).toBe("LOCAL");
    expect(espacioDeAlcance("PAIS")).toBe("GLOBAL");
    expect(espacioDeAlcance("GLOBAL")).toBe("GLOBAL");
  });

  it("y cada negocio compra en UN espacio, no en los dos", () => {
    // Es la propiedad que sostiene la separación de espacios: si un tipo pudiera comprar en los dos,
    // la promesa de que el anunciante local no compite con el global dejaría de ser cierta POR
    // CONSTRUCCIÓN y pasaría a depender del reparto.
    for (const t of TipoNegocioSchema.options) {
      const espacios = new Set(alcancesPermitidos(t).map(espacioDeAlcance));
      expect(espacios.size, `${t} compra en ${[...espacios].join(" y ")}`).toBe(1);
      expect(espacioDeNegocio(t)).toBe([...espacios][0]);
    }
  });

  it("solo el negocio FÍSICO compra el espacio LOCAL", () => {
    const locales = TipoNegocioSchema.options.filter((t) => espacioDeNegocio(t) === "LOCAL");
    expect(locales).toEqual(["FISICO"]);
  });
});

describe("qué puede hacer según su estado", () => {
  it("operar es una lista BLANCA: solo VERIFICADA", () => {
    expect(puedeOperarEmpresa("VERIFICADA")).toBe(true);
    for (const e of EstadoEmpresaSchema.options.filter((x) => x !== "VERIFICADA")) {
      expect(puedeOperarEmpresa(e), e).toBe(false);
    }
  });

  it("y entrar al portal no lo decide una función: `requireEmpresa` no filtra por estado", () => {
    // Aquí había un `puedeEntrarAlPortal(estado)` que devolvía `true` siempre. Un test que
    // comprueba que una constante es una constante no vigila nada; lo que hay que poder afirmar es
    // que el GUARD no filtra, y eso se lee en su fuente.
    const guard = readFileSync(
      path.resolve(__dirname, "..", "src", "server", "auth", "empresa-actual.ts"),
      "utf8",
    );
    const cuerpo = guard.slice(guard.indexOf("export async function requireEmpresa"));
    expect(cuerpo).toContain("if (!empresa) throw new SinEmpresa()");
    // Ni un filtro de estado dentro del guard: el estado decide qué PUEDE HACER, no si entra.
    expect(cuerpo).not.toMatch(/estado\s*(===|!==)/);
  });
});

describe("el copy cubre todas las uniones", () => {
  it("cada estado tiene etiqueta Y relato", () => {
    for (const e of EstadoEmpresaSchema.options) {
      expect(ETIQUETA_ESTADO_EMPRESA[e], e).toBeTruthy();
      expect(MSG_ESTADO_EMPRESA[e]?.titulo, e).toBeTruthy();
      expect(MSG_ESTADO_EMPRESA[e]?.cuerpo, e).toBeTruthy();
    }
    expect(Object.keys(MSG_ESTADO_EMPRESA).sort()).toEqual([...EstadoEmpresaSchema.options].sort());
  });

  it("cada motivo de rechazo tiene su frase (es lo que LEE quien se registró)", () => {
    for (const m of MotivoRechazoEmpresaSchema.options) {
      expect(MSG_MOTIVO_RECHAZO_EMPRESA[m], m).toBeTruthy();
    }
    expect(Object.keys(MSG_MOTIVO_RECHAZO_EMPRESA).sort()).toEqual(
      [...MotivoRechazoEmpresaSchema.options].sort(),
    );
  });

  it("y cada tipo, la suya", () => {
    expect(Object.keys(ETIQUETA_TIPO_CUENTA).sort()).toEqual(
      [...TipoCuentaEmpresaSchema.options].sort(),
    );
    expect(Object.keys(ETIQUETA_TIPO_NEGOCIO).sort()).toEqual(
      [...TipoNegocioSchema.options].sort(),
    );
    expect(AlcancePublicidadSchema.options).toHaveLength(4);
  });
});

describe("Socio Fundador: la fecha lleva su zona dentro", () => {
  it("es el final del 30 de junio de 2027 en Madrid, y no en UTC", () => {
    const instante = new Date(SOCIO_FUNDADOR_HASTA_ISO);
    expect(Number.isNaN(instante.getTime())).toBe(false);
    // CEST (+02:00) en junio: el fin del día de Madrid son las 21:59:59.999Z. Sin el desplazamiento
    // escrito, una empresa verificada a las 23:30 de Madrid del día 30 se quedaría fuera del regalo
    // por dos horas, y el fallo no lo vería nadie hasta que alguien reclamara.
    expect(instante.toISOString()).toBe("2027-06-30T21:59:59.999Z");
  });

  it("y regala 90 créditos (días), no una cifra cualquiera", () => {
    expect(SOCIO_FUNDADOR_CREDITOS).toBe(90);
  });
});
