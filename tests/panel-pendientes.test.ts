/**
 * EL ADMIN SE ENTERA SIN BUSCAR (y la empresa se entera de lo que decidimos).
 *
 * Tres invariantes:
 *
 *  1. LA CIFRA SUBE Y BAJA CON LA COLA. Crear una empresa pendiente → 1; verificarla o rechazarla →
 *     0. Y es la MISMA cifra en los tres sitios donde se enseña (insignia de la barra, total de la
 *     cabecera, tarjeta del Resumen), porque los tres leen `pendientesPanel`, que cuenta con el MISMO
 *     filtro que pinta la cola (`filtroEmpresas`). Un contador que no cuadra con su cola enseña a no
 *     creérselo.
 *  2. SOLO CUENTA LO QUE QUIEN MIRA PUEDE ATENDER. A un moderador no se le cuentan empresas.
 *  3. LO QUE SE LE PROMETE A LA EMPRESA ES VERDAD. Su portal dice «te escribimos en cuanto esté»:
 *     verificar y rechazar le mandan un correo, con el motivo y sin la nota interna.
 *
 * Para romperlo a propósito: contar con un `where` propio en vez de `filtroEmpresas` (rojo el
 * estructural); quitar el filtro de rol (rojo el del moderador); quitar `avisarDecision` de
 * verificar (rojo el de la promesa).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  pendientesDeSeccion,
  pendientesVisibles,
  textoInsignia,
  totalPendientes,
} from "../src/lib/pendientes-panel";
import {
  altaEmpresaDesdeCero,
  rechazarEmpresa,
  verificarEmpresa,
} from "../src/server/services/empresas";
import { pendientesPanel } from "../src/server/services/pendientes-panel";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;
const APP_URL = "https://dareflash.test";

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "admin_pendientes" });
});

async function unaPendiente(email = "panaderia@test.test"): Promise<string> {
  await altaEmpresaDesdeCero(
    prisma,
    {
      email,
      password: "Un4-Contrasena-Larga-Y-Buena!",
      terminosAceptadosEn: new Date(),
      nombre: "Panadería La Espiga",
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      paisIso: "ES",
      personaContacto: "Lucía",
      webUrl: "https://laespiga.test",
    },
    { adminEmail: null, urlPanel: `${APP_URL}/panel/empresas`, appUrl: APP_URL },
  );
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  return (await prisma.empresa.findUniqueOrThrow({ where: { ownerUserId: u.id } })).id;
}

/** Las tres cifras que ve el admin, calculadas como las calcula la app. */
async function lasTresCifras(rol = "ADMIN") {
  const p = await pendientesPanel(prisma, rol);
  return {
    insignia: pendientesDeSeccion("/panel/empresas", p, rol),
    cabecera: totalPendientes(p, rol),
    resumen: p.empresas,
  };
}

describe("la cifra sube y baja con la cola, igual en los tres sitios", () => {
  it("una empresa pendiente → 1 en la barra, en la cabecera y en el Resumen", async () => {
    expect(await lasTresCifras()).toEqual({ insignia: 0, cabecera: 0, resumen: 0 });
    await unaPendiente();
    expect(await lasTresCifras()).toEqual({ insignia: 1, cabecera: 1, resumen: 1 });
  });

  it("al verificarla, baja a 0", async () => {
    const id = await unaPendiente();
    await verificarEmpresa(prisma, { empresaId: id, actorId: admin, appUrl: APP_URL });
    expect(await lasTresCifras()).toEqual({ insignia: 0, cabecera: 0, resumen: 0 });
  });

  it("al rechazarla, también baja a 0", async () => {
    const id = await unaPendiente();
    await rechazarEmpresa(prisma, {
      empresaId: id,
      actorId: admin,
      motivo: "DATOS_INSUFICIENTES",
      appUrl: APP_URL,
    });
    expect(await lasTresCifras()).toEqual({ insignia: 0, cabecera: 0, resumen: 0 });
  });

  it("y la cifra coincide con las filas de la cola filtrada", async () => {
    await unaPendiente("a@test.test");
    await unaPendiente("b@test.test");
    const { listarEmpresas } = await import("../src/server/services/empresas");
    const cola = await listarEmpresas(prisma, { estado: "PENDIENTE" });
    expect((await lasTresCifras()).resumen).toBe(cola.items.length);
  });
});

describe("solo cuenta lo que quien mira puede atender", () => {
  it("a un moderador no se le cuentan empresas (no es su sección)", async () => {
    await unaPendiente();
    expect(await lasTresCifras("MODERATOR")).toEqual({ insignia: 0, cabecera: 0, resumen: 0 });
  });

  it("puro: visibles, total e insignia", () => {
    const p = { empresas: 3 };
    expect(pendientesVisibles(p, "ADMIN")).toEqual({ empresas: 3 });
    expect(pendientesVisibles(p, "MODERATOR")).toEqual({ empresas: 0 });
    expect(totalPendientes(p, "ADMIN")).toBe(3);
    expect(pendientesDeSeccion("/panel/retos", p, "ADMIN")).toBe(0);
    expect(textoInsignia(0)).toBeNull();
    expect(textoInsignia(7)).toBe("7");
    expect(textoInsignia(150)).toBe("99+");
  });
});

