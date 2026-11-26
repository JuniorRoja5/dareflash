import { Enlace } from "@/components/enlace";
import { textos } from "@/textos/servidor";

import {
  anterior,
  enlacePaginado,
  siguiente,
  type ClavesPaginacion,
  type Paginacion,
} from "@/lib/paginacion-pila";

/**
 * 44 px por debajo de escritorio (el mínimo táctil del brief) y 38 con ratón, donde el panel y las
 * listas son más densos. `inline-flex` + `items-center` y no `inline-block` + `py-2`: con la altura
 * mínima subida, el relleno fijo dejaba el texto pegado arriba (fase9-diseno).
 */
const PASO =
  "inline-flex min-h-[44px] items-center gap-1.5 rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised lg:min-h-[38px]";

/**
 * ANTERIOR / SIGUIENTE de una lista por KEYSET. Pasar de página, no acumular: la lista se REEMPLAZA.
 * Nunca OFFSET —no hay números de página porque no hay `COUNT`— y nunca scroll infinito, que no deja
 * volver ni enlazar un sitio.
 *
 * LOS DOS CONTROLES SE DERIVAN DE LO QUE HAY: "Anterior" existe si queda de dónde desapilar (ver
 * `lib/paginacion-pila`), y "Siguiente" solo si el servicio dijo que queda algo. Ninguno lleva nunca
 * a una página vacía.
 *
 * QUIEN LO MONTA LO PONE FUERA DEL `if` DE SU LISTA. Si una página posterior se queda sin filas
 * —alguien borró algo entre medias—, "Anterior" tiene que seguir ahí o el usuario se queda encerrado
 * en una pantalla vacía sin salida.
 */
export async function PasosKeyset({
  base,
  aqui,
  proximoCursor,
  filtro,
  claves,
  ancla,
  etiqueta,
}: {
  /** Ruta de la lista, sin query: "/puntos", "/referidos". */
  base: string;
  aqui: Paginacion;
  /** Cursor de la siguiente página, o `null` si esta era la última. */
  proximoCursor: string | null;
  /**
   * Lo que la lista está filtrando y tiene que viajar con la posición. Sin esto, "Siguiente" en una
   * lista filtrada lleva a la página dos de la lista SIN filtrar: otra lista, sin avisar.
   */
  filtro?: Readonly<Record<string, string | null | undefined>>;
  /** Nombres de la posición en la URL, si la pantalla tiene más de una lista (ver `enlacePaginado`). */
  claves?: ClavesPaginacion;
  /**
   * El `id` al que vuelve la página al cambiar: con dos listas, la segunda no está arriba, y sin esto
   * «Siguiente» deja a la persona en lo alto de la pantalla, lejos de lo que estaba leyendo.
   */
  ancla?: string;
  /**
   * El nombre del `nav` para un lector de pantalla. Con dos en la misma página, el genérico
   * («Paginación») los haría iguales: cada uno tiene que decir de qué lista es.
   */
  etiqueta?: string;
}) {
  const atras = anterior(aqui);
  const adelante = proximoCursor ? siguiente(aqui, proximoCursor) : null;
  if (!atras && !adelante) return null;
  const t = await textos("paginacion");
  const enlace = (p: Paginacion) =>
    enlacePaginado(base, p, filtro, claves) + (ancla ? `#${ancla}` : "");

  return (
    <nav
      aria-label={etiqueta ?? t("aria")}
      className="mt-6 flex items-center justify-between gap-3"
    >
      {/* Los huecos se rellenan con un `span` vacío para que `justify-between` mantenga a
          "Siguiente" a la derecha cuando no hay "Anterior". */}
      {atras ? (
        <Enlace href={enlace(atras)} rel="prev" className={PASO}>
          <span aria-hidden="true">←</span> {t("anterior")}
        </Enlace>
      ) : (
        <span />
      )}
      {adelante ? (
        <Enlace href={enlace(adelante)} rel="next" className={PASO}>
          {t("siguiente")} <span aria-hidden="true">→</span>
        </Enlace>
      ) : (
        <span />
      )}
    </nav>
  );
}
