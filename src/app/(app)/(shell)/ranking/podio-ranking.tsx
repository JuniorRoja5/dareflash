import { Avatar, type TamanoAvatar } from "@/components/ui/avatar";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";

import {
  cuantosEnPodio,
  type Medalla,
  medallaPuesto,
  ordenVisualPodio,
  type PuestoPodio,
} from "@/lib/podio";

/** Una posición del podio, con datos REALES del ranking. */
export interface FilaPodio {
  userId: string;
  username: string;
  /** La cifra por la que se ordena: victorias del mes. */
  victorias: number;
  /** Puntos totales: alimentan la insignia de nivel, no la cifra grande. */
  puntos: number;
}

/** Token de medalla -> variable CSS. Oro/plata/bronce son EXCLUSIVOS del podio (ver globals.css). */
const MEDALLA_VAR: Record<Medalla, string> = {
  rank: "var(--df-rank)",
  silver: "var(--df-silver)",
  bronze: "var(--df-bronze)",
};

function colorMedalla(puesto: number): string {
  const m = medallaPuesto(puesto);
  return m ? MEDALLA_VAR[m] : "var(--df-text-dim)";
}

/** Geometria por puesto: DOBLE senal con el color (altura del pedestal + tamano de avatar + posicion). */
const GEO = {
  1: {
    avatar: "xl",
    anillo: 2.5,
    corona: 30,
    nombre: "16px",
    pts: "26px",
    num: "60px",
    ped: "168px",
  },
  2: {
    avatar: "md",
    anillo: 1.5,
    corona: 22,
    nombre: "13px",
    pts: "18px",
    num: "40px",
    ped: "112px",
  },
  3: {
    avatar: "md",
    anillo: 1.5,
    corona: 22,
    nombre: "13px",
    pts: "16px",
    num: "34px",
    ped: "82px",
  },
} as const satisfies Record<
  number,
  {
    avatar: TamanoAvatar;
    anillo: number;
    corona: number;
    nombre: string;
    pts: string;
    num: string;
    ped: string;
  }
>;

function Corona({ tam, color }: { tam: number; color: string }) {
  return (
    <span aria-hidden style={{ color, lineHeight: 0 }}>
      <svg viewBox="0 0 24 24" width={tam} height={tam} fill="currentColor">
        <path d="M3 7l4 4 5-7 5 7 4-4-2 12H5z" />
      </svg>
    </span>
  );
}

/** Avatar con aro de medalla (borde plano, sin sombra). */
function AvatarMedalla({
  nombre,
  tamano,
  anillo,
  color,
}: {
  nombre: string;
  tamano: TamanoAvatar;
  anillo: number;
  color: string;
}) {
  return (
    <span
      className="inline-flex rounded-full p-[3px]"
      style={{ border: `${anillo}px solid ${color}` }}
    >
      <Avatar nombre={nombre} tamano={tamano} />
    </span>
  );
}

/**
 * La cifra grande del podio: VICTORIAS del mes, que es por lo que está ordenado. Los puntos no van
 * aquí — irían contra el orden, y para el nivel ya está la insignia justo debajo.
 */
function Victorias({ valor, tam }: { valor: number; tam: string }) {
  return (
    <p
      className="tabular-nums text-text"
      style={{
        fontFamily: "var(--font-display)",
        fontVariationSettings: '"wght" 720',
        fontSize: tam,
      }}
    >
      {valor.toLocaleString("en-US")}
      <span className="ml-1 text-text-dim" style={{ fontSize: "0.62em" }}>
        {valor === 1 ? "victoria" : "victorias"}
      </span>
    </p>
  );
}

/** Columna del podio de ESCRITORIO (avatar + datos sobre un pedestal cuya ALTURA marca la jerarquia). */
function ColumnaPodio({ fila, puesto }: { fila: FilaPodio; puesto: PuestoPodio }) {
  const geo = GEO[puesto];
  const color = colorMedalla(puesto);
  return (
    <div className="flex flex-col items-center justify-end text-center">
      <Corona tam={geo.corona} color={color} />
      <span className="mt-2">
        <AvatarMedalla
          nombre={fila.username}
          tamano={geo.avatar}
          anillo={geo.anillo}
          color={color}
        />
      </span>
      <p
        className="mt-3 max-w-[15ch] truncate font-semibold text-text"
        style={{ fontSize: geo.nombre }}
      >
        @{fila.username}
      </p>
      <div className="mt-1">
        <Victorias valor={fila.victorias} tam={geo.pts} />
      </div>
      <div className="mt-2">
        <InsigniaNivel puntos={fila.puntos} />
      </div>
      <div
        className={`mt-3 grid w-full place-items-center rounded-t-sm border border-b-0 border-line bg-raised ${
          puesto === 1 ? "shadow-[var(--df-shadow-lg)]" : ""
        }`}
        style={{ height: geo.ped }}
      >
        <span
          className="tabular-nums"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wght" 800',
            fontSize: geo.num,
            lineHeight: 1,
            color,
          }}
        >
          {puesto}
        </span>
      </div>
    </div>
  );
}

