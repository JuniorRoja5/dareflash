import Link from "next/link";

import { anterior, enlacePaginado, siguiente, type Paginacion } from "@/lib/paginacion-pila";

const PASO =
  "inline-block min-h-[38px] rounded-sm border border-line px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised";

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
export function PasosKeyset({
  base,
  aqui,
  proximoCursor,
}: {
  /** Ruta de la lista, sin query: "/puntos", "/referidos". */
  base: string;
  aqui: Paginacion;
  /** Cursor de la siguiente página, o `null` si esta era la última. */
  proximoCursor: string | null;
}) {
  const atras = anterior(aqui);
  const adelante = proximoCursor ? siguiente(aqui, proximoCursor) : null;
  if (!atras && !adelante) return null;

  return (
    <nav aria-label="Paginación" className="mt-6 flex items-center justify-between gap-3">
      {/* Los huecos se rellenan con un `span` vacío para que `justify-between` mantenga a
          "Siguiente" a la derecha cuando no hay "Anterior". */}
      {atras ? (
        <Link href={enlacePaginado(base, atras)} rel="prev" className={PASO}>
          <span aria-hidden="true">←</span> Anterior
        </Link>
      ) : (
        <span />
      )}
      {adelante ? (
        <Link href={enlacePaginado(base, adelante)} rel="next" className={PASO}>
          Siguiente <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
