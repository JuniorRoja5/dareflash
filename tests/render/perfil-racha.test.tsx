/**
 * LA RACHA EN EL PERFIL: solo en el PROPIO.
 *
 * `PerfilVista` la comparten dos pantallas —tu perfil y el público de otra persona— y es
 * exactamente donde se cuela un dato que no tocaba: basta con pasar una prop de más desde la
 * pantalla equivocada. La defensa de verdad está en el servidor (`racha` NO entra en el DTO
 * público, así que `/u/[username]` no tiene de dónde sacarla), y esto fija la otra mitad: aunque
 * alguien se la pasara, la vista no la pinta si no es tuyo.
 *
 * Para romperlo: quitar el `esPropio &&` de la condición (rojo), o pintar un "0 días" cuando no
 * hay racha (rojo).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// El bloque del perfil PROPIO monta un componente de SERVIDOR (`ConmutadorTemaServidor`, que lee
// la cookie del tema). En jsdom eso SUSPENDE y el contenedor sale VACÍO — y un contenedor vacío
// hace pasar cualquier aserción de "esto no está", que es la mitad de lo que este fichero
// comprueba. Se sustituye por un botón tonto: lo que se prueba aquí es la racha, no el tema.
vi.mock("@/components/ui/conmutador-tema-servidor", () => ({
  ConmutadorTemaServidor: () => <button type="button">Tema</button>,
}));

import { PerfilVista } from "@/app/(app)/(shell)/perfil/perfil-vista";

afterEach(cleanup);

/** El perfil propio tiene que RENDERIZAR de verdad; si no, las aserciones de ausencia mienten. */
function pintar(props: Parameters<typeof PerfilVista>[0]): HTMLElement {
  const c = render(<PerfilVista {...props} />).container;
  expect(c.textContent, "el perfil no renderizó: las aserciones de ausencia no valdrían").toContain(
    props.handle,
  );
  return c;
}

const base = {
  displayName: "Ana",
  handle: "ana",
  imagen: null,
  bio: null,
  website: null,
  instagram: null,
  youtube: null,
  puntos: 600,
  retosGanados: 2,
  totalVideos: 3,
  videos: [],
};

describe("en MI perfil", () => {
  it("sale la racha, y el adjetivo concuerda con el número", () => {
    // Se lee el CHIP ENTERO: "1 día seguido" está CONTENIDO en "1 día seguidos", así que buscar
    // dentro del texto daba verde con el plural a medias — el descuido típico de pluralizar solo
    // el sustantivo.
    const chip = (racha: number) =>
      pintar({ ...base, racha, esPropio: true }).querySelector("[data-racha]")?.textContent;
    expect(chip(5)).toBe("5 días seguidos");
    cleanup();
    expect(chip(1)).toBe("1 día seguido");
  });

  it("sin racha NO se pinta un cero muerto (invitar es trabajo del hero de /puntos)", () => {
    const c = pintar({ ...base, racha: 0, esPropio: true });
    expect(c.querySelector("[data-racha]")).toBeNull();
  });

  it("y si no llega el dato, tampoco se inventa nada", () => {
    const c = pintar({ ...base, esPropio: true });
    expect(c.querySelector("[data-racha]")).toBeNull();
  });
});

describe("en el perfil de OTRA persona", () => {
  it("NO sale, aunque se la pasen", () => {
    // El servidor no se la pasa —no está en el DTO público—, pero la vista no se fía: la racha es
    // actividad privada, no escaparate.
    const c = pintar({ ...base, racha: 12, esPropio: false });
    expect(c.querySelector("[data-racha]"), "se filtró la racha de otra persona").toBeNull();
    expect(c.textContent).not.toContain("12 días");
  });
});
