/**
 * QUIÉN PUEDE DENUNCIAR — la regla pura que comparten el botón y la ruta.
 *
 * Que sea UNA sola función es el invariante: con dos copias, el botón acabaría ofreciendo lo que la
 * API rechaza (o escondiéndose donde sí se puede), y eso se lee como que la app miente.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { veredictoDenuncia } from "../src/lib/denuncias";

describe("veredictoDenuncia", () => {
  const base = { haySesion: true, emailVerificado: true, esMio: false };

  it("con sesión, correo verificado y algo ajeno: puede", () => {
    expect(veredictoDenuncia(base)).toBe("puede");
  });

  it("lo propio no se denuncia, mande lo que mande el resto", () => {
    expect(veredictoDenuncia({ ...base, esMio: true })).toBe("propio");
    // Ni siquiera preguntándole por el correo: lo tuyo se borra o se retira, no se denuncia.
    expect(veredictoDenuncia({ haySesion: true, emailVerificado: false, esMio: true })).toBe(
      "propio",
    );
  });

  it("un invitado, primero entra", () => {
    expect(veredictoDenuncia({ ...base, haySesion: false })).toBe("sin_sesion");
  });

  it("con sesión pero sin verificar el correo: la misma barrera que votar o comentar", () => {
    expect(veredictoDenuncia({ ...base, emailVerificado: false })).toBe("sin_verificar");
  });
});

describe("una sola regla (estructural)", () => {
  const leer = (rel: string): string =>
    readFileSync(path.resolve(__dirname, "..", "src", rel), "utf8");

  it("la usan LOS DOS lados: el botón y la ruta", () => {
    expect(leer("components/ui/denunciar.tsx")).toContain("veredictoDenuncia");
    expect(leer("app/api/denuncias/route.ts")).toContain("veredictoDenuncia");
  });

  it("y el `esMio` que recibe el botón es el del SERVIDOR, no uno inventado en la vista", () => {
    // Con un `esMio={false}` fijo, el botón se ofrecería sobre lo propio y la API lo rechazaría: la
    // pantalla prometería algo que no se puede hacer.
    expect(leer("components/feed/feed-vertical.tsx")).toMatch(
      /<Denunciar[\s\S]{0,300}?esMio=\{post\.esMio\}/,
    );
    expect(leer("components/feed/comentarios-video.tsx")).toMatch(
      /<Denunciar[\s\S]{0,300}?esMio=\{c\.esMio\}/,
    );
  });

  it("y el punto ÚNICO de creación es el servicio: nadie más escribe un Report", () => {
    // Si una ruta o un componente escribiera `report.create` por su cuenta, se saltaría la
    // comprobación del objeto, la del dueño y la idempotencia de golpe.
    const dir = path.resolve(__dirname, "..", "src");
    const ficheros = (function recorrer(d: string): string[] {
      return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return recorrer(p);
        return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
      });
    })(dir);
    const culpables = ficheros
      .map((f) => ({ rel: path.relative(dir, f).split(path.sep).join("/"), abs: f }))
      // `src/generated/` es el cliente de Prisma (gitignoreado): ahí `report.create` ES la API.
      .filter((f) => !f.rel.startsWith("generated/"))
      .filter((f) => /report\s*\.\s*create/i.test(readFileSync(f.abs, "utf8")))
      .map((f) => f.rel);
    expect(culpables).toEqual(["server/services/denuncias.ts"]);
  });
});
