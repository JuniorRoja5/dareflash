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

/**
 * LA MARCA MYTHIC: las letras "VIP" en una píldora dorada. UNA pieza para los tres tamaños.
 *
 * ┌─ POR QUÉ LETRAS Y NO UNA FIGURA ────────────────────────────────────────────────────────────┐
 * │ Antes era una estrella con una gema dentro. Una figura a 14 px tiene que pelear por decir    │
 * │ QUÉ es —y la primera versión de la gema se leía como un punto—, mientras que tres letras se  │
 * │ leen o no se leen, sin ambigüedad. A los tamaños a los que esto vive (14 px junto a un        │
 * │ nombre, 18 px en la esquina de un avatar) eso lo decide todo.                                 │
 * │                                                                                               │
 * │ Y de paso desaparece el problema que arrastraba la figura: nada de `<linearGradient>` con su  │
 * │ `id` repetido veinte veces en un feed, ni paths que había que mantener en dos sitios.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ PÍLDORA DORADA CON TINTA OSCURA, NO LETRAS DORADAS SUELTAS ────────────────────────────────┐
 * │ Es lo que trae la maqueta y además es lo que se lee. Unas letras doradas finas sobre el      │
 * │ fondo claro del tema claro se quedan en 4,69:1 en el mejor caso y desaparecen a 14 px; la     │
 * │ píldora sólida siempre contrasta con su fondo (12,8:1 en oscuro, 4,7:1 en claro) y el texto   │
 * │ contrasta con la píldora.                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LA TINTA CAMBIA CON EL TEMA, Y ESO NO ES UN CAPRICHO ──────────────────────────────────────┐
 * │ En oscuro el oro es VIVO y la tinta tiene que ser oscura: 12,89:1. En claro el oro va        │
 * │ APAGADO —bajado para leerse sobre blanco— y esa misma tinta oscura se queda en 3,96:1, por   │
 * │ debajo de AA. Allí la tinta tiene que ser blanca: 4,69:1. Un solo valor para los dos temas   │
 * │ deja la marca ilegible en uno de ellos, así que la tinta es un TOKEN (los valores, en        │
 * │ `globals.css`, que es donde vive la paleta; aquí solo el porqué).                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const TAMANO_MARCA = {
  /** Junto al nombre, a escala de texto. */
  compacta: "px-1 py-px text-[9px] rounded-[4px]",
  /** En la esquina de un avatar: un punto más de aire para despegarse de la foto. */
  esquina: "px-[5px] py-[2px] text-[10px] rounded-[5px]",
  /**
   * El hero del perfil VIP. El RADIO es proporcional a la altura, como en los dos de arriba
   * (~0,35 del alto): con el mismo radio absoluto que la píldora pequeña, a este tamaño la pieza
   * deja de leerse como una insignia y se lee como un BLOQUE amarillo. Se vio en una captura.
   */
  grande: "px-3 py-1.5 text-[22px] rounded-xl",
} as const;

export type TamanoMarcaVip = keyof typeof TAMANO_MARCA;

export function MarcaVip({
  tamano = "compacta",
  clase = "",
}: {
  tamano?: TamanoMarcaVip;
  clase?: string;
}) {
  return (
    <span
      data-marca-vip={tamano}
      // `aria-hidden` NO: a diferencia de una figura decorativa, esto DICE algo que no está dicho
      // en ninguna otra parte del renglón —que esta persona es VIP—, y un lector de pantalla que
      // se lo salte deja a su usuario sin el dato. Con `title` + `aria-label` se anuncia una vez.
      aria-label="VIP Mythic"
      title="VIP Mythic"
      role="img"
      className={`inline-flex shrink-0 items-center justify-center bg-[var(--vip-gold)] font-black tracking-[0.04em] text-[var(--vip-tinta)] tabular-nums ${TAMANO_MARCA[tamano]} ${clase}`}
      style={{ fontFamily: "var(--font-display)", lineHeight: 1 }}
    >
      VIP
    </span>
  );
}

/**
 * EL EMBLEMA GRANDE DEL PERFIL VIP. La MISMA marca, en grande: no es otra pieza, y por eso no
 * tiene un dibujo propio que mantener aparte.
 *
 * SIN DEGRADADO, y aquí sí se midió antes de decidir: con la píldora en degradado, la tinta no
 * puede leerse en los dos extremos a la vez —la oscura cae a 3,13:1 en el extremo profundo del
 * oro de oscuro, y la blanca a 2,28:1 en el extremo claro del de claro—. Un degradado que obliga
 * a elegir en qué mitad de la pieza se lee el texto no es un degradado: es un defecto.
 */
export function EmblemaVipGrande({ clase = "" }: { clase?: string }) {
  return <MarcaVip tamano="grande" clase={clase} />;
}

/** La marca en la esquina de un avatar. La monta `Avatar`, que es su única puerta. */
export function MarcaVipEsquina({ clase }: { clase?: string }) {
  return <MarcaVip tamano="esquina" clase={clase} />;
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
      <MarcaVip />
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
