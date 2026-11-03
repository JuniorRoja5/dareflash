/**
 * LAS PANTALLAS DE CARGA — que existan, que no inventen nada y que no den un salto.
 *
 * ┌─ EL FALLO ─────────────────────────────────────────────────────────────────────────────────────┐
 * │ 27 páginas son `force-dynamic` y NO había ni un `loading.tsx`. Sin él, Next se queda en la      │
 * │ pantalla anterior hasta que el servidor responde: pulsas y no pasa nada. Con 4 usuarios y 16    │
 * │ vídeos son 60 ms y no se nota; con tráfico es la diferencia entre "va lento" y "está roto", y   │
 * │ la reacción es volver a pulsar — que duplica la carga justo cuando menos sobra.                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Aquí van las dos decisiones que solo se ven RENDERIZANDO:
 *
 *  1. QUE NO AFIRME NADA. Un esqueleto que escribe "0 €" o "Reto" está diciendo algo que todavía no
 *     se ha leído de la base de datos. El texto visible tiene que ser exactamente el anuncio para
 *     lectores de pantalla y nada más. Es la misma regla que las tarjetas "próximamente" del panel,
 *     donde tampoco cabe una cifra inventada.
 *  2. QUE OCUPE EL MISMO SITIO. Si el contenedor del esqueleto no es el de su página, al llegar los
 *     datos la maqueta SALTA, y un salto molesta más que la espera que se quería evitar. Se contrasta
 *     el `max-w-*` y el `py-*` del esqueleto contra los de la página de verdad, leyendo su fuente.
 *
 * QUE EL FICHERO EXISTA se comprueba en `tests/pantallas-de-carga-existen`, que mira el disco y no
 * importa nada: aquí los imports son estáticos, así que borrar un `loading.tsx` tumbaría este
 * fichero entero con un "Failed to resolve import" y cero casos corridos — rojo, pero sin decir
 * qué falta. Allí el mismo borrado da un caso con nombre.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CargandoBoosts from "@/app/(app)/(shell)/boosts/loading";
import CargandoDestacados from "@/app/(app)/(shell)/destacados/loading";
import CargandoInicio from "@/app/(app)/(shell)/inicio/loading";
import CargandoShell from "@/app/(app)/(shell)/loading";
import CargandoPerfil from "@/app/(app)/(shell)/perfil/loading";
import CargandoReto from "@/app/(app)/(shell)/retos/[codigo]/loading";
import CargandoRetos from "@/app/(app)/(shell)/retos/loading";
import CargandoPerfilPublico from "@/app/(app)/(shell)/u/[username]/loading";

const SHELL = join(process.cwd(), "src", "app", "(app)", "(shell)");
const leer = (...p: string[]) => readFileSync(join(SHELL, ...p), "utf8");

/** El anuncio es lo ÚNICO que se lee en voz alta, y lo único que debe tener texto. */
const ANUNCIO = "Cargando…";

/**
 * Las pantallas cubiertas. `contenedor` dice en qué fichero vive el `mx-auto max-w-… py-…` de la
 * página real: casi siempre su `page.tsx`, salvo los perfiles, que lo tienen en el componente que
 * los pinta (`PerfilVista`) porque las DOS rutas comparten maqueta.
 */
const PANTALLAS = [
  { nombre: "shell (reserva)", Comp: CargandoShell, ruta: ["loading.tsx"], contenedor: null },
  {
    nombre: "/inicio",
    Comp: CargandoInicio,
    ruta: ["inicio", "loading.tsx"],
    contenedor: ["inicio", "page.tsx"],
  },
  {
    nombre: "/retos",
    Comp: CargandoRetos,
    ruta: ["retos", "loading.tsx"],
    contenedor: ["retos", "page.tsx"],
  },
  {
    nombre: "/retos/[codigo]",
    Comp: CargandoReto,
    ruta: ["retos", "[codigo]", "loading.tsx"],
    contenedor: ["retos", "[codigo]", "page.tsx"],
  },
  {
    nombre: "/destacados",
    Comp: CargandoDestacados,
    ruta: ["destacados", "loading.tsx"],
    contenedor: ["destacados", "page.tsx"],
  },
  {
    nombre: "/boosts",
    Comp: CargandoBoosts,
    ruta: ["boosts", "loading.tsx"],
    contenedor: ["boosts", "page.tsx"],
  },
  {
    nombre: "/perfil",
    Comp: CargandoPerfil,
    ruta: ["perfil", "loading.tsx"],
    contenedor: ["perfil", "perfil-vista.tsx"],
  },
  {
    nombre: "/u/[username]",
    Comp: CargandoPerfilPublico,
    ruta: ["u", "[username]", "loading.tsx"],
    contenedor: ["perfil", "perfil-vista.tsx"],
  },
] as const;

