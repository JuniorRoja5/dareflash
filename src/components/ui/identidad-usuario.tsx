import { estiloNombreVip } from "@/lib/color-nombre";
import { mostrarHandleSecundario, nombreMostrado } from "@/lib/identidad";

/**
 * LA IDENTIDAD DE UNA PERSONA — nombre, y la marca Mythic si es VIP. EL ÚNICO SITIO QUE PINTA UN
 * NOMBRE DE USUARIO.
 *
 * ┌─ POR QUÉ UN COMPONENTE Y NO UN HELPER DE TEXTO ──────────────────────────────────────────────┐
 * │ `nombreMostrado` devuelve un string, así que cada superficie lo metía en su propio `<span>`  │
 * │ con sus propias clases: ocho sitios pintando lo mismo de ocho maneras. Mientras el nombre fue │
 * │ texto plano daba igual; en cuanto lleva COLOR y un SELLO, significa que la marca VIP hay que  │
 * │ acordarse de ponerla ocho veces — y basta que una se olvide para que un VIP no lo parezca     │
 * │ justo donde más se le ve.                                                                     │
 * │                                                                                               │
 * │ Con un componente, la marca se monta UNA vez y sale en todas. Y al revés, que es lo que de     │
 * │ verdad protege: como NADIE MÁS pinta nombres, es imposible que la marca se filtre a quien no  │
 * │ es VIP — no hay otro camino por el que pueda salir. El guard estructural vigila justo eso:    │
 * │ que no aparezca un `@{username}` suelto fuera de aquí.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `esVip` LLEGA RESUELTO, nunca se decide aquí: lo calcula el chokepoint de la Fase 8
 * (`esVipActivo` sobre la suscripción) y las listas lo traen en lote. Si este componente consultara
 * por su cuenta, una lista de veinte nombres serían veinte consultas — y además habría dos sitios
 * decidiendo quién es VIP, que es exactamente lo que el chokepoint existe para evitar.
 */

/** El dorado del sello sale del token; el `currentColor` deja que el tamaño lo ponga quien lo usa. */
function SelloVip({ clase }: { clase?: string }) {
  return (
    <svg
      data-sello-vip
      viewBox="0 0 48 48"
      className={clase}
      aria-hidden
      /* SIN DEGRADADO, y es deliberado: un `<linearGradient>` necesita un `id` único, y este sello
         sale veinte veces en un feed —veinte ids iguales en la página, que es HTML inválido y en
         algunos navegadores pinta todos con el primero—. A 18 px el degradado no se ve; dos tonos
         planos sí dan el relieve. El grande (P3, 76 px) sale una vez y ahí sí puede llevarlo. */
      fill="none"
    >
      {/* La estrella de doce puntas: la FORMA es lo que separa esto de la medalla REDONDA del
          podio. Color y forma, como con el aro doble de Legend. */}
      <path
        fill="var(--vip-gold)"
        d="M24 1l4.6 4.3 6.2-1.4-.3 6.4 5.9 2.6-3.6 5.3 3.6 5.3-5.9 2.6.3 6.4-6.2-1.4L24 41l-4.6-4.3-6.2 1.4.3-6.4-5.9-2.6 3.6-5.3-3.6-5.3 5.9-2.6-.3-6.4 6.2 1.4z"
      />
      <circle cx="24" cy="24" r="12.5" fill="var(--df-surface)" />
      <circle cx="24" cy="24" r="12.5" fill="none" stroke="var(--vip-gold)" strokeWidth="1.3" />
      {/* LA MISMA GEMA QUE VA JUNTO AL NOMBRE, aquí dentro: maciza y con su faceta superior. Que
          las dos piezas de la marca compartan silueta es lo que hace que se lean como una sola
          cosa —el sello en la cara, la gema en el nombre— y no como dos adornos dorados. */}
      <path d="M24 13.5l8.5 4.9v9.8L24 33.1l-8.5-4.9v-9.8z" fill="var(--vip-gold)" />
      <path d="M24 13.5l8.5 4.9L24 23.3l-8.5-4.9z" fill="var(--vip-gold-deep)" opacity="0.45" />
    </svg>
  );
}

/**
 * LA GEMA QUE VA JUNTO AL NOMBRE — el hexágono del sello, a solas y a escala de texto.
 *
 * ┌─ POR QUÉ ES MACIZA Y NO UN CONTORNO CON ALGO DENTRO ─────────────────────────────────────────┐
 * │ La primera versión era un hexágono perfilado con una gemita dentro, y mirándola al tamaño    │
 * │ real —14 px, al lado de un nombre— no se leía como una gema: se leía como un PUNTO. A ese    │
 * │ tamaño el contorno fino se come la silueta y el detalle de dentro desaparece. Maciza, con    │
 * │ UNA sola faceta de corte, la forma se reconoce.                                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ES UN HEXÁGONO Y NO UN DIAMANTE A PROPÓSITO: el diamante ya es el emblema del nivel ELITE, y va
 * en la esquina del MISMO avatar. Dos diamantes a dos centímetros diciendo cosas distintas —cuánto
 * has jugado y si pagas— no se separan ni por el color. El hexágono es el corazón del sello, así
 * que la gema del nombre y el sello del avatar se leen como la misma marca.
 */
