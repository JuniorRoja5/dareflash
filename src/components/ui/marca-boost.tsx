import type { CSSProperties, ReactNode } from "react";

import { Avatar, type TamanoAvatar } from "./avatar";

/**
 * LA MARCA "BOOST" — la misma en todas las superficies donde se resalta a quien pagó.
 *
 * ┌─ UNA SOLA FUENTE PARA LA PALABRA Y PARA EL TONO ──────────────────────────────────────────────┐
 * │ Hoy se pinta en tres sitios: la tarjeta de la vitrina, la fila de la portada y el feed (dos    │
 * │ maquetas, móvil y escritorio). Con una copia en cada uno, el día que cambie el tono o la       │
 * │ palabra cambiarían unos y no otros — y "resaltar" dejaría de significar lo mismo según dónde   │
 * │ estuvieras mirando.                                                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ES ESTÁTICA, Y EN EL FEED ESO NO ES NEGOCIABLE: el feed es lo más caro que tiene la app y lo que
 * manda ahí es el vídeo. Nada de halo que respira ni flote; esto es una etiqueta, no un reclamo.
 *
 * EL TONO ES `--df-action`, el acento del sistema, y por tokens: tiene su valor en los dos temas. No
 * es un acento de ACCIÓN aquí —esto no se pulsa— sino la marca de quien pagó por destacar, que es
 * para lo que el producto usa ese color en el espacio destacado.
 */
export function MarcaBoost({ className = "" }: { className?: string }) {
  return (
    <span
      data-marca-boost
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-2xs font-semibold tracking-widest uppercase ${className}`}
      style={{
        color: "var(--df-action)",
        borderColor: "color-mix(in srgb, var(--df-action) 45%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--df-action) 12%, transparent)",
      }}
    >
      Boost
    </span>
  );
}

/**
 * EL AVATAR DE ALGUIEN DESTACADO: el de siempre, con un ARO extra por fuera.
 *
 * ┌─ POR QUÉ EL ARO VA EN UN ENVOLTORIO Y CON HUECO ──────────────────────────────────────────────┐
 * │ `Avatar` ya dibuja un anillo —el de NIVEL— con `box-shadow` por fuera de su caja, y ese anillo │
 * │ significa otra cosa. Pintar el aro del Boost al mismo radio sería pelearse con él: los dos     │
 * │ colores pegados y ninguno legible. Así que va en un envoltorio con `p-[7px]`, lo justo para    │
 * │ quedar por FUERA del anillo de nivel (que llega a ~5 px del borde), con el fondo de página     │
 * │ entre medias. Dos aros concéntricos separados se leen como dos cosas; superpuestos, como un    │
 * │ borrón.                                                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SIN `destacado` se pinta EXACTAMENTE el avatar de siempre, sin envoltorio ni padding: nada cambia
 * de sitio para la inmensa mayoría de la gente, que es la que no tiene Boost.
 */
export function AvatarDestacado({
  nombre,
  imagen,
  puntos,
  tamano = "sm",
  perezosa = false,
  destacado,
}: {
  nombre: string;
  imagen?: string | null;
  puntos?: number;
  tamano?: TamanoAvatar;
  perezosa?: boolean;
  destacado: boolean;
}) {
  const avatar = (
    <Avatar nombre={nombre} imagen={imagen} puntos={puntos} tamano={tamano} perezosa={perezosa} />
  );
  if (!destacado) return avatar;

  const aro: CSSProperties = {
    // El hueco es `--df-void` (el fondo de página) para que el aro se lea separado del de nivel
    // también sobre el vídeo, donde detrás hay una imagen y no un color plano.
    boxShadow: "0 0 0 1.5px var(--df-void), 0 0 0 3.5px var(--df-action)",
  };
  return (
    <span data-avatar-destacado className="inline-flex shrink-0 rounded-full p-[7px]" style={aro}>
      {avatar}
    </span>
  );
}

/**
 * EL BLOQUE DE AUTOR DEL FEED: avatar + nombre, con la marca cuando está destacado.
 *
 * VIVE AQUÍ Y NO EN EL FEED porque el feed lo pinta DOS veces —la capa sobre el vídeo en móvil y el
 * panel lateral en escritorio— y esas dos maquetas ya divergieron una vez. Lo que cambia entre ellas
 * son los colores del texto (sobre vídeo va en blanco, en el panel en tokens), así que eso entra por
 * prop; lo que NO cambia es qué se enseña de alguien.
 *
 * LA MARCA VA JUNTO AL NOMBRE, no encima del avatar, y es una decisión con motivo: el avatar del
 * feed mide 32 px y lleva su emblema de nivel en la esquina de abajo a la derecha. Una palabra ahí
 * no se lee y encima tapa el nivel. El ARO sí va en el avatar (ver `AvatarDestacado`): el aro marca,
 * la palabra explica.
 */
export function AutorFeed({
  username,
  nombre,
  conHandle,
  imagen,
  puntos,
  destacado,
  claseNombre,
  claseHandle,
}: {
  username: string;
  nombre: string;
  conHandle: boolean;
  imagen?: string | null;
  puntos?: number;
  destacado: boolean;
  /** Clases del nombre: sobre el vídeo va en blanco; en el panel, en tokens. */
  claseNombre: string;
  claseHandle: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <AvatarDestacado
        nombre={username}
        imagen={imagen}
        puntos={puntos}
        tamano="sm"
        destacado={destacado}
      />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate ${claseNombre}`}>{conHandle ? nombre : `@${nombre}`}</span>
          {destacado ? <MarcaBoost /> : null}
        </span>
        {conHandle ? <span className={`block truncate ${claseHandle}`}>@{username}</span> : null}
      </span>
    </div>
  );
}