/** Tarjeta del podio en MOVIL: #1 destacado a lo ancho; #2/#3 en tarjetas mini (sin pedestal: la
 *  jerarquia la dan el tamano y la prominencia). El numero de puesto va en el color de la medalla. */
function TarjetaMovil({
  fila,
  puesto,
  destacado,
}: {
  fila: FilaPodio;
  puesto: PuestoPodio;
  destacado: boolean;
}) {
  const color = colorMedalla(puesto);
  return (
    <div
      className={`relative rounded-sm border border-line bg-surface/60 p-4 backdrop-blur-md ${
        destacado
          ? "flex items-center gap-4 shadow-[var(--df-shadow-lg)]"
          : "flex flex-col items-center gap-2 text-center shadow-[var(--df-shadow-md)]"
      }`}
    >
      <span
        className={`absolute tabular-nums ${destacado ? "top-3 right-4" : "top-2 left-3"}`}
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 800',
          fontSize: destacado ? "26px" : "18px",
          lineHeight: 1,
          color,
        }}
      >
        {puesto}
      </span>
      <AvatarMedalla
        nombre={fila.username}
        tamano={destacado ? "lg" : "md"}
        anillo={destacado ? 2.5 : 1.5}
        color={color}
      />
      <div className={`flex flex-col ${destacado ? "min-w-0 items-start" : "items-center"}`}>
        <p className="max-w-[16ch] truncate font-semibold text-text">@{fila.username}</p>
        <div className="mt-0.5">
          <Victorias valor={fila.victorias} tam={destacado ? "20px" : "16px"} />
        </div>
        <div className="mt-2">
          <InsigniaNivel puntos={fila.puntos} />
        </div>
      </div>
    </div>
  );
}

/**
 * PODIO — composicion (no primitivo). DOBLE senal de jerarquia: COLOR por puesto (1 oro / 2 plata /
 * 3 bronce) Y geometria (pedestal del 1 mas alto, avatar mayor, y el 1 al CENTRO). En escritorio,
 * pedestales alineados al pie. En movil colapsa a #1 a lo ancho + #2/#3 en fila.
 *
 * SOLO PINTA LAS POSICIONES QUE EXISTEN. `top` llega en orden de clasificacion y puede traer 0, 1, 2
 * o mas; el podio se queda con las tres primeras como mucho y no rellena. Antes exigia exactamente
 * tres y, con menos, devolvia `null`: como la lista arranca despues del podio, el ganador de los dos
 * primeros retos de la plataforma no habria salido en ninguna parte.
 *
 * Un pedestal sin persona es un dato falso disfrazado de hueco, asi que no existe: con una sola
 * persona hay una sola columna, y con cero no hay podio sino un vacio honesto (lo pinta el llamante,
 * que es quien sabe si invitar a participar o a ganar).
 */
export function PodioRanking({ top }: { top: readonly FilaPodio[] }) {
  const cuantos = cuantosEnPodio(top.length);
  if (cuantos === 0) return null;

  // El orden VISUAL no es el de clasificacion (el 1 va al centro), y depende de cuantos hay.
  const visual = ordenVisualPodio(cuantos);
  const filaDe = (puesto: PuestoPodio): FilaPodio => top[puesto - 1] as FilaPodio;

  // Con menos de tres, la rejilla se estrecha en vez de dejar columnas vacias a los lados.
  const columnas =
    cuantos === 1
      ? "lg:grid-cols-[1.25fr]"
      : cuantos === 2
        ? "lg:grid-cols-[1fr_1.25fr]"
        : "lg:grid-cols-[1fr_1.25fr_1fr]";

  return (
    <div className="df-rise mt-8">
      {/* Escritorio: pedestales alineados al pie, centrados cuando no son tres. */}
      <div className={`mx-auto hidden max-w-3xl items-end gap-4 lg:grid ${columnas}`}>
        {visual.map((puesto) => (
          <ColumnaPodio key={puesto} fila={filaDe(puesto)} puesto={puesto} />
        ))}
      </div>

      {/* Movil: #1 a lo ancho; #2 y #3, los que haya, debajo. */}
      <div className="lg:hidden">
        <TarjetaMovil fila={filaDe(1)} puesto={1} destacado />
        {cuantos > 1 ? (
          <div className={`mt-3 grid gap-3 ${cuantos === 2 ? "grid-cols-1" : "grid-cols-2"}`}>
            <TarjetaMovil fila={filaDe(2)} puesto={2} destacado={false} />
            {cuantos > 2 ? <TarjetaMovil fila={filaDe(3)} puesto={3} destacado={false} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