function GemaVip({ clase }: { clase?: string }) {
  return (
    <svg data-gema-vip viewBox="0 0 24 26" className={clase} aria-hidden fill="none">
      <path d="M12 1 22 6.75v12.5L12 25 2 19.25V6.75Z" fill="var(--vip-gold)" />
      {/* La faceta: el tercio superior en el tono profundo. Da volumen sin degradado —y sin `id`,
          que es lo que no puede repetirse veinte veces en un feed—. */}
      <path d="M12 1 22 6.75 12 12.5 2 6.75Z" fill="var(--vip-gold-deep)" opacity="0.45" />
    </svg>
  );
}

/**
 * EL ID DEL DEGRADADO DEL EMBLEMA GRANDE. Fijo y declarado aquí a propósito: es la pieza de la que
 * hay UNA en la página, así que el id puede ser una constante y el guard estructural puede
 * comprobar que sigue habiendo una sola.
 *
 * No se genera con `useId()` —que daría uno distinto por instancia— porque eso obligaría a marcar
 * este módulo como `"use client"`, y entonces TODA la identidad (que la monta media app desde el
 * servidor) se iría al bundle del cliente. El precio de la unicidad sería mucho mayor que el
 * problema que resuelve.
 */
export const ID_DEGRADADO_EMBLEMA = "df-vip-oro";

/**
 * EL EMBLEMA GRANDE DEL PERFIL VIP (76 px) — el único sitio donde la marca lleva DEGRADADO.
 *
 * ┌─ POR QUÉ AQUÍ SÍ Y EN EL SELLO COMPACTO NO ─────────────────────────────────────────────────┐
 * │ Un `<linearGradient>` se referencia por `id`, y un id se repite tantas veces como se monte   │
 * │ el componente. El sello compacto sale VEINTE veces en un feed: veinte ids iguales es HTML    │
 * │ inválido, y hay navegadores que pintan todos con el primero. Este sale UNA vez, en una sola  │
 * │ pantalla, así que el id es único por construcción.                                            │
 * │                                                                                               │
 * │ Y a 76 px el degradado sí se ve: es lo que convierte la estrella plana en metal. A 18 px no   │
 * │ se veía, que es la otra mitad de por qué el compacto no lo lleva.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MISMA SILUETA que el sello compacto —estrella de doce puntas con la gema hexagonal dentro—: es
 * la misma marca en grande, no otra pieza.
 */
export function EmblemaVipGrande({ clase }: { clase?: string }) {
  return (
    <svg data-emblema-vip viewBox="0 0 48 48" className={clase} aria-hidden fill="none">
      <defs>
        <linearGradient id={ID_DEGRADADO_EMBLEMA} x1="0" y1="0" x2="0" y2="1">
          {/* Los tres por token, reflejo incluido: en claro el reflejo tiene que ser otro (un
              casi-blanco sobre el disco crema del tema claro no se ve y el emblema se queda
              plano), y un literal aquí dentro solo podría tener un valor. */}
          <stop offset="0" stopColor="var(--vip-gold-light)" />
          <stop offset="0.45" stopColor="var(--vip-gold)" />
          <stop offset="1" stopColor="var(--vip-gold-deep)" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${ID_DEGRADADO_EMBLEMA})`}
        d="M24 1l4.6 4.3 6.2-1.4-.3 6.4 5.9 2.6-3.6 5.3 3.6 5.3-5.9 2.6.3 6.4-6.2-1.4L24 41l-4.6-4.3-6.2 1.4.3-6.4-5.9-2.6 3.6-5.3-3.6-5.3 5.9-2.6-.3-6.4 6.2 1.4z"
      />
      {/* El disco interior lleva SU token y no `--df-surface`: aquí el fondo es el de la tarjeta
          VIP, que en claro es blanco y necesita un tinte para no leerse como un agujero. */}
      <circle cx="24" cy="24" r="12.5" fill="var(--vip-seal-bg)" />
      <circle
        cx="24"
        cy="24"
        r="12.5"
        fill="none"
        stroke={`url(#${ID_DEGRADADO_EMBLEMA})`}
        strokeWidth="1.3"
      />
      <path
        d="M24 13.5l8.5 4.9v9.8L24 33.1l-8.5-4.9v-9.8z"
        fill={`url(#${ID_DEGRADADO_EMBLEMA})`}
      />
      <path d="M24 13.5l8.5 4.9L24 23.3l-8.5-4.9z" fill="var(--vip-gold-deep)" opacity="0.45" />
    </svg>
  );
}

/** El sello en la esquina de un avatar. Lo exporta para que `Avatar` lo monte sin duplicar el SVG. */
export function SelloVipEsquina({ clase }: { clase?: string }) {
  return <SelloVip clase={clase} />;
}

