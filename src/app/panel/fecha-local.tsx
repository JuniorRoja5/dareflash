"use client";

import { useSyncExternalStore } from "react";

/**
 * UNA FECHA QUE EL ADMIN TECLEÓ, DEVUELTA EN SU MISMA ZONA.
 *
 * ┌─ POR QUÉ ESTO NO ES EL `timeZone: "UTC"` DEL RESTO DEL PANEL ──────────────────────────────┐
 * │ Casi todas las fechas del panel son "esto PASÓ el día X" —un alta, un ajuste de saldo, un    │
 * │ boost— y ahí una zona fija es lo correcto: el hecho es el mismo se mire desde donde se mire, │
 * │ y UTC lo deja sin ambigüedad. Por eso `timeZone: "UTC"` está en diecisiete sitios y no se    │
 * │ toca ninguno.                                                                                 │
 * │                                                                                               │
 * │ La apertura y el cierre de un reto son OTRA COSA: no se observan, se TECLEAN. Y se teclean    │
 * │ en un `<input type="datetime-local">`, que es hora del navegador por definición. Con la       │
 * │ entrada en local y la salida en UTC, el admin de Madrid escribía "cierra el 23 a la 01:00" y  │
 * │ el panel le respondía "22 oct, 23:00": nunca podía confirmar lo que había puesto, y el día    │
 * │ bailaba en los cierres de madrugada. De ahí salía el error de fechas que mataba el reto.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Y POR ESO LLEVA ETIQUETA ─────────────────────────────────────────────────────────────────┐
 * │ Pasar a local sin decirlo cambiaría una ambigüedad por otra: dos fechas juntas en el mismo    │
 * │ panel, una en UTC y otra en local, sin forma de saber cuál es cuál. El "· tu hora" es lo que  │
 * │ hace que la decisión sea legible en pantalla y no solo en este comentario.                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ CON `useSyncExternalStore`, QUE ES LA API PARA ESTO ──────────────────────────────────────┐
 * │ El valor DEPENDE DEL ENTORNO: el servidor corre en UTC y el navegador en la zona de quien    │
 * │ mira, así que servidor y cliente no pueden pintar lo mismo. Eso es exactamente lo que este   │
 * │ hook resuelve: `getServerSnapshot` da el texto en UTC —lo único que el servidor sabe, y lo   │
 * │ que se hidrata sin mismatch— y `getSnapshot` da el local, que React aplica justo después.    │
 * │                                                                                               │
 * │ La alternativa de siempre —un `useState(null)` + `useEffect` que lo rellena— hace lo mismo a  │
 * │ la vista, pero es un `setState` síncrono dentro de un efecto: una renderización en cascada,  │
 * │ y el lint de React 19 la rechaza con razón. Aquí no hay efecto ni estado que sincronizar.     │
 * │                                                                                               │
 * │ `suppressHydrationWarning` NO valdría: calla el aviso pero deja puesto el texto del servidor. │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** No hay nada a lo que suscribirse: la zona del navegador no cambia mientras la página vive. */
const SIN_CAMBIOS = () => () => {};

function formatear(fecha: Date, conHora: boolean, zona?: string): string {
  return fecha.toLocaleString("es-ES", {
    ...(zona ? { timeZone: zona } : {}),
    dateStyle: "medium",
    ...(conHora ? { timeStyle: "short" as const } : {}),
  });
}

export function FechaLocal({
  fecha,
  conHora = true,
  etiqueta = true,
}: {
  fecha: Date;
  /** La hora importa en un reto (abre/cierra a una hora concreta). Sin ella, en una tabla apretada. */
  conHora?: boolean;
  /** El "· tu hora". Se puede quitar cuando la etiqueta ya está en la cabecera de la tabla. */
  etiqueta?: boolean;
}) {
  // Las dos devuelven CADENAS, que se comparan por valor: no hace falta memorizarlas para que
  // React no entre en bucle (que es la trampa de este hook cuando se devuelven objetos).
  const enUtc = formatear(fecha, conHora, "UTC");
  const texto = useSyncExternalStore(
    SIN_CAMBIOS,
    () => formatear(fecha, conHora),
    () => enUtc,
  );

  return (
    <span className="whitespace-nowrap tabular-nums" title={fecha.toISOString()}>
      {texto}
      {/* La etiqueta va SIEMPRE, también durante la hidratación. Condicionarla a que el texto ya
          sea el local la haría desaparecer para quien navegue DESDE UTC —donde las dos cadenas
          coinciden—, y una etiqueta que a veces no está se lee como un fallo. */}
      {etiqueta ? <span className="ml-1 text-2xs text-text-dim">· tu hora</span> : null}
    </span>
  );
}
