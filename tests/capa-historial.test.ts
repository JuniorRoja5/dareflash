/**
 * EL "ATRÁS" CIERRA LA CAPA, NO NAVEGA FUERA.
 *
 * Regresión real en producción: el feed del reto se abría solo como estado de React, así que para el
 * navegador no existía. El gesto de atrás del móvil se llevaba al usuario a `/retos` en vez de cerrar
 * la capa y devolverlo a la rejilla.
 *
 * Con dientes: se prueba con un historial FALSO —una pila de verdad, con su `pushState` y su `back`—
 * en vez de comprobar que se llamó a una función. Así el test falla si el mecanismo deja de cerrar, si
 * navega fuera, o si se descuadra el historial.
 */
import { describe, expect, it, vi } from "vitest";

import { crearControlCapa, type HistorialMinimo, MARCA_CAPA } from "../src/lib/capa-historial";

/**
 * Historial FALSO con la semántica que importa: una pila de estados y un `back()` que desapila y
 * dispara `popstate` con el estado que queda debajo. `navegaciones` cuenta las salidas de la página
 * (lo que hacía el bug): si el `back()` se come la última entrada, el usuario SE VA.
 */
function historialFalso(alVolver: (estado: unknown) => void) {
  const pila: unknown[] = [{ pagina: "/retos/x" }]; // la entrada de la rejilla, ya presente
  let navegaciones = 0;
  const historial: HistorialMinimo = {
    pushState(estado) {
      pila.push(estado);
    },
    back() {
      if (pila.length <= 1) {
        navegaciones += 1; // no queda nada que desapilar: se sale de la página
        return;
      }
      pila.pop();
      alVolver(pila[pila.length - 1]);
    },
  };
  return { historial, pila, salidas: () => navegaciones };
}

describe("abrir la capa deja una entrada en el historial", () => {
  it("añade UNA entrada marcada, y no toca la URL", () => {
    const { historial, pila } = historialFalso(() => {});
    const pushState = vi.spyOn(historial, "pushState");

    crearControlCapa(historial).abrir();

    expect(pila).toHaveLength(2);
    expect(pila[1]).toEqual({ [MARCA_CAPA]: true });
    // Sin tercer argumento: la capa NO es enlazable hoy, así que cambiar la URL daría un enlace que
    // al abrirlo no lleva a ninguna parte.
    expect(pushState).toHaveBeenCalledWith({ [MARCA_CAPA]: true }, "");
  });
});

describe("el atrás cierra la capa en vez de sacarte del reto", () => {
  it("el gesto de atrás cierra, y NO navega fuera", () => {
    let abierta = true;
    let salidaDetectada = 0;
    const { historial, salidas } = historialFalso((estado) => {
      if (control.debeCerrar(estado)) abierta = false;
    });
    const control = crearControlCapa(historial);
    control.abrir();

    historial.back(); // el gesto de atrás del móvil

    expect(abierta).toBe(false);
    salidaDetectada = salidas();
    expect(salidaDetectada).toBe(0); // lo que hacía el bug: irse a /retos
  });

  it("el botón de cerrar recorre EL MISMO camino: no deja una entrada colgando", () => {
    let abierta = true;
    const { historial, pila } = historialFalso((estado) => {
      if (control.debeCerrar(estado)) abierta = false;
    });
    const control = crearControlCapa(historial);
    control.abrir();

    control.pedirCierre(); // el chevron "<" o Escape

    expect(abierta).toBe(false);
    // Y el historial queda como estaba: si el botón cerrase por su cuenta sin retroceder, la entrada
    // se quedaría puesta y el SIGUIENTE atrás no haría nada visible (parecería que se ha colgado).
    expect(pila).toHaveLength(1);
  });

  it("abrir y cerrar varias veces no acumula entradas", () => {
    let abierta = false;
    const { historial, pila, salidas } = historialFalso((estado) => {
      if (control.debeCerrar(estado)) abierta = false;
    });
    const control = crearControlCapa(historial);

    for (let i = 0; i < 3; i += 1) {
      abierta = true;
      control.abrir();
      control.pedirCierre();
      expect(abierta).toBe(false);
    }

    expect(pila).toHaveLength(1);
    expect(salidas()).toBe(0);
  });
});

describe("no se cierra por un `popstate` ajeno", () => {
  it("mientras la entrada de la capa siga siendo la actual, no se cierra", () => {
    const control = crearControlCapa(historialFalso(() => {}).historial);
    // Un `popstate` que aterriza EN la entrada de la capa (p. ej. un `forward`) no debe cerrarla.
    expect(control.debeCerrar({ [MARCA_CAPA]: true })).toBe(false);
  });

  it("cualquier otro estado SÍ cierra: es la entrada de debajo, la de la rejilla", () => {
    const control = crearControlCapa(historialFalso(() => {}).historial);
    for (const estado of [null, undefined, {}, { pagina: "/retos/x" }, "algo"]) {
      expect(control.debeCerrar(estado)).toBe(true);
    }
  });
});
