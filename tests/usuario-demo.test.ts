/**
 * COHERENCIA DEL USUARIO DEMO — fuente unica `USUARIO_DEMO` consumida por /ranking y /perfil, y el
 * NIVEL derivado (no hardcodeado). Con dientes: desincronizar los puntos del ranking respecto a la
 * fuente, o derivar el badge de la puntuacion de VISTA en vez de la global, cae en rojo.
 */
import { describe, expect, it } from "vitest";

import {
  puntosNivel,
  RANKING_MENSUAL,
  RANKING_RETO,
  USUARIO_ACTUAL,
  type FilaRankVista,
} from "../src/app/(app)/(shell)/ranking/ranking-datos";
import { nivelPorPuntos } from "../src/lib/niveles";
import { USUARIO_DEMO } from "../src/lib/usuario-demo";

const filaDemo = (lista: readonly FilaRankVista[]): FilaRankVista =>
  lista.find((f) => f.username === USUARIO_DEMO.username)!;

describe("fuente unica del usuario demo", () => {
  it("el ranking y la fuente comparten username y puntos globales", () => {
    expect(USUARIO_ACTUAL).toBe(USUARIO_DEMO.username);
    expect(filaDemo(RANKING_MENSUAL).puntosGlobales).toBe(USUARIO_DEMO.puntos);
    expect(filaDemo(RANKING_RETO).puntosGlobales).toBe(USUARIO_DEMO.puntos);
  });

  it("Mensual muestra los puntos globales del demo", () => {
    expect(filaDemo(RANKING_MENSUAL).puntos).toBe(USUARIO_DEMO.puntos);
  });

  it("el nivel del demo se DERIVA de los puntos y es Challenger", () => {
    expect(nivelPorPuntos(USUARIO_DEMO.puntos).clave).toBe("challenger");
  });
});

describe("el badge de nivel sale de los puntos GLOBALES (no de la vista)", () => {
  it("usuario_demo es Challenger en Mensual Y en Top 20", () => {
    // la puntuacion MOSTRADA difiere entre vistas...
    expect(filaDemo(RANKING_MENSUAL).puntos).not.toBe(filaDemo(RANKING_RETO).puntos);
    // ...pero el nivel (via puntosNivel -> globales) es el mismo en las dos
    expect(nivelPorPuntos(puntosNivel(filaDemo(RANKING_MENSUAL))).clave).toBe("challenger");
    expect(nivelPorPuntos(puntosNivel(filaDemo(RANKING_RETO))).clave).toBe("challenger");
  });

  it("control: derivar de la puntuacion de vista daria Elite en Top 20 (por eso NO se usa)", () => {
    expect(nivelPorPuntos(filaDemo(RANKING_RETO).puntos).clave).toBe("elite");
    expect(puntosNivel(filaDemo(RANKING_RETO))).not.toBe(filaDemo(RANKING_RETO).puntos);
  });
});
