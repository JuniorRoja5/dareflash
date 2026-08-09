import { Avatar, type TamanoAvatar } from "@/components/ui/avatar";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";

import { type FilaRankVista, type Medalla, medallaPuesto, ordenPodio } from "./ranking-datos";

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

function Puntos({ valor, tam }: { valor: number; tam: string }) {
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
        pts
      </span>
    </p>
  );
}

/** Columna del podio de ESCRITORIO (avatar + datos sobre un pedestal cuya ALTURA marca la jerarquia). */
function ColumnaPodio({ fila, puesto }: { fila: FilaRankVista; puesto: 1 | 2 | 3 }) {
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
        {fila.username}
      </p>
      <div className="mt-1">
        <Puntos valor={fila.puntos} tam={geo.pts} />
      </div>
      <div className="mt-2">
        <InsigniaNivel puntos={fila.puntos} />
      </div>
      <div
        className="mt-3 grid w-full place-items-center rounded-t-sm border border-b-0 border-line bg-raised"
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
  fila: FilaRankVista;
  puesto: 1 | 2 | 3;
  destacado: boolean;
}) {
  const color = colorMedalla(puesto);
  return (
    <div
      className={`relative rounded-sm border border-line bg-surface p-4 ${
        destacado ? "flex items-center gap-4" : "flex flex-col items-center gap-2 text-center"
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
        <p className="max-w-[16ch] truncate font-semibold text-text">{fila.username}</p>
        <div className="mt-0.5">
          <Puntos valor={fila.puntos} tam={destacado ? "20px" : "16px"} />
        </div>
        <div className="mt-2">
          <InsigniaNivel puntos={fila.puntos} />
        </div>
      </div>
    </div>
  );
}

/**
 * PODIO del top-3 — composicion (no primitivo). DOBLE senal de jerarquia: COLOR por puesto (1 oro /
 * 2 plata / 3 bronce) Y geometria (pedestal 1 mas alto, avatar 1 mayor, 1 centrado / 2 izq / 3 der).
 * En escritorio, pedestales alineados al pie (el 1 mas alto eleva su columna). En movil colapsa a
 * #1 a lo ancho + #2/#3 en fila. `top3` llega en orden de ranking [1, 2, 3].
 */
export function PodioRanking({ top3 }: { top3: readonly FilaRankVista[] }) {
  if (top3.length < 3) return null;
  const emparejado: [
    { fila: FilaRankVista; puesto: 1 },
    { fila: FilaRankVista; puesto: 2 },
    { fila: FilaRankVista; puesto: 3 },
  ] = [
    { fila: top3[0]!, puesto: 1 },
    { fila: top3[1]!, puesto: 2 },
    { fila: top3[2]!, puesto: 3 },
  ];
  const visual = ordenPodio(emparejado); // [#2, #1, #3]

  return (
    <div className="mt-8">
      {/* Escritorio: podio con pedestales (2 | 1 | 3), alineados al pie */}
      <div className="hidden items-end gap-4 lg:grid lg:grid-cols-[1fr_1.25fr_1fr]">
        {visual.map(({ fila, puesto }) => (
          <ColumnaPodio key={puesto} fila={fila} puesto={puesto} />
        ))}
      </div>

      {/* Movil: #1 a lo ancho + #2/#3 en fila */}
      <div className="lg:hidden">
        <TarjetaMovil fila={emparejado[0].fila} puesto={1} destacado />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <TarjetaMovil fila={emparejado[1].fila} puesto={2} destacado={false} />
          <TarjetaMovil fila={emparejado[2].fila} puesto={3} destacado={false} />
        </div>
      </div>
    </div>
  );
}
