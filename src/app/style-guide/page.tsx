import type { CSSProperties, ReactNode } from "react";

/**
 * HOJA DE ESTILO VIVA — Fase 1 · Paso A. Referencia interna del sistema de diseño de DareFlash:
 * cada token renderizado con su nombre y su unico trabajo. NO es una pantalla de producto; es lo
 * que se revisa antes de construir primitivas. Construida con la propia gramatica del brief
 * (geometria severa, filetes de 1px, cero sombras, oscuro), para que se vea el sistema, no un
 * catalogo generico. El sitio entero es noindex, asi que esta ruta no se indexa.
 *
 * DEUDA DE LANZAMIENTO (anotada a proposito): antes de abrir al publico hay que RETIRAR o PROTEGER
 * esta ruta. noindex evita que se INDEXE, pero sigue siendo alcanzable por URL directa. No es una
 * pantalla de producto y no debe verla un usuario final.
 */
export const metadata = { title: "DareFlash · Sistema de diseño" };

/** Cifra en Archivo Expanded (eje de anchura), peso alto, tabular. El tratamiento del dinero. */
const displayExpanded = (peso: number, ancho = 125): CSSProperties => ({
  fontFamily: "var(--font-display)",
  fontVariationSettings: `"wght" ${peso}, "wdth" ${ancho}`,
  fontVariantNumeric: "tabular-nums",
});

function Seccion({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-12">
      <p className="mb-8 text-2xs font-medium uppercase tracking-[0.2em] text-text-dim">
        {etiqueta}
      </p>
      {children}
    </section>
  );
}

const COLORES = [
  {
    u: "money",
    hex: "#D9F32B",
    solo: "Dinero: premios, saldo, bote.",
    nunca: "Decoración, enlaces, estados.",
  },
  {
    u: "action",
    hex: "#FF2E88",
    solo: "Acción principal: votar, participar, publicar.",
    nunca: "Más de UNA por pantalla.",
  },
  {
    u: "time",
    hex: "#FFA114",
    solo: "Tiempo restante mientras no es crítico.",
    nunca: "Cualquier otra cosa.",
  },
  {
    u: "alarm",
    hex: "#FF4D2E",
    solo: "Tiempo crítico (<24 h) Y error/peligro.",
    nunca: "Decorar. Los dos = «atención ahora».",
  },
  {
    u: "rank",
    hex: "#E8C468",
    solo: "Puestos 1, 2 y 3 del podio.",
    nunca: "Bordes, iconos, «premium».",
  },
  {
    u: "ok",
    hex: "#2BE58B",
    solo: "Confirmaciones: voto, publicado, verificado.",
    nunca: "Decorar.",
  },
] as const;

const ESCALA = [
  { u: "text-hero", px: "64", rem: "4rem", lh: "1", ej: "1,250" },
  { u: "text-3xl", px: "36", rem: "2.25rem", lh: "2.5rem", ej: "Titular grande" },
  { u: "text-2xl", px: "28", rem: "1.75rem", lh: "2rem", ej: "Titular" },
  { u: "text-xl", px: "22", rem: "1.375rem", lh: "1.75rem", ej: "Título de tarjeta" },
  { u: "text-lg", px: "18", rem: "1.125rem", lh: "1.625rem", ej: "Cuerpo enfatizado" },
  { u: "text-base", px: "16", rem: "1rem", lh: "1.5rem", ej: "Texto de cuerpo por defecto" },
  { u: "text-sm", px: "14", rem: "0.875rem", lh: "1.25rem", ej: "Texto secundario y ayudas" },
  { u: "text-xs", px: "12", rem: "0.75rem", lh: "1rem", ej: "Etiquetas de formulario" },
  { u: "text-2xs", px: "11", rem: "0.6875rem", lh: "0.9375rem", ej: "Metadatos · categoría" },
] as const;

const RADIOS = [
  { u: "rounded-xs", px: "2", uso: "píldoras de dato" },
  { u: "rounded-sm", px: "4", uso: "por defecto: botones, campos, tarjetas" },
  { u: "rounded-lg", px: "8", uso: "solo hojas y modales" },
  { u: "rounded-full", px: "999", uso: "solo avatares y píldoras de categoría" },
] as const;

const ESPACIOS = [1, 2, 3, 4, 6, 8, 12, 16] as const; // × 4px

