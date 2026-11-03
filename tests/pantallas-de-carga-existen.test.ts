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

const SHELL = join(process.cwd(), "src", "app", "(app)", "(shell)");

/** Las rutas que se decidió cubrir con su propio esqueleto, más el de reserva del grupo. */
const CUBIERTAS: ReadonlyArray<{ nombre: string; ruta: readonly string[] }> = [
  { nombre: "el shell (reserva de las demás secciones)", ruta: ["loading.tsx"] },
  { nombre: "/inicio", ruta: ["inicio", "loading.tsx"] },
  { nombre: "/retos", ruta: ["retos", "loading.tsx"] },
  { nombre: "/retos/[codigo]", ruta: ["retos", "[codigo]", "loading.tsx"] },
  { nombre: "/destacados", ruta: ["destacados", "loading.tsx"] },
  { nombre: "/boosts", ruta: ["boosts", "loading.tsx"] },
  { nombre: "/perfil", ruta: ["perfil", "loading.tsx"] },
  { nombre: "/u/[username]", ruta: ["u", "[username]", "loading.tsx"] },
];

describe("cada pantalla cubierta tiene su esqueleto", () => {
  it.each(CUBIERTAS.map((c) => [c.nombre, c.ruta] as const))(
    "falta el loading.tsx de %s",
    (nombre, ruta) => {
      const f = join(SHELL, ...ruta);
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
      const fuente = readFileSync(join(SHELL, ...ruta), "utf8");
      expect(fuente, `${nombre} no usa la primitiva`).toMatch(/PantallaCargando|Esqueleto\w*/);
    }
  });

  it("el detector funciona: una ruta inventada NO existe", () => {
    // Sin esto, un `existsSync` mal usado (o una RAIZ equivocada) dejaría todo en verde.
    expect(existsSync(join(SHELL, "no-existe-esta-seccion", "loading.tsx"))).toBe(false);
  });
});
