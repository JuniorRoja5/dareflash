/**
 * QUE /puntos Y /referidos EXISTAN NO BASTA: HAY QUE PODER LLEGAR.
 *
 * El enlace de invitación vivía enterrado en "editar perfil", donde nadie iba a buscarlo. Moverlo a
 * su propia página solo arregla algo si de verdad se llega, y lo mismo vale para la sección de
 * puntos, que nació separándose de la de referidos. Así que aquí se afirma lo que ninguna pantalla
 * afirma sola: las dos entradas están en la navegación de escritorio (como una sección más, no como
 * un caso especial) y en el perfil propio para móvil, donde no hay lateral.
 *
 * LAS DOS SE COMPRUEBAN CON EL MISMO BUCLE a propósito. Una tercera sección que se añada al catálogo
 * y no a esta lista no falla —no se puede exigir lo que no se conoce—, pero mientras estas dos estén
 * aquí, degradar cualquiera de ellas a "enlace pintado a mano" cae en rojo.
 *
 * Para romperlo: sacar "puntos" o "referidos" de `NAV_ESCRITORIO` (rojo), quitar su botón del perfil
 * (rojo), devolver el enlace de invitación a /perfil/editar (rojo), o cambiar el keyset por OFFSET
 * (rojo).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  destinoActivo,
  NAV_DESTINOS,
  NAV_ESCRITORIO,
  destinosDe,
} from "../src/components/ui/logic";

const RAIZ = process.cwd();
const leer = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const soloCodigo = (f: string) =>
  f.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
const pagina = (seccion: string) =>
  soloCodigo(leer("src", "app", "(app)", "(shell)", seccion, "page.tsx"));

/**
 * El OFFSET que se persigue es el de SQL, no el de CSS: `underline-offset-2` y `outline-offset` son
 * utilidades de Tailwind y un `\boffset\b` pelado las caza a las dos (el guion cuenta como frontera
 * de palabra). Un guard que se pone rojo por una clase de subrayado se acaba borrando por pesado, y
 * con él se va la vigilancia de verdad. Se exige que la palabra NO venga pegada a un guion.
 */
const OFFSET_SQL = /(?<![-\w])offset\b/i;

/** Las dos secciones que estrenan entrada propia, y el botón con el que se llega desde el perfil. */
const SECCIONES = [
  { clave: "puntos", ruta: "/puntos", boton: "Mis puntos y nivel" },
  { clave: "referidos", ruta: "/referidos", boton: "Ir a mis referidos" },
] as const;

describe.each(SECCIONES)(
  "$clave: la entrada de escritorio es una sección MÁS",
  ({ clave, ruta }) => {
    it("es un destino del catálogo y está en la barra lateral", () => {
      const destino = NAV_DESTINOS.find((d) => d.clave === clave);
      expect(destino, `${clave} no está en NAV_DESTINOS`).toBeDefined();
      expect(destino?.href).toBe(ruta);
      expect([...NAV_ESCRITORIO]).toContain(clave);
      // Y se resuelve por la misma vía que los demás, así que la lateral lo pinta sin saber nada de él.
      expect(destinosDe(NAV_ESCRITORIO).map((d) => d.clave)).toContain(clave);
    });

    it("el ACTIVO funciona igual que en el resto de secciones", () => {
      expect(destinoActivo(ruta)).toBe(clave);
      // Y sus subrutas, como en Retos. Una ruta que solo empieza parecido NO cuenta.
      expect(destinoActivo(`${ruta}/lo-que-sea`)).toBe(clave);
      expect(destinoActivo(`${ruta}xyz`)).not.toBe(clave);
    });

    it("la lateral NO la trata aparte: pinta la lista y ya", () => {
      const nav = soloCodigo(leer("src", "components", "ui", "navegacion.tsx"));
      // Si alguien añadiera un <Link href="/puntos"> suelto al lado del bucle, esto lo caza.
      expect(nav).not.toContain(`"${ruta}"`);
      expect(nav).toContain("destinosDe(NAV_ESCRITORIO)");
    });

    it("y tiene su propio icono: la lateral lo pinta por clave, no con un hueco", () => {
      const nav = soloCodigo(leer("src", "components", "ui", "navegacion.tsx"));
      // `ICONO[d.clave]` con una clave que no existe no falla: renderiza vacío. Un destino sin icono
      // sale como una fila con texto y un hueco, y nadie lo nota hasta verlo.
      expect(nav).toMatch(new RegExp(`^\\s{2}${clave}: svg\\(`, "m"));
    });
  },
);