export default function StyleGuide() {
  return (
    <main className="mx-auto w-full max-w-[900px] px-6 pb-24">
      {/* Cabecera */}
      <header className="flex flex-wrap items-end justify-between gap-4 pt-14 pb-2">
        <h1 style={displayExpanded(850)} className="text-hero leading-none tracking-tight">
          DAREFLASH
        </h1>
        <p className="text-2xs uppercase tracking-[0.2em] text-text-dim">
          Sistema de diseño · Fase 1 · Paso A · Tokens
        </p>
      </header>
      <p className="max-w-prose text-sm text-text-dim">
        Retransmisión deportiva, no red social. La cifra manda sobre la foto: geometría severa,
        color sin miedo, cada color con un solo trabajo. Referencia viva de los tokens.
      </p>

      {/* EL MARCADOR — elemento firma */}
      <Seccion etiqueta="Elemento firma · el marcador">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
          <div className="flex items-center gap-6">
            <div>
              <p className="mb-1 text-2xs uppercase tracking-widest text-text-dim">Premio</p>
              <p style={displayExpanded(850)} className="text-money" data-size="hero">
                <span className="align-top text-2xl">$</span>
                <span className="text-[64px] leading-none">1,250</span>
                <span className="text-2xl">.00</span>
              </p>
            </div>
            <div className="h-16 w-px bg-line" aria-hidden />
            <div>
              <p className="mb-1 text-2xs uppercase tracking-widest text-text-dim">Termina en</p>
              <p style={displayExpanded(650, 112)} className="text-[40px] leading-none text-time">
                02:41:09
              </p>
            </div>
          </div>
        </div>
        <p className="mt-6 max-w-prose text-sm text-text-dim">
          Premio y reloj no se separan nunca. Sin fondo propio, sin sombra, sin caja: vive sobre la
          superficie. Es lo único del sistema que puede gritar. La primitiva completa (con la
          transición ámbar → alarma por debajo de 24 h) se construye en el Paso B.
        </p>
      </Seccion>

      {/* LEY DE JERARQUIA */}
      <Seccion etiqueta="Ley de jerarquía · requisito de producto">
        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div className="border border-line rounded-sm bg-surface p-5">
            <p style={displayExpanded(800)} className="text-[52px] leading-none text-money">
              <span className="align-top text-xl">$</span>25.00
            </p>
            <p style={displayExpanded(600, 110)} className="mt-2 text-2xl leading-none text-time">
              6 d 04 h
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-sm bg-action px-4 py-3 text-sm font-semibold text-void transition-[filter] duration-150 ease-mechanical hover:brightness-110"
            >
              Participar
            </button>
            <p className="mt-4 text-lg font-semibold">Tu mejor salto en el gym</p>
            <p className="mt-1 text-sm text-text-dim">@campeona_del_barrio_2026</p>
            <span className="mt-3 inline-block rounded-full border border-line px-3 py-1 text-2xs text-text-dim">
              Fitness
            </span>
          </div>
          <ol className="text-sm text-text-dim md:w-56">
            {[
              "Importe del premio",
              "Tiempo restante",
              "Botón de acción",
              "Título del reto",
              "Autor / avatar",
              "Categoría",
            ].map((item, i) => (
              <li
                key={item}
                className="flex items-baseline gap-3 border-b border-line py-2 last:border-b-0"
              >
                <span className="tabular-nums text-text-dim">{i + 1}</span>
                <span className={i === 0 ? "font-semibold text-text" : ""}>{item}</span>
              </li>
            ))}
            <li className="pt-3 text-2xs">
              Prueba: miniaturiza hasta no leer el texto. Lo primero que se distinga debe ser el
              importe.
            </li>
          </ol>
        </div>
      </Seccion>

      {/* COLOR — semanticos */}
      <Seccion etiqueta="Color · un solo trabajo cada uno">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COLORES.map((c) => (
            <div key={c.u} className="border border-line rounded-sm bg-surface">
              {/* texto NEGRO sobre el relleno: cumple AA; el blanco no (brief, sección 4) */}
              <div
                className="flex items-end justify-between rounded-t-sm px-3 py-4"
                style={{ backgroundColor: `var(--color-${c.u})` }}
              >
                <span className="font-semibold text-void">Aa · 1,234</span>
                <span className="text-xs text-void/70">{c.hex}</span>
              </div>
              <div className="p-3">
                <p className="font-mono text-xs" style={{ color: `var(--color-${c.u})` }}>
                  --df-{c.u}
                </p>
                <p className="mt-2 text-sm">
                  <span className="text-text-dim">Solo:</span> {c.solo}
                </p>
                <p className="text-sm">
                  <span className="text-text-dim">Nunca:</span> {c.nunca}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Regla critica: texto sobre relleno = NEGRO */}
        <div className="mt-6 flex flex-wrap items-center gap-4 border border-line rounded-sm bg-surface p-4">
          <span className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-void">
            VOTAR
          </span>
          <span className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-[#ffffff] line-through decoration-alarm decoration-2">
            VOTAR
          </span>
          <p className="max-w-prose text-sm text-text-dim">
            El texto sobre cualquier color relleno va en <span className="text-text">negro</span>{" "}
            (--df-void), nunca en blanco: el blanco falla AA. Contraintuitivo, medido y no
            negociable.
          </p>
        </div>
      </Seccion>

      {/* PROFUNDIDAD por luminosidad */}
      <Seccion etiqueta="Superficies · profundidad por luminosidad, no por sombra">
        <div className="flex flex-wrap gap-px border border-line rounded-sm bg-line">
          {[
            { u: "void", n: "#07090D", t: "fondo de página" },
            { u: "surface", n: "#10141C", t: "tarjetas, hojas" },
            { u: "raised", n: "#1A2029", t: "elevado, activo" },
          ].map((s) => (
            <div
              key={s.u}
              className="min-w-[9rem] flex-1 p-4"
              style={{ backgroundColor: `var(--color-${s.u})` }}
            >
              <p className="font-mono text-xs text-text-dim">--df-{s.u}</p>
              <p className="mt-1 text-sm">{s.n}</p>
              <p className="text-xs text-text-dim">{s.t}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-prose text-sm text-text-dim">
          Si parece que hace falta una sombra, lo que hace falta es subir de{" "}
          <span className="text-text">surface</span> a <span className="text-text">raised</span>.
          Cero <span className="text-text">box-shadow</span>.
        </p>
      </Seccion>

      {/* TIPOGRAFIA */}
      <Seccion etiqueta="Tipografía · dos familias">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="border border-line rounded-sm bg-surface p-4">
            <p className="text-2xs uppercase tracking-widest text-text-dim">Display · Archivo</p>
            <p style={displayExpanded(800)} className="mt-2 text-3xl leading-none">
              1,234,567
            </p>
            <p style={displayExpanded(600, 100)} className="text-xl leading-tight">
              Cifras y titulares
            </p>
          </div>
          <div className="border border-line rounded-sm bg-surface p-4">
            <p className="text-2xs uppercase tracking-widest text-text-dim">
              Texto · IBM Plex Sans
            </p>
            <p className="mt-2 text-lg">Cuerpo, etiquetas, formularios y textos legales.</p>
            <p className="text-sm text-text-dim">
              Prohibidas como cara del producto: Inter, Geist, Roboto, Poppins.
            </p>
          </div>
        </div>

        <div className="mt-6 divide-y divide-line border border-line rounded-sm bg-surface">
          {ESCALA.map((t) => (
            <div key={t.u} className="flex items-baseline gap-4 px-4 py-2.5">
              <span className="w-24 shrink-0 font-mono text-xs text-text-dim">{t.u}</span>
              <span className="w-8 shrink-0 tabular-nums text-xs text-text-dim">{t.px}</span>
              <span
                className="truncate"
                style={{
                  fontSize: t.rem,
                  lineHeight: t.lh,
                  ...(t.u === "text-hero" ? displayExpanded(800) : {}),
                }}
              >
                {t.ej}
              </span>
            </div>
          ))}
        </div>

        {/* tabular-nums: los digitos se alinean en columna */}
        <div className="mt-6 border border-line rounded-sm bg-surface p-4">
          <p className="mb-2 text-2xs uppercase tracking-widest text-text-dim">
            Cifras tabulares · obligatorias en premios, votos, contadores, puestos y saldos
          </p>
          <p className="tabular-nums text-xl leading-tight" style={displayExpanded(600, 100)}>
            1,111
            <br />
            8,888
          </p>
          <p className="mt-1 text-xs text-text-dim">
            Los dígitos ocupan lo mismo: un reloj cuyos números bailan al cambiar es un reloj roto.
          </p>
        </div>
      </Seccion>

      {/* GEOMETRIA */}
      <Seccion etiqueta="Geometría · radios, filetes, sin sombras">
        <div className="flex flex-wrap gap-4">
          {RADIOS.map((r) => (
            <div key={r.u} className="text-center">
              <div
                className="h-20 w-20 border border-line bg-raised"
                style={{ borderRadius: `${r.px}px` }}
              />
              <p className="mt-2 font-mono text-xs text-text-dim">{r.px}px</p>
              <p className="w-24 text-2xs text-text-dim">{r.uso}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-prose text-sm text-text-dim">
          Prohibidos 12, 16, 20 y 24 px: no existen en el sistema. Los planos se separan con un{" "}
          <span className="text-text">filete de 1 px</span> (--df-line), no con sombra ni con aire.
        </p>
      </Seccion>

      {/* ESPACIADO */}
      <Seccion etiqueta="Espaciado · escala de base 4 px">
        <div className="space-y-1.5">
          {ESPACIOS.map((n) => (
            <div key={n} className="flex items-center gap-3">
              <span className="w-14 shrink-0 tabular-nums text-xs text-text-dim">{n * 4}px</span>
              {/* barra de MEDIDA = neutro. NUNCA un color semantico (no es dinero/accion/etc.). */}
              <span className="h-3 bg-text-dim" style={{ width: `${n * 4}px` }} />
            </div>
          ))}
        </div>
      </Seccion>

      {/* MOVIMIENTO */}
      <Seccion etiqueta="Movimiento · rápido y mecánico">
        <div className="flex flex-wrap items-center gap-6">
          <button
            type="button"
            className="rounded-sm border border-line bg-surface px-5 py-3 text-sm transition-transform duration-150 ease-mechanical hover:-translate-y-0.5 hover:bg-raised"
          >
            Pásame el cursor (150 ms)
          </button>
          <p className="max-w-prose text-sm text-text-dim">
            120–180 ms, cubic-bezier(0.2, 0, 0, 1). Nada de rebotes ni muelles. El voto se confirma
            con un golpe seco, no con una animación mona.{" "}
            <span className="text-text">prefers-reduced-motion</span> se respeta siempre.
          </p>
        </div>
      </Seccion>
    </main>
  );
}
