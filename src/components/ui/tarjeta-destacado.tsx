import Link from "next/link";
import type { CSSProperties } from "react";

import { nombreMostrado } from "@/lib/identidad";
import { nivelPorPuntos } from "@/lib/niveles";

import { Avatar } from "./avatar";
import { InsigniaNivel } from "./insignia-nivel";
import { MarcaBoost } from "./marca-boost";

/**
 * TARJETA DE UN PERFIL DESTACADO (Boost) — la misma cara en los dos sitios donde se enseña.
 *
 * ┌─ UNA SOLA FUENTE, DOS TAMAÑOS ────────────────────────────────────────────────────────────────┐
 * │ Esto se pinta en la FILA de la portada (cinco, compactas) y en la VITRINA de /destacados       │
 * │ (todas, con aire). Son dos escalas del mismo objeto, no dos componentes: con dos copias, la    │
 * │ segunda se queda atrás en cuanto se toque una —exactamente lo que le pasó al hero de           │
 * │ /referidos frente al de /puntos—. Lo que cambia es el tamaño; lo que NO cambia es qué se       │
 * │ enseña de alguien: su cara, su nombre y su nivel.                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LLEVA AL PERFIL, y por eso tiene el glow del acento al pasar por encima: el sistema reserva ese
 * realce para las tarjetas en las que se puede pulsar. Aquí está ganado.
 *
 * LA POSICIÓN ES EL SITIO EN LA FILA, no un dato de la aparición: nadie compra "el puesto 1". Se
 * pasa desde fuera porque solo quien pinta la lista sabe en qué orden la está pintando, y es
 * OPCIONAL: en la vitrina larga numerar hasta el cuarenta no dice nada.
 *
 * EL NIVEL SE DERIVA de los puntos, como en todo el producto. Si viniera como dato, dos pantallas
 * podrían decir niveles distintos del mismo saldo. Y lo dice TRES veces con el mismo cálculo: el
 * aro del avatar, el halo de la tarjeta y la insignia de abajo.
 */
export function TarjetaDestacado({
  username,
  displayName,
  imagen,
  puntos,
  posicion,
  tamano = "fila",
}: {
  username: string;
  displayName: string | null;
  imagen: string | null;
  puntos: number;
  /** 1-based. Si no se pasa, no se numera. */
  posicion?: number;
  tamano?: "fila" | "vitrina";
}) {
  const vitrina = tamano === "vitrina";
  /**
   * EL HALO ES EL NIVEL DE LA PERSONA, NO EL VERDE DE LA MARCA. Antes forzaba `--df-action` para
   * todo el mundo, así que cuarenta caras salían con la misma luz y el halo no decía nada: era
   * decoración repetida cuarenta veces. El nivel se deriva aquí igual que en `Avatar` y que en
   * `InsigniaNivel` —de los puntos, con `nivelPorPuntos`—, así que las tres cosas de la tarjeta
   * (aro, halo e insignia) no pueden discrepar: salen del mismo cálculo.
   *
   * ROOKIE NO LLEVA HALO, y es la misma decisión que el aro del avatar: Rookie es el ESTÁNDAR, no
   * una insignia. Si se le diera un halo gris, la luz pasaría a significar "esta tarjeta existe"
   * en vez de "esta persona ha subido de nivel".
   *
   * El verde de marca sigue estando en la tarjeta —la `MarcaBoost` de la esquina, que es la marca
   * de quien pagó—, pero esa es otra cosa: dice CÓMO llegó aquí, no QUIÉN es.
   */
  const nivel = nivelPorPuntos(puntos);
  const conEmblema = nivel.emblema && nivel.tokenColor ? nivel : null;
  return (
    <Link
      href={`/u/${username}`}
      data-destacado={username}
      data-nivel={conEmblema?.clave}
      style={
        conEmblema
          ? ({ "--df-halo-color": `var(${conEmblema.tokenColor})` } as CSSProperties)
          : undefined
      }
      /* `overflow-hidden` es obligatorio con el halo: al respirar escala un 6% y sin recorte se
         saldría por las esquinas redondeadas (un rectángulo de luz por fuera del filete, y solo en
         algunos navegadores). Es la misma razón por la que lo llevan los heroes. */
      className={`relative flex flex-col items-center gap-2 overflow-hidden rounded-sm border border-line bg-surface/60 text-center shadow-[var(--df-shadow-sm)] backdrop-blur-md transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-glow-hover)] ${
        vitrina ? "p-6" : "p-4"
      }`}
    >
      {/* LA FIRMA VIVA. El halo lo pinta `.df-halo` (estático) y `.df-respira` solo lo hace latir,
          animando opacidad y transform — nunca `box-shadow` ni `filter`, que repintan en cada
          fotograma y aquí hay hasta cien tarjetas. La regla global de `prefers-reduced-motion` lo
          apaga y la tarjeta se queda con su halo quieto, que sigue marcando igual.
          Va en la PRIMITIVA, así que entra en la vitrina y en la fila de la portada a la vez.
          Solo si la persona TIENE nivel: ver el porqué arriba. */}
      {conEmblema ? <span className="df-halo df-respira" aria-hidden /> : null}

      {posicion !== undefined ? (
        <span
          className="absolute top-2.5 left-3 text-sm font-bold tabular-nums text-text-dim"
          style={{ fontFamily: "var(--font-display)" }}
          aria-hidden
        >
          {posicion}
        </span>
      ) : null}
      {/* LA MISMA MARCA que lleva el feed: una sola fuente para la palabra y el tono (ver
          `MarcaBoost`). Antes era un `<span>` suelto con su propio estilo, o sea una copia esperando
          a divergir de las otras tres superficies. */}
      <MarcaBoost className="absolute top-3 right-3" />

      {/* EL CONTENIDO VA `relative`, y no es cosmético: el halo es un elemento POSICIONADO, y un
          posicionado se pinta por encima del contenido en flujo de sus hermanos. Sin esto, la cara y
          el nombre quedarían DEBAJO de la luz. Es el mismo envoltorio que llevan los heroes. */}
      <span className="relative flex w-full flex-col items-center gap-2">
        <Avatar
          nombre={username}
          imagen={imagen}
          tamano={vitrina ? "xl" : "lg"}
          perezosa
          puntos={puntos}
        />
        <span
          className={`mt-1 max-w-full truncate font-medium text-text ${vitrina ? "text-base" : "text-sm"}`}
        >
          {nombreMostrado(displayName, username)}
        </span>
        <InsigniaNivel puntos={puntos} />
      </span>
    </Link>
  );
}