export interface IdentidadVip {
  /** Resuelto por el chokepoint. `false` = se pinta como cualquiera. */
  esVip: boolean;
  /** Clave del color elegido (`COLORES_NOMBRE_VIP`). Lo que llega del usuario es la CLAVE. */
  colorNombre?: string | null;
}

/**
 * EL NOMBRE DE UNA PERSONA, con su marca si la tiene.
 *
 * `prefijo` pone la arroba delante cuando la superficie enseña el handle (comentarios, ranking) en
 * vez del nombre para mostrar. Es la misma decisión que ya tomaba cada sitio; lo que cambia es que
 * ahora se toma pasando un parámetro en vez de escribiendo la arroba en el JSX.
 */
export function NombreUsuario({
  displayName,
  username,
  esVip = false,
  colorNombre,
  prefijo = false,
  clase = "",
}: {
  displayName?: string | null;
  username: string;
  prefijo?: boolean;
  clase?: string;
} & Partial<IdentidadVip>) {
  const texto = prefijo ? `@${username}` : nombreMostrado(displayName, username);

  if (!esVip) {
    // AQUÍ SE CORTA, Y ESTA ES LA LÍNEA QUE IMPIDE QUE LA MARCA SE FILTRE: quien no es VIP recibe
    // EL MISMO NODO DE SIEMPRE —un `<span>` con sus clases y nada más—, así que no hay camino por
    // el que le pueda llegar ni el color ni la gema. Y de paso, ni un envoltorio de más: no se
    // mueve una sola maqueta de las que ya existen, que es la mayoría de la gente.
    //
    // La elección de color SÍ puede venir rellena (quien se suscribió, eligió y dejó de pagar
    // conserva su `colorNombre`): lo que caduca es el derecho a verla pintada, no la elección.
    return <span className={clase}>{texto}</span>;
  }

  // Redundante a propósito, y vale lo que cuesta: si algún día el estilo deja de calcularse dentro
  // de la rama VIP —porque alguien junte las dos ramas—, esta comprobación sigue en pie.
  const estilo = esVip ? estiloNombreVip(colorNombre) : undefined;

  return (
    /* `max-w-full` NO es relleno: el envoltorio es un `inline-flex`, y un inline-flex se dimensiona
       por su contenido —así que un nombre largo se saldría del hueco que le dé la maqueta en vez de
       recortarse—. Atado al ancho del padre, el `truncate` de dentro vuelve a tener contra qué
       medir y los puntos suspensivos salen donde salían. */
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1.5 align-bottom ${clase}`}>
      {/* `df-nombre-vip` pone el color (con el del acento de respaldo si no eligió ninguno) y su
          resplandor. En CSS y no aquí: así el tema decide y `prefers-reduced-motion` alcanza. */}
      <span className="df-nombre-vip truncate" style={estilo}>
        {texto}
      </span>
      <GemaVip clase="h-[0.95em] w-[0.88em] shrink-0" />
    </span>
  );
}

/**
 * EL "@handle" SECUNDARIO — la línea pequeña que va DEBAJO del nombre cuando alguien tiene
 * `displayName`. SIEMPRE en texto plano, aunque quien lo lleva sea VIP, y eso no es un olvido:
 *
 * el nombre de arriba YA lleva el color y la gema. Repetir la marca dos renglones seguidos no añade
 * información —es la misma persona— y además rompe la jerarquía que este par existe para montar:
 * uno es el nombre y el otro el identificador.
 *
 * Está aquí, y no escrito a mano en cada sitio, por el candado: así NINGÚN `@usuario` se pinta fuera
 * de este módulo, y el guard estructural puede prohibirlos todos sin excepciones que mantener.
 */
export function HandleUsuario({ username, clase = "" }: { username: string; clase?: string }) {
  return <span className={clase}>@{username}</span>;
}

/**
 * EL NOMBRE COMO TEXTO, para donde NO hay JSX que valga: `aria-label`, `title`, `alt`, la inicial
 * del avatar. Es `nombreMostrado` tal cual.
 *
 * ┌─ POR QUÉ SE RE-EXPORTA EN VEZ DE IMPORTAR `@/lib/identidad` DONDE HAGA FALTA ────────────────┐
 * │ Porque esa es la regla que hace cumplible el candado. Si las superficies pudieran importar   │
 * │ `nombreMostrado` «solo para la etiqueta», el guard tendría que distinguir un uso en JSX de   │
 * │ uno en un atributo —y eso, con una expresión guardada antes en una variable, no se puede     │
 * │ mirar con fiabilidad—. Con la puerta cerrada del todo, la regla es de una línea y no admite  │
 * │ matices: NINGUNA superficie importa `@/lib/identidad`; todo lo de identidad sale de aquí.    │
 * │                                                                                              │
 * │ Y tiene un segundo efecto, que es el que de verdad protege: quien venga a pintar un nombre   │
 * │ nuevo llega a ESTE fichero buscando el helper, y se encuentra `NombreUsuario` al lado.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const textoNombre = nombreMostrado;

/** ¿Va el "@handle" secundario debajo? Mismo criterio de siempre, por la puerta de siempre. */
export const conHandleSecundario = mostrarHandleSecundario;