describe.each(SECCIONES)("$clave: la entrada de móvil es el perfil propio", ({ ruta, boton }) => {
  it("el perfil enlaza a la sección, y solo en el propio", () => {
    const perfil = leer("src", "app", "(app)", "(shell)", "perfil", "perfil-vista.tsx");
    expect(perfil).toContain(`href="${ruta}"`);
    expect(perfil).toContain(boton);
    // Va dentro del bloque de `esPropio`, con Editar perfil: no se le ofrece a quien mira a otro.
    const propio = perfil.slice(perfil.indexOf("esPropio ? ("));
    expect(propio).toContain(`href="${ruta}"`);
    expect(propio.indexOf(`href="${ruta}"`)).toBeLessThan(propio.indexOf("</>"));
  });
});

describe.each(SECCIONES)("$clave: exige sesión y pagina por keyset", ({ clave, ruta }) => {
  it("exige sesión, y al invitado lo manda a entrar (no lo deja en blanco)", () => {
    const p = pagina(clave);
    expect(p).toContain("getCurrentUser");
    expect(p).toMatch(/if \(!sesion\) redirect\("\/entrar\?siguiente=/);
    // Y vuelve AQUÍ al terminar: un `siguiente=` a otra parte deja al usuario donde no pidió estar.
    expect(p).toContain(encodeURIComponent(ruta));
  });

  it("la paginación es por CURSOR, nunca OFFSET ni scroll infinito", () => {
    const p = pagina(clave);
    // La página delega los controles en `PasosKeyset`, así que lo que se exige aquí es que los monte
    // con SU cursor y su posición. El cómo se arma la URL se comprueba abajo, donde vive.
    expect(p).toContain("<PasosKeyset");
    expect(p).toMatch(/proximoCursor=\{/);
    expect(p).toContain("leerPila");
    for (const prohibido of [OFFSET_SQL, /\bskip:/, /q\.set\("page"/, /IntersectionObserver/]) {
      expect(p, String(prohibido)).not.toMatch(prohibido);
    }
  });
});

describe("los controles de paso, donde de verdad viven", () => {
  it("`PasosKeyset` arma la URL con el cursor y la pila, y no numera páginas", () => {
    const pasos = soloCodigo(leer("src", "components", "ui", "pasos-keyset.tsx"));
    expect(pasos).toContain("enlacePaginado");
    expect(pasos).toContain("Anterior");
    expect(pasos).toContain("Siguiente");
    for (const prohibido of [OFFSET_SQL, /q\.set\("page"/, /IntersectionObserver/]) {
      expect(pasos, String(prohibido)).not.toMatch(prohibido);
    }
  });

  it("y `enlacePaginado` pone cursor y pila, nunca un número de página", () => {
    const lib = soloCodigo(leer("src", "lib", "paginacion-pila.ts"));
    expect(lib).toMatch(/q\.set\("cursor", /);
    expect(lib).toMatch(/q\.set\("pila", /);
    expect(lib).not.toMatch(/q\.set\("page"/);
  });
});

describe("el enlace de invitación se MUDÓ, no se duplicó", () => {
  it("ya no está en /perfil/editar", () => {
    const dir = ["src", "app", "(app)", "(shell)", "perfil", "editar"];
    for (const f of ["page.tsx", "formulario-editar-perfil.tsx"]) {
      const codigo = leer(...dir, f);
      expect(codigo, `${f} sigue montando el enlace`).not.toContain("CampoCopiable");
      expect(codigo, `${f} sigue leyendo el código de referido`).not.toContain("referralCode");
    }
  });

  it("y sí está en /referidos, con el código y el enlace por separado", () => {
    const p = pagina("referidos");
    expect(p).toContain("enlaceReferido");
    // Los campos se mudaron de la página al HERO cuando /referidos recibió su tratamiento de vida.
    // El guard sigue a la lógica en vez de aflojarse: la página monta el hero, y el hero lleva los
    // DOS campos —el enlace (lo que se pega) y el código (para donde no cabe un enlace)—.
    expect(p).toContain("<HeroInvitacion");
    const hero = soloCodigo(
      leer("src", "app", "(app)", "(shell)", "referidos", "hero-invitacion.tsx"),
    );
    expect(hero.match(/<CampoCopiable/g)?.length ?? 0).toBe(2);
  });
});

describe("la tabla de puntos se mudó a /puntos, y no quedó una copia", () => {
  it("/referidos ya no la monta", () => {
    expect(pagina("referidos")).not.toContain("TablaPuntos");
  });

  it("/puntos sí, y además la escalera y el hero de nivel", () => {
    const p = pagina("puntos");
    for (const pieza of ["TablaPuntos", "EscaleraNiveles", "HeroNivel", "HistorialMisPuntos"]) {
      expect(p, `falta ${pieza}`).toContain(`<${pieza}`);
    }
  });
});
