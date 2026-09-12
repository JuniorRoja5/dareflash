import type { ReactNode } from "react";

import { Avatar } from "./avatar";
import { tokenPuesto } from "./logic";

/**
 * FILA DE PUESTO (ranking) — --df-rank (oro) SOLO en los puestos 1, 2 y 3; el resto en neutro. El
 * oro NUNCA es decorativo (la eleccion vive en `tokenPuesto`, testeada). `tabular-nums` en el puesto
 * y en la cifra. La CIFRA va en NEUTRO, nunca en lima: la lima es solo dinero, y ni las victorias ni
 * los puntos lo son.
 *
 * LA CIFRA ES EL CRITERIO DE ORDEN, y por eso la unidad se pasa desde fuera en vez de estar clavada.
 * Antes decia "pts" siempre; cuando el ranking paso a ordenarse por VICTORIAS del mes, esa fila
 * habria enseñado puntos junto a un orden por victorias — alguien con 1 victoria y 4.000 puntos
 * saliendo DEBAJO de otro con 3 victorias y 90. Un numero que no es el criterio de orden no informa:
 * contradice lo que se ve.
 *
 * `insignia` es un slot OPCIONAL (aditivo): cuando se pasa, se pinta entre el nombre y la cifra
 * (p. ej. la insignia de nivel del ranking). Sin pasarlo, la fila queda igual: el rail de la portada
 * no la pasa.
 *
 * EL AVATAR ES EL DE VERDAD. Antes el hueco era un círculo gris FIJO (`<span class="bg-raised">`),
 * pusiera lo que pusiera el usuario: la foto llegaba del servicio y la fila la tiraba. Ahora pinta el
 * `Avatar` compartido — la foto, y si no hay (o falla la carga) la inicial —, perezoso porque las filas
 * son listas largas. `imagen` es OBLIGATORIA en el tipo a propósito: quien pinte una fila tiene que
 * decir qué foto lleva; olvidarla ya no compila en vez de volver en silencio al círculo vacío.
 */
export function FilaPuesto({
  puesto,
  username,
  imagen,
  cifra,
  unidad,
  activo = false,
  insignia,
}: {
  puesto: number;
  username: string;
  /** URL del avatar (`User.image`), o `null` si no tiene: entonces sale la inicial. */
  imagen: string | null;
  /** El valor POR EL QUE SE ORDENA la lista. */
  cifra: number;
  /** Que es esa cifra ("victorias", "pts"...). Se pinta atenuado, junto al numero. */
  unidad: string;
  activo?: boolean;
  insignia?: ReactNode;
}) {
  const esPodio = tokenPuesto(puesto) === "rank";
  return (
    <div
      className={`flex items-center gap-3 border-b border-line py-2.5 last:border-b-0 ${activo ? "bg-raised" : ""}`}
    >
      <span
        className="w-7 shrink-0 text-right text-lg font-semibold tabular-nums"
        style={{ color: esPodio ? "var(--color-rank)" : "var(--color-text-dim)" }}
      >
        {puesto}
      </span>
      <Avatar nombre={username} imagen={imagen} tamano="sm" perezosa />
      <span className="min-w-0 flex-1 truncate font-medium">@{username}</span>
      {insignia ? <span className="shrink-0">{insignia}</span> : null}
      {/* la cifra: NEUTRO, jamas --df-money (ni victorias ni puntos son dinero) */}
      <span className="shrink-0 text-sm tabular-nums text-text-dim">
        {cifra.toLocaleString("en-US")} {unidad}
      </span>
    </div>
  );
}
