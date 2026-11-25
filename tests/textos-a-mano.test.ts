/**
 * NADA DE TEXTO ESCRITO A MANO EN LO QUE YA ESTÁ EXTRAÍDO (Fase 11 · P5b1) — censo estructural, por AST.
 *
 * En las zonas extraídas (el armazón, el feed, la portada y los retos), lo que un usuario lee u oye sale
 * de `t()`: el texto de JSX, los atributos que se leen (`aria-label`, `alt`, `title`, `placeholder`,
 * `label`) y las cadenas que se pintan desde una expresión. Si alguien vuelve a escribir una frase a
 * mano, en inglés o alemán saldría en castellano y el pseudo-idioma no la marcaría: rojo, con fichero y
 * línea. Qué cuenta y qué no, en `helpers/texto-a-mano`.
 *
 * LAS ZONAS AÚN NO EXTRAÍDAS van en `PENDIENTES_P5B2`, fichero a fichero, y esa lista solo puede
 * MENGUAR: una excepción que ya no tiene texto a mano también es rojo (si no, la lista se queda vieja y
 * deja de decir qué falta). La P5b2 la vacía.
 *
 * Fuera del censo, a propósito: el panel (no se traduce), la API (P5b3) y las dos páginas internas de
 * desarrollo (`/style-guide`, `/reproduccion-test`).
 *
 * Para romperlo: escribir `<p>Hola</p>` en un componente de una zona extraída (rojo con el fichero), o
 * dejar en la lista un fichero que ya no tiene texto a mano (rojo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { textosAMano } from "./helpers/texto-a-mano";

const RAIZ = process.cwd();
const FUERA = [
  "src/app/panel/",
  "src/app/api/",
  "src/app/style-guide/",
  "src/app/reproduccion-test/",
];

/** Lo que aún tiene texto a mano y se extrae en la P5b2. Solo puede menguar. */
const PENDIENTES_P5B2 = [
  "src/app/(app)/(shell)/boosts/activar-boost.tsx",
  "src/app/(app)/(shell)/boosts/aviso-compra.tsx",
  "src/app/(app)/(shell)/boosts/como-funciona.tsx",
  "src/app/(app)/(shell)/boosts/hero-boosts.tsx",
  "src/app/(app)/(shell)/boosts/historial-boosts.tsx",
  "src/app/(app)/(shell)/boosts/page.tsx",
  "src/app/(app)/(shell)/boosts/paquetes-boost.tsx",
  "src/app/(app)/(shell)/empezar/empresa/formulario-alta.tsx",
  "src/app/(app)/(shell)/empezar/empresa/page.tsx",
  "src/app/(app)/(shell)/empezar/page.tsx",
  "src/app/(app)/(shell)/empresa/aviso-verificar.tsx",
  "src/app/(app)/(shell)/empresa/creditos/comprar-creditos.tsx",
  "src/app/(app)/(shell)/empresa/creditos/page.tsx",
  "src/app/(app)/(shell)/empresa/cuenta/page.tsx",
  "src/app/(app)/(shell)/empresa/error.tsx",
  "src/app/(app)/(shell)/empresa/movimientos-creditos.tsx",
  "src/app/(app)/(shell)/empresa/nav-portal.tsx",
  "src/app/(app)/(shell)/empresa/page.tsx",
  "src/app/(app)/(shell)/empresa/publicidad/nueva/buscador-ciudad.tsx",
  "src/app/(app)/(shell)/empresa/publicidad/nueva/formulario-campana.tsx",
  "src/app/(app)/(shell)/empresa/publicidad/nueva/page.tsx",
  "src/app/(app)/(shell)/empresa/publicidad/page.tsx",
  "src/app/(app)/(shell)/empresa/publicidad/[id]/acciones-campana.tsx",
  "src/app/(app)/(shell)/empresa/publicidad/[id]/informe-campana.tsx",
  "src/app/(app)/(shell)/empresa/publicidad/[id]/page.tsx",
  "src/app/(app)/(shell)/empresa/retos/nuevo/formulario-propuesta.tsx",
  "src/app/(app)/(shell)/empresa/retos/nuevo/page.tsx",
  "src/app/(app)/(shell)/empresa/retos/page.tsx",
  "src/app/(app)/(shell)/vip/aviso-suscripcion.tsx",
  "src/app/(app)/(shell)/vip/beneficios-vip.tsx",
  "src/app/(app)/(shell)/vip/cancelar-vip.tsx",
  "src/app/(app)/(shell)/vip/cta-vip.tsx",
  "src/app/(app)/(shell)/vip/hero-vip.tsx",
  "src/app/(app)/(shell)/vip/tarjeta-eres-vip.tsx",
  "src/app/privacidad/page.tsx",
];

function tsx(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? tsx(p) : /\.tsx$/.test(n) ? [p] : [];
  });
}

const ficheros = [...tsx(path.join(RAIZ, "src/app")), ...tsx(path.join(RAIZ, "src/components"))]
  .map((f) => path.relative(RAIZ, f).replaceAll("\\", "/"))
  .filter((f) => !FUERA.some((x) => f.startsWith(x)));
const aMano = new Map(
  ficheros.map((f) => [f, textosAMano(f, readFileSync(path.join(RAIZ, f), "utf8"))]),
);

describe("el texto de la interfaz sale de t()", () => {
  it("el censo recorre la app y ve el texto a mano (si no, no probaría nada)", () => {
    expect(ficheros.length).toBeGreaterThan(150);
    expect(
      textosAMano("x.tsx", 'export const X = () => <p aria-label="Hola">{a ? "sí" : "no"}</p>;'),
    ).toEqual(['1: aria-label="Hola"', '1: "sí"', '1: "no"']);
    expect(
      textosAMano(
        "x.tsx",
        'export const X = () => <p className="a">{a === "b" ? t("x") : null}</p>;',
      ),
    ).toEqual([]);
  });

  it("ninguna zona extraída tiene texto escrito a mano", () => {
    const culpables = [...aMano]
      .filter(([f, t]) => t.length > 0 && !PENDIENTES_P5B2.includes(f))
      .map(([f, t]) => `${f} → ${t.slice(0, 3).join(" | ")}`);
    expect(culpables, `texto a mano fuera de t(): ${culpables.join("; ")}`).toEqual([]);
  });

  it("la lista de pendientes solo mengua: cada uno sigue teniendo texto a mano (y existe)", () => {
    const sobran = PENDIENTES_P5B2.filter((f) => (aMano.get(f) ?? []).length === 0);
    expect(
      sobran,
      `ya no tienen texto a mano: quítalos de PENDIENTES_P5B2: ${sobran.join(", ")}`,
    ).toEqual([]);
  });
});
