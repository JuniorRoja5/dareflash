/**
 * LA SUBIDA DICE LA VERDAD.
 *
 * Antes había UN mensaje —"revisa tu conexión"— para cualquier fallo, y un "procesando" mudo que
 * significaba a la vez "van bytes", "está en cola" y "quién sabe". Estos tests fijan que cada señal
 * real lleve a un estado distinto, y sobre todo el invariante que más caro sale romper: no se le dice
 * a nadie que su vídeo está a salvo hasta que la subida haya CERRADO.
 *
 * Para romperlos a propósito (que es la comprobación de verdad, no el verde):
 *  - hacer que `clasificarFalloSubida` devuelva siempre "sin-conexion"  -> caen 3 casos;
 *  - hacer que `estadoEnVuelo` mire el porcentaje en vez de `subidaCompleta` -> cae el invariante;
 *  - meter un literal de copy a mano en el modal -> cae el test estructural.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  clasificarFalloSubida,
  COPY_SUBIDA,
  copySubida,
  esFallo,
  ESTADOS_FALLO,
  ESTADOS_FALLO_SUBIDA,
  estadoEnVuelo,
  estadoTrasSondeo,
  puedeReintentar,
  sondeoSigueAbierto,
  type EstadoSubida,
  type EstadoVideoSondeo,
} from "../src/lib/estado-subida";

describe("el fallo dice su causa REAL, no un genérico", () => {
  it("0 bytes y sin respuesta -> problema de conexión (NO 'codificando', NO genérico)", () => {
    // El caso del brief: la subida arrancó, no salió nada, se cayó la red.
    const estado = clasificarFalloSubida({ bytesEnviados: 0, estadoHttp: null });
    expect(estado).toBe("sin-conexion");
    expect(estado).not.toBe("en-cola");
  });

  it("bytes fuera y sin respuesta -> corte a mitad, que NO es lo mismo", () => {
    // Si esto colapsara con el anterior, al usuario cuya conexión FUNCIONA se le diría que la revise.
    const corte = clasificarFalloSubida({ bytesEnviados: 1, estadoHttp: null });
    const sinNada = clasificarFalloSubida({ bytesEnviados: 0, estadoHttp: null });
    expect(corte).toBe("corte");
    expect(corte).not.toBe(sinNada);
  });

  it("un byte basta para que sea un corte: la frontera está en 0, no en un umbral inventado", () => {
    expect(clasificarFalloSubida({ bytesEnviados: 1, estadoHttp: null })).toBe("corte");
    expect(clasificarFalloSubida({ bytesEnviados: 0, estadoHttp: null })).toBe("sin-conexion");
  });

  it("Bunny respondió: 401/403 es la credencial, otro 4xx es el fichero, 5xx es suyo", () => {
    // Tres acciones distintas del usuario: rearrancar, cambiar de vídeo, esperar. Tres estados.
    expect(clasificarFalloSubida({ bytesEnviados: 0, estadoHttp: 401 })).toBe("credencial");
    expect(clasificarFalloSubida({ bytesEnviados: 10, estadoHttp: 403 })).toBe("credencial");
    expect(clasificarFalloSubida({ bytesEnviados: 10, estadoHttp: 413 })).toBe("rechazo");
    expect(clasificarFalloSubida({ bytesEnviados: 10, estadoHttp: 415 })).toBe("rechazo");
    expect(clasificarFalloSubida({ bytesEnviados: 10, estadoHttp: 503 })).toBe("servidor-ocupado");
  });

  it("haber respondido MANDA sobre los bytes: un 503 con 0 bytes no es 'sin conexión'", () => {
    // Hubo respuesta, luego hubo conexión. Decir lo contrario manda al usuario a mirar su wifi.
    expect(clasificarFalloSubida({ bytesEnviados: 0, estadoHttp: 503 })).toBe("servidor-ocupado");
  });

  it("las cinco causas son estados DISTINTOS (colapsar dos rompe esto)", () => {
    const casos: { bytesEnviados: number; estadoHttp: number | null }[] = [
      { bytesEnviados: 0, estadoHttp: null },
      { bytesEnviados: 5, estadoHttp: null },
      { bytesEnviados: 5, estadoHttp: 401 },
      { bytesEnviados: 5, estadoHttp: 400 },
      { bytesEnviados: 5, estadoHttp: 500 },
    ];
    const distintos = new Set(casos.map(clasificarFalloSubida));
    expect(distintos.size).toBe(casos.length);
    // Cubren TODAS las causas de fallo del TRANSPORTE. Los fallos de CODIFICACIÓN no salen de aquí
    // (no los produce el `onError` de la subida, sino el estado que reporta el servidor después).
    expect(distintos.size).toBe(ESTADOS_FALLO_SUBIDA.length);
    for (const e of ESTADOS_FALLO_SUBIDA) expect(distintos.has(e)).toBe(true);
  });

  it("todos los fallos se reconocen como fallo, y ningún estado sano lo hace", () => {
    for (const e of ESTADOS_FALLO) expect(esFallo(e)).toBe(true);
    for (const e of ["preparando", "subiendo", "en-cola", "listo"] as const) {
      expect(esFallo(e)).toBe(false);
    }
  });

  it("reintentar el MISMO fichero solo se ofrece cuando sirve de algo", () => {
    // Un rechazo del fichero no se arregla reintentando: ofrecerlo sería mandar al usuario a un bucle.
    expect(puedeReintentar("corte")).toBe(true);
    expect(puedeReintentar("servidor-ocupado")).toBe(true);
    expect(puedeReintentar("credencial")).toBe(true);
    expect(puedeReintentar("rechazo")).toBe(false);
  });
});

describe("nunca se dice 'en cola' antes de que la subida haya cerrado", () => {
  it("mientras van bytes, el estado es 'subiendo'", () => {
    expect(estadoEnVuelo({ subidaCompleta: false, bytesEnviados: 10, bytesTotales: 100 })).toBe(
      "subiendo",
    );
  });

  it("AL 100 % pero sin cerrar SIGUE siendo 'subiendo' — este es el invariante duro", () => {
    // TUS marca 100 % cuando ha enviado el cuerpo, no cuando el último PATCH ha respondido. Si esa
    // última petición falla, ya le habríamos dicho al usuario que su vídeo estaba a salvo.
    expect(estadoEnVuelo({ subidaCompleta: false, bytesEnviados: 100, bytesTotales: 100 })).toBe(
      "subiendo",
    );
  });

  it("solo la subida CERRADA da 'en-cola', aunque los bytes no cuadren", () => {
    expect(estadoEnVuelo({ subidaCompleta: true, bytesEnviados: 0, bytesTotales: 0 })).toBe(
      "en-cola",
    );
  });
});

describe("el desenlace de la codificación se cuenta, no se oculta", () => {
  it("sigue codificando -> 'en cola', y el sondeo continúa", () => {
    expect(estadoTrasSondeo("procesando")).toBe("en-cola");
    expect(sondeoSigueAbierto("en-cola")).toBe(true);
  });

  it("publicado -> listo, y se deja de preguntar", () => {
    expect(estadoTrasSondeo("publicado")).toBe("listo");
    expect(sondeoSigueAbierto("listo")).toBe(false);
  });

  it("la codificación FALLÓ -> se dice, no se sigue esperando (el agujero que había)", () => {
    // ESTE es el bug: se sondeaba /reproduccion, que devuelve 404 tanto para "en cola" como para
    // "falló". El usuario se quedaba mirando "aparecerá cuando esté listo" ante un vídeo que no iba
    // a aparecer nunca, y perdía su participación sin enterarse mientras aún podía subir otra.
    const estado = estadoTrasSondeo("error");
    expect(estado).toBe("fallo-codificacion");
    expect(estado).not.toBe("en-cola");
    expect(esFallo(estado)).toBe(true);
    expect(sondeoSigueAbierto(estado)).toBe(false);
  });

  it("demasiado largo -> su propio mensaje, porque la acción del usuario es distinta", () => {
    // "No se pudo preparar" mandaría a subir otro vídeo; aquí lo que hay que hacer es RECORTAR el
    // mismo. Colapsarlos daría un consejo equivocado.
    const largo = estadoTrasSondeo("demasiado-largo");
    expect(largo).toBe("demasiado-largo");
    expect(largo).not.toBe(estadoTrasSondeo("error"));
    expect(copySubida(largo)).toMatch(/90 segundos/);
  });

  it("ningún desenlace terminal ofrece reintentar el mismo fichero", () => {
    // Volver a subir el mismo vídeo que no se pudo codificar (o que dura de más) da el mismo final.
    expect(puedeReintentar("fallo-codificacion")).toBe(false);
    expect(puedeReintentar("demasiado-largo")).toBe(false);
  });

  it("todos los estados del servidor tienen traducción: ninguno cae en 'en-cola' por descarte", () => {
    const delServidor: EstadoVideoSondeo[] = [
      "procesando",
      "publicado",
      "demasiado-largo",
      "no-disponible",
      "error",
    ];
    // Si alguien añadiera un caso y lo dejara sin mapear, `estadoTrasSondeo` devolvería undefined
    // (el switch no tiene `default` que lo tape) y esto se caería.
    for (const e of delServidor) expect(estadoTrasSondeo(e)).toBeDefined();
    // Y solo UNO de ellos deja el sondeo abierto: el que de verdad sigue en curso.
    const abiertos = delServidor.filter((e) => sondeoSigueAbierto(estadoTrasSondeo(e)));
    expect(abiertos).toEqual(["procesando"]);
  });
});

describe("el copy es humano, bilingüe y no promete de más", () => {
  const TODOS: EstadoSubida[] = [
    "preparando",
    "subiendo",
    "en-cola",
    "listo",
    "sin-conexion",
    "corte",
    "credencial",
    "rechazo",
    "servidor-ocupado",
    "fallo-codificacion",
    "demasiado-largo",
  ];

  it("cada estado tiene texto en ES y en EN", () => {
    for (const e of TODOS) {
      expect(COPY_SUBIDA[e]?.es.length ?? 0).toBeGreaterThan(10);
      expect(COPY_SUBIDA[e]?.en.length ?? 0).toBeGreaterThan(10);
    }
    // Sin estados de más ni de menos: el catálogo y el tipo no se separan sin que esto se caiga.
    expect(Object.keys(COPY_SUBIDA).sort()).toEqual([...TODOS].sort());
  });

  it("ningún texto enseña un código crudo ni jerga técnica", () => {
    const prohibido = /\b(40[0-9]|41[0-9]|50[0-9]|PENDING|FAILED|tus|TUS|Bunny|HTTP|null)\b/;
    for (const e of TODOS) {
      expect(COPY_SUBIDA[e]?.es).not.toMatch(prohibido);
      expect(COPY_SUBIDA[e]?.en).not.toMatch(prohibido);
    }
  });

  it("no se promete un plazo que no conocemos", () => {
    // La cola de codificación no nos dice cuánto tarda. "En un momento" es una promesa inventada.
    const promesas = /en un momento|enseguida|in a moment|shortly|any second/i;
    for (const e of TODOS) {
      expect(COPY_SUBIDA[e]?.es).not.toMatch(promesas);
      expect(COPY_SUBIDA[e]?.en).not.toMatch(promesas);
    }
  });

  it("tampoco se promete REANUDAR: hoy el reintento empieza de cero", () => {
    // Se escribió esta promesa por inercia ("TUS es reanudable") sin que el botón la cumpla: reintentar
    // pide credencial nueva y sube desde el principio. Si algún día se reanuda de verdad, este test es
    // el que obliga a cambiar las dos cosas a la vez.
    const reanudar = /donde lo dejó|donde lo dejo|reanud|pick up where|resume/i;
    for (const e of TODOS) {
      expect(COPY_SUBIDA[e]?.es).not.toMatch(reanudar);
      expect(COPY_SUBIDA[e]?.en).not.toMatch(reanudar);
    }
  });

  it("'en cola' dice que el vídeo está A SALVO: es lo que evita que parezca que se ha perdido", () => {
    expect(copySubida("en-cola")).toMatch(/a salvo/i);
    expect(COPY_SUBIDA["en-cola"].en).toMatch(/safe/i);
  });

  it("el fallo de conexión y el de corte NO dicen lo mismo", () => {
    expect(copySubida("sin-conexion")).not.toBe(copySubida("corte"));
    // Al del corte NO se le manda a revisar la conexión: su conexión funciona.
    expect(copySubida("corte")).toMatch(/funciona/i);
  });
});

/**
 * ESTRUCTURAL: el modal no puede volver a tener su propio copy ni su propio genérico. Si alguien
 * reintroduce un literal de error a mano, o vuelve al mensaje único, esto se pone rojo.
 */
