/**
 * HISTORIAL DE UNA CAPA a pantalla completa (el feed de un reto abierto sobre el detalle).
 *
 * EL PROBLEMA: una capa que solo vive en estado de React no existe para el navegador. El gesto de
 * ATRÁS del móvil —que es como se cierra cualquier cosa a pantalla completa— no la cierra: navega a la
 * página anterior y saca al usuario del reto entero. Es justo lo que pasaba.
 *
 * EL MECANISMO: al abrir se añade una entrada de historial SIN cambiar la URL. A partir de ahí el
 * atrás consume ESA entrada en vez de navegar, y el `popstate` que dispara es la señal para cerrar. El
 * botón de cerrar y Escape no cierran por su cuenta: piden un `back()`, y el cierre real lo hace el
 * mismo `popstate`. Así los tres caminos acaban EXACTAMENTE en el mismo sitio y el historial nunca
 * queda con una entrada de más (que se notaría en el siguiente atrás, sin capa que cerrar).
 *
 * NO SE TOCA LA URL a propósito: la capa no es enlazable hoy (se abre con lo que la rejilla ya tiene en
 * memoria, que es lo que permite deslizar hacia arriba desde el vídeo por el que se entró). Cambiar la
 * URL sin una ruta que la sirva daría un enlace que al abrirlo no lleva a ninguna parte.
 *
 * Vive aquí, puro y con el historial INYECTADO, porque es lo único de este arreglo que se puede poner
 * en rojo en Node: el resto es un `useEffect` y no hay DOM en los tests.
 */

/** Marca del estado que se empuja. Distingue "esta entrada es mi capa" de cualquier otra del historial. */
export const MARCA_CAPA = "dfCapa";

/** Lo que se usa del `window.history`. Inyectable para testear sin navegador. */
export interface HistorialMinimo {
  pushState(estado: unknown, titulo: string): void;
  back(): void;
}

export interface ControlCapa {
  /** Al ABRIR la capa: una entrada más, misma URL. */
  abrir(): void;
  /** Cierre pedido por la UI (botón o Escape): NO cierra, retrocede. Cerrar lo hará el `popstate`. */
  pedirCierre(): void;
  /** ¿Este `popstate` corresponde a haber salido de la capa? */
  debeCerrar(estado: unknown): boolean;
}

function esEstadoDeCapa(estado: unknown): boolean {
  return typeof estado === "object" && estado !== null && MARCA_CAPA in estado;
}

export function crearControlCapa(historial: HistorialMinimo): ControlCapa {
  return {
    abrir() {
      historial.pushState({ [MARCA_CAPA]: true }, "");
    },
    pedirCierre() {
      historial.back();
    },
    debeCerrar(estado) {
      // Se cierra al llegar a una entrada que NO es la de la capa: es la de debajo, la de la rejilla.
      // Comprobar la marca —y no "cerrar siempre"— evita cerrar por un `popstate` de otra cosa.
      return !esEstadoDeCapa(estado);
    },
  };
}