describe("lo prometido a la empresa: un correo cuando decidimos", () => {
  const decisiones = () =>
    prisma.job.findMany({ where: { idempotencyKey: { startsWith: "empresa-decision:" } } });

  it("verificar le escribe, a SU correo, con el enlace a su portal", async () => {
    const id = await unaPendiente();
    await verificarEmpresa(prisma, { empresaId: id, actorId: admin, appUrl: APP_URL });
    const [job] = await decisiones();
    const p = job?.payload as { to?: string; subject?: string; text?: string };
    expect(p.to).toBe("panaderia@test.test");
    expect(p.subject).toMatch(/verificada/i);
    expect(p.text).toContain(`${APP_URL}/empresa`);
  });

  it("rechazar le cuenta el MOTIVO y nunca la nota interna", async () => {
    const id = await unaPendiente();
    await rechazarEmpresa(prisma, {
      empresaId: id,
      actorId: admin,
      motivo: "WEB_NO_VALIDA",
      nota: "Traza interna: el dominio caducó en 2024.",
      appUrl: APP_URL,
    });
    const [job] = await decisiones();
    const texto = JSON.stringify(job?.payload);
    expect(texto).toContain("No hemos podido comprobar la web");
    expect(texto).not.toContain("Traza interna");
    // Ni quién lo decidió.
    expect(texto).not.toContain(admin);
  });

  it("verificar dos veces, un correo (la segunda no es un hecho)", async () => {
    const id = await unaPendiente();
    await verificarEmpresa(prisma, { empresaId: id, actorId: admin, appUrl: APP_URL });
    await verificarEmpresa(prisma, { empresaId: id, actorId: admin, appUrl: APP_URL });
    expect(await decisiones()).toHaveLength(1);
  });

  it("cambiar SOLO la nota de un rechazo no le reenvía nada: para ella no ha cambiado", async () => {
    const id = await unaPendiente();
    const base = { empresaId: id, actorId: admin, motivo: "DUPLICADA" as const, appUrl: APP_URL };
    await rechazarEmpresa(prisma, { ...base, nota: "primera" });
    await rechazarEmpresa(prisma, { ...base, nota: "segunda" });
    expect(await decisiones()).toHaveLength(1);
    // Cambiar el MOTIVO sí: es lo que ella lee.
    await rechazarEmpresa(prisma, { ...base, motivo: "SOSPECHA_FRAUDE", nota: "segunda" });
    expect(await decisiones()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------
// Estructural: una sola fuente, y ninguna sección sin icono.
// ---------------------------------------------------------------------------------------------------

const leer = (...p: string[]) => readFileSync(path.resolve(__dirname, "..", ...p), "utf8");
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("una sola fuente para las tres cifras", () => {
  it("el contador y la cola usan el MISMO filtro", () => {
    const svc = soloCodigo(leer("src", "server", "services", "empresas.ts"));
    expect(svc).toMatch(/count\(\{ where: filtroEmpresas\(estado\) \}\)/);
    expect(svc).toMatch(/const filtro = filtroEmpresas\(opciones\.estado\)/);
  });

  it("la barra, la cabecera y el Resumen leen `pendientesPanel`", () => {
    expect(soloCodigo(leer("src", "app", "panel", "layout.tsx"))).toContain("pendientesPanel(");
    expect(soloCodigo(leer("src", "app", "panel", "page.tsx"))).toContain("pendientesPanel(");
    // La barra no consulta (es de cliente): recibe la cifra del layout y la reparte por sección.
    expect(soloCodigo(leer("src", "app", "panel", "panel-nav.tsx"))).toContain(
      "pendientesDeSeccion(",
    );
  });

  it("la tarjeta del Resumen lleva a la cola YA filtrada", () => {
    expect(leer("src", "app", "panel", "page.tsx")).toContain(
      'href="/panel/empresas?estado=PENDIENTE"',
    );
  });
});

describe("ninguna sección del panel sin icono", () => {
  it("toda sección tiene el suyo", async () => {
    // Empresas nació sin icono y la barra la pintaba con un hueco: que la próxima no nazca igual.
    const { SECCIONES_PANEL } = await import("../src/app/panel/secciones");
    const { ICONO_SECCION } = await import("../src/app/panel/panel-iconos");
    const sinIcono = SECCIONES_PANEL.filter((s) => !ICONO_SECCION[s.href]).map((s) => s.href);
    expect(sinIcono).toEqual([]);
  });
});