describe("el modal usa la fuente única de estado y copy", () => {
  const RUTA = "src/app/(app)/(shell)/crear/modal-subida.tsx";
  const fuente = (): string =>
    readFileSync(path.resolve(__dirname, "..", RUTA), "utf8")
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("importa el módulo de estado en vez de decidir por su cuenta", () => {
    const src = fuente();
    expect(src).toMatch(/from "@\/lib\/estado-subida"/);
    expect(src).toContain("clasificarFalloSubida(");
  });

  it("el genérico único ya no existe", () => {
    // Este era el texto que se comía las cuatro causas.
    expect(fuente()).not.toContain("No se pudo subir el vídeo. Revisa tu conexión");
  });

  it("el 'procesando' mudo tampoco", () => {
    expect(fuente()).not.toContain("Lo estamos procesando");
  });

  it("arranca en 'preparando', no en 'subiendo': pedir permiso no es mover bytes", () => {
    const src = fuente();
    const preparando = src.indexOf('setEstado("preparando")');
    const credencial = src.indexOf("upload-credential");
    expect(preparando).toBeGreaterThan(-1);
    // Si se pusiera "subiendo" antes de tener permiso, la barra diría 0 % mientras no sube nada, y un
    // rechazo por REGLAS (reto cerrado, participación bloqueada) se leería como un fallo de red.
    expect(preparando).toBeLessThan(credencial);
    expect(src).not.toMatch(/setEstado\("subiendo"\)/);
  });

  it("NO vuelve a preguntar por /reproduccion: esa ruta no distingue 'en cola' de 'falló'", () => {
    const src = fuente();
    // Es exactamente el agujero que se tapa: 404 para los dos desenlaces -> espera eterna ante un
    // vídeo fallido. Si alguien reintroduce ese sondeo, el usuario vuelve a quedarse sin saberlo.
    expect(src).not.toMatch(/\/reproduccion`/);
    expect(src).toContain("estadoTrasSondeo(");
    expect(src).toContain("sondeoSigueAbierto(");
  });

  it("el reemplazo solo se cierra si el vídeo nuevo llegó a publicarse", () => {
    // Cerrar el swap con un vídeo que falló sustituiría la participación BUENA por una que no existe.
    expect(fuente()).toMatch(/desenlace === "listo" && esReemplazo/);
  });

  it("lee el estado HTTP real del error para poder clasificarlo", () => {
    // Sin `originalResponse` no hay forma de distinguir "no hubo respuesta" de "respondió y dijo que no".
    expect(fuente()).toContain("originalResponse");
  });
});
