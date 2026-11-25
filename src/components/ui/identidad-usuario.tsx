import { estiloNombreVip } from "@/lib/color-nombre";
import { mostrarHandleSecundario, nombreMostrado } from "@/lib/identidad";

import { MarcaVip } from "./marca-vip";

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

export { EmblemaVipGrande, MarcaVip, type TamanoMarcaVip } from "./marca-vip";

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
