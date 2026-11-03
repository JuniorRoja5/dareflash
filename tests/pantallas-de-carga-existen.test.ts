/**
 * QUE CADA PANTALLA CUBIERTA TENGA SU `loading.tsx` — sin importar ni renderizar nada.
 *
 * ┌─ POR QUÉ ESTE FICHERO EXISTE APARTE ───────────────────────────────────────────────────────────┐
 * │ La comprobación empezó dentro de `tests/render/pantallas-de-carga`, que IMPORTA cada           │
 * │ componente para renderizarlo. Al borrar un `loading.tsx` para comprobar el diente, el import   │
 * │ estático tumbaba el fichero ENTERO antes de ejecutar un solo caso: la suite salía roja, sí,     │
 * │ pero con "Failed to resolve import" y cero casos corridos. Eso no dice QUÉ falta, y un rojo que │
 * │ no se explica se arregla borrando la línea que molesta.                                         │
 * │                                                                                                 │
 * │ Aquí se mira el disco y nada más, así que borrar un fichero da un caso ROJO CON NOMBRE: "falta  │
 * │ el loading.tsx de /retos". Lo de renderizar —que no invente datos y que no salte— sigue en el   │
 * │ otro fichero, que para eso sí necesita importarlos.                                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL FALLO QUE CIERRA: 27 páginas `force-dynamic` y ni un `loading.tsx`. Al navegar, Next se queda
 * en la pantalla anterior hasta que responde el servidor — pulsas y no pasa nada. Borrar uno de
 * estos ficheros devuelve esa sensación sin que nada más se queje.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * La raíz es `(app)`, NO `(shell)`: `/feed` cuelga del armazón pero vive FUERA del shell —eso es lo
 * que lo deja ser inmersivo— y por tanto el `loading.tsx` de reserva del shell NO le llega. Con la
 * raíz puesta en `(shell)` esta lista no habría podido ni nombrarlo, que es como se quedó fuera la
 * pantalla de más tráfico de la app.
 */
const APP = join(process.cwd(), "src", "app", "(app)");

/** Las rutas que se decidió cubrir con su propio esqueleto, más el de reserva del grupo. */
const CUBIERTAS: ReadonlyArray<{ nombre: string; ruta: readonly string[] }> = [
  { nombre: "el shell (reserva de las demás secciones)", ruta: ["(shell)", "loading.tsx"] },
  { nombre: "/feed (fuera del shell: no le llega el de reserva)", ruta: ["feed", "loading.tsx"] },
  { nombre: "/inicio", ruta: ["(shell)", "inicio", "loading.tsx"] },
  { nombre: "/retos", ruta: ["(shell)", "retos", "loading.tsx"] },
  { nombre: "/retos/[codigo]", ruta: ["(shell)", "retos", "[codigo]", "loading.tsx"] },
  { nombre: "/destacados", ruta: ["(shell)", "destacados", "loading.tsx"] },
  { nombre: "/boosts", ruta: ["(shell)", "boosts", "loading.tsx"] },
  { nombre: "/perfil", ruta: ["(shell)", "perfil", "loading.tsx"] },
  { nombre: "/u/[username]", ruta: ["(shell)", "u", "[username]", "loading.tsx"] },
];

describe("cada pantalla cubierta tiene su esqueleto", () => {
  it.each(CUBIERTAS.map((c) => [c.nombre, c.ruta] as const))(
    "falta el loading.tsx de %s",
    (nombre, ruta) => {
      const f = join(APP, ...ruta);
      expect(existsSync(f), `no existe ${ruta.join("/")} (pantalla: ${nombre})`).toBe(true);
      // Y que no sea un fichero vacío que cumpla la letra sin hacer nada.
      expect(readFileSync(f, "utf8")).toMatch(/export default function/);
    },
  );

  it("y todos pasan por la primitiva, en vez de maquetar su propio contenedor", () => {
    // Si uno escribiera su `mx-auto max-w-… py-…` a mano, el contraste contra la página del otro
    // fichero seguiría pasando pero el anuncio para lectores de pantalla se podría haber quedado
    // fuera. La primitiva es lo que garantiza el `role="status"` en todas.
    for (const { nombre, ruta } of CUBIERTAS) {
      const fuente = readFileSync(join(APP, ...ruta), "utf8");
      expect(fuente, `${nombre} no usa la primitiva`).toMatch(/PantallaCargando|Esqueleto\w*/);
    }
  });

  it("el detector funciona: una ruta inventada NO existe", () => {
    // Sin esto, un `existsSync` mal usado (o una RAIZ equivocada) dejaría todo en verde.
    expect(existsSync(join(APP, "no-existe-esta-seccion", "loading.tsx"))).toBe(false);
  });
});