/**
 * El `max-w-*` y el `py-*` de MÓVIL del primer contenedor centrado de un fichero.
 *
 * NO se ancla en `className="`: `/destacados` y `/boosts` abren su clase con `df-rise`, así que
 * exigir que `mx-auto` fuera lo primero dejaba esas dos páginas sin medir — y el caso habría
 * quedado verde por no encontrar nada, que es la peor forma de pasar.
 */
function contenedorDe(fuente: string): { ancho: string; aire: string } {
  const clase = /mx-auto w-full (max-w-[^\s"]+)[^"]*?\s(py-[^\s"]+)/.exec(fuente);
  if (!clase) throw new Error("no se encontró el contenedor `mx-auto w-full max-w-… py-…`");
  return { ancho: clase[1]!, aire: clase[2]! };
}

describe("ningún esqueleto afirma nada", () => {
  it.each(PANTALLAS.map((p) => [p.nombre, p.Comp] as const))(
    "%s no pinta más texto que el anuncio",
    (_nombre, Comp) => {
      const { container } = render(<Comp />);
      // Ni cifras, ni nombres, ni "Reto": si aparece cualquier otro texto, es contenido inventado.
      expect(container.textContent).toBe(ANUNCIO);
    },
  );

  it.each(PANTALLAS.map((p) => [p.nombre, p.Comp] as const))(
    "%s se anuncia una SOLA vez y como estado",
    (_nombre, Comp) => {
      const { container } = render(<Comp />);
      const estados = container.querySelectorAll('[role="status"]');
      // Uno: con varios, un lector de pantalla repetiría "Cargando" por cada región.
      expect(estados).toHaveLength(1);
      expect(estados[0]!.getAttribute("aria-busy")).toBe("true");
    },
  );

  it("los bloques de relleno quedan FUERA del árbol accesible", () => {
    // Si no fueran `aria-hidden`, un lector recitaría decenas de divs vacíos antes del contenido.
    const { container } = render(<CargandoDestacados />);
    const bloques = container.querySelectorAll(".animate-pulse");
    expect(bloques.length).toBeGreaterThan(5);
    for (const b of bloques) {
      expect(b.getAttribute("aria-hidden"), b.className).toBe("true");
    }
  });
});

describe("y ocupan el sitio de su página (contra el salto)", () => {
  const conContenedor = PANTALLAS.filter((p) => p.contenedor !== null);

  it.each(conContenedor.map((p) => [p.nombre, p.Comp, p.contenedor!] as const))(
    "%s usa el mismo ancho y el mismo aire que su página",
    (nombre, Comp, contenedor) => {
      const esperado = contenedorDe(leer(...contenedor));
      const { container } = render(<Comp />);
      const raiz = container.querySelector('[role="status"]')!;

      expect(raiz.className, `${nombre}: ancho distinto del de ${contenedor.join("/")}`).toContain(
        esperado.ancho,
      );
      expect(raiz.className, `${nombre}: aire vertical distinto`).toContain(esperado.aire);
    },
  );

  it("el detector funciona: lee anchos DISTINTOS en páginas distintas", () => {
    // Sin esto, un `contenedorDe` que devolviera siempre lo mismo dejaría los casos de arriba en
    // verde aunque todos los esqueletos tuvieran el ancho equivocado.
    expect(contenedorDe(leer("retos", "page.tsx")).ancho).toBe("max-w-7xl");
    expect(contenedorDe(leer("boosts", "page.tsx")).ancho).toBe("max-w-5xl");
    expect(contenedorDe(leer("retos", "[codigo]", "page.tsx")).aire).toBe("py-5");
    expect(contenedorDe(leer("retos", "page.tsx")).aire).toBe("py-8");
  });
});
