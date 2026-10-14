/**
 * EL CIFRADO DE LOS DATOS DE PAGO. Es lo único que separa un IBAN de estar en claro en una copia de
 * seguridad, así que se prueba directamente y no solo a través de quien lo usa.
 *
 * Este fichero nació de un diente VERDE FALSO: rompí el "falla cerrada" de la derivación de clave
 * —hice que devolviera una clave de pega en vez de lanzar— y todo siguió verde, porque el único
 * test que había miraba la PUERTA (`cifradoDePagosDisponible`) y nunca llegaba al cifrador. Las dos
 * defensas son buenas; lo que no valía era tener atada solo una.
 *
 * Para romperlo a propósito: devolver una clave por defecto sin secreto (rojo), usar un IV fijo
 * (rojo: dos cifrados iguales), o quitar la etiqueta de autenticación (rojo: se puede manipular).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRETO = "s".repeat(40);
const IBAN = "ES9121000418450200051332";

/** Importa el módulo con el entorno que se le diga. `resetModules` para que `env` no se cachee. */
async function modulo(pagosSecret: string | undefined) {
  vi.resetModules();
  vi.doMock("@/config/env", () => ({ env: { PAGOS_SECRET: pagosSecret } }));
  return import("../src/server/security/cifrado-pagos");
}

afterEach(() => {
  vi.doUnmock("@/config/env");
  vi.resetModules();
});

describe("ida y vuelta", () => {
  it("lo cifrado se descifra igual", async () => {
    const { cifrarDatoDePago, descifrarDatoDePago } = await modulo(SECRETO);
    const guardado = cifrarDatoDePago(IBAN);
    expect(guardado).not.toContain(IBAN);
    expect(descifrarDatoDePago(guardado)).toBe(IBAN);
  });

  it("el formato lleva su VERSIÓN delante, para poder rotar algún día", async () => {
    const { cifrarDatoDePago } = await modulo(SECRETO);
    const partes = cifrarDatoDePago(IBAN).split(":");
    expect(partes[0]).toBe("v1");
    expect(partes).toHaveLength(4);
  });

  it("cifrar dos veces el MISMO dato da dos resultados distintos", async () => {
    // El IV es aleatorio en cada llamada, y con GCM eso no es opcional: repetir un IV con la misma
    // clave rompe el cifrado entero, no solo ese mensaje. Si alguien lo fija, esto cae.
    const { cifrarDatoDePago } = await modulo(SECRETO);
    expect(cifrarDatoDePago(IBAN)).not.toBe(cifrarDatoDePago(IBAN));
  });
});

describe("no se puede manipular lo guardado", () => {
  it("cambiar un carácter del dato hace que descifrar FALLE", async () => {
    // Es la diferencia entre cifrar y cifrar CON AUTENTICACIÓN: aquí no se puede cambiar un dígito
    // de un IBAN guardado y que salga otro IBAN válido al leerlo. GCM lo detecta y lanza.
    const { cifrarDatoDePago, descifrarDatoDePago } = await modulo(SECRETO);
    const partes = cifrarDatoDePago(IBAN).split(":");
    const dato = partes[3]!;
    partes[3] = (dato[0] === "A" ? "B" : "A") + dato.slice(1);
    expect(() => descifrarDatoDePago(partes.join(":"))).toThrow();
  });

  it("y un formato desconocido se rechaza en vez de intentarlo", async () => {
    const { descifrarDatoDePago } = await modulo(SECRETO);
    expect(() => descifrarDatoDePago("v9:a:b:c")).toThrow(/formato desconocido/i);
    expect(() => descifrarDatoDePago(IBAN)).toThrow(/formato desconocido/i);
  });

  it("otro secreto no abre lo cifrado con el primero", async () => {
    const { cifrarDatoDePago } = await modulo(SECRETO);
    const guardado = cifrarDatoDePago(IBAN);
    const { descifrarDatoDePago } = await modulo("o".repeat(40));
    expect(() => descifrarDatoDePago(guardado)).toThrow();
  });
});

describe("sin secreto, falla CERRADA", () => {
  it("cifrar lanza en vez de devolver algo que parece cifrado", async () => {
    // Lo contrario —una clave por defecto, un `return texto`— daría una columna con pinta de estar
    // protegida que no protege nada. Que falle es ruidoso, y lo ruidoso se arregla.
    const { cifrarDatoDePago, cifradoDePagosDisponible } = await modulo(undefined);
    expect(cifradoDePagosDisponible()).toBe(false);
    expect(() => cifrarDatoDePago(IBAN)).toThrow(/PAGOS_SECRET/);
  });

  it("y descifrar tampoco se inventa nada", async () => {
    const { cifrarDatoDePago } = await modulo(SECRETO);
    const guardado = cifrarDatoDePago(IBAN);
    const { descifrarDatoDePago } = await modulo(undefined);
    expect(() => descifrarDatoDePago(guardado)).toThrow(/PAGOS_SECRET/);
  });
});

describe("la pista es lo único que se puede enseñar", () => {
  it("son cuatro caracteres, y no identifican la cuenta", async () => {
    const { pistaDeDestino } = await modulo(SECRETO);
    expect(pistaDeDestino(IBAN)).toBe("1332");
    expect(pistaDeDestino(IBAN)).toHaveLength(4);
    // Con más, una dirección de cripto acabaría identificando la cartera por acumulación de pistas.
    expect(pistaDeDestino("0x52908400098527886E0F7030069857D2E4169EE7")).toBe("9EE7");
  });

  it("y los espacios no cuentan: la pista de un IBAN escrito con huecos es la misma", async () => {
    const { pistaDeDestino } = await modulo(SECRETO);
    expect(pistaDeDestino("ES91 2100 0418 4502 0005 1332")).toBe("1332");
  });
});
