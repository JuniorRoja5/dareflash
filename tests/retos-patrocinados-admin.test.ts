/**
 * EL ADMIN DE UN RETO PATROCINADO (Fase 9 · P1) — lo que se guarda y lo que NO.
 *
 * Lo que se fija:
 *  - LA MARCA ES OBLIGATORIA si el reto es patrocinado. Sin ella habría una tarjeta con
 *    "Patrocinado por" y un hueco, y una línea de contabilidad que no se sabe a quién facturar.
 *  - LO QUE NO ES PATROCINADO NO TIENE MARCA: desmarcar la casilla limpia el nombre y el logo, así
 *    la fila nunca contradice al flag.
 *  - EL % SE GUARDA EN EL RETO Y NO SE RECALCULA NUNCA: cambiar el default del producto no puede
 *    mover ni un euro de lo ya pactado. Es el caso que protege la contabilidad entera.
 *  - UN RETO PATROCINADO SIGUE SIENDO UN RETO: se compone con `soloVip` y con `nivelMinimo`.
 *
 * Para romperlo: quitar el `refine` de la marca (rojo), guardar `sponsorNombre` aunque el reto no
 * sea patrocinado (rojo), o leer el porcentaje de la constante en vez de la fila (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { COMISION_SPONSOR_BPS_DEFECTO } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { comisionCents } from "../src/lib/comision";
import {
  crearRetoAdmin,
  crearRetoSchema,
  editarRetoAdmin,
} from "../src/server/services/retos-admin";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let adminId: string;

const AHORA = new Date();
const DIA = 86_400_000;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  adminId = await crearUsuario(prisma, { username: "admin_sponsor" });
});

/** Lo que manda el formulario, tal cual (todo texto: va en `multipart/form-data`). */
const campos = (over: Record<string, string> = {}): Record<string, string> => ({
  title: "Reto de la marca",
  category: "fitness",
  prizeAmountCents: "100000",
  startsAt: new Date(AHORA.getTime() + DIA).toISOString(),
  deadline: new Date(AHORA.getTime() + 30 * DIA).toISOString(),
  winnersCount: "1",
  ...over,
});

const parsear = (over: Record<string, string> = {}) =>
  crearRetoSchema(AHORA).safeParse(campos(over));

describe("la validación del patrocinio", () => {
  it("patrocinado SIN marca no pasa, y lo dice en humano", () => {
    const r = parsear({ esPatrocinado: "1" });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0]?.message).toMatch(/nombre de la marca/i);
  });

  it("patrocinado CON marca pasa, y el % por defecto es el del producto", () => {
    const r = parsear({ esPatrocinado: "1", sponsorNombre: "Marca S.A." });
    expect(r.success).toBe(true);
    expect(r.success && r.data.comisionBps).toBe(COMISION_SPONSOR_BPS_DEFECTO);
  });

  it("un reto NORMAL no necesita marca (y el default del % no le afecta a nada)", () => {
    expect(parsear().success).toBe(true);
  });

  it("una comisión por encima del 100% es un error de tecleo, no una tarifa", () => {
    const r = parsear({ esPatrocinado: "1", sponsorNombre: "X", comisionBps: "10001" });
    expect(r.success).toBe(false);
  });

  it("y una comisión de 0 es legítima: la marca pone el premio y nada más", () => {
    const r = parsear({ esPatrocinado: "1", sponsorNombre: "X", comisionBps: "0" });
    expect(r.success && r.data.comisionBps).toBe(0);
  });

  it("«0» en la casilla significa NO, como en el reto exclusivo", () => {
    // `z.coerce.boolean()` daría `true` para "0" y un reto normal nacería patrocinado sin marca.
    const r = parsear({ esPatrocinado: "0" });
    expect(r.success && r.data.esPatrocinado).toBe(false);
  });
});

describe("lo que acaba en la fila", () => {
  const datos = (over: Record<string, unknown> = {}) => {
    const r = crearRetoSchema(AHORA).safeParse(
      campos({ esPatrocinado: "1", sponsorNombre: "Marca S.A.", comisionBps: "3000" }),
    );
    if (!r.success) throw new Error("la fixture no valida");
    return { ...r.data, ...over };
  };

  it("crear guarda marca y porcentaje", async () => {
    const creado = await crearRetoAdmin(prisma, adminId, datos());
    const fila = await prisma.challenge.findUniqueOrThrow({ where: { id: creado.id } });

    expect(fila.esPatrocinado).toBe(true);
    expect(fila.sponsorNombre).toBe("Marca S.A.");
    expect(fila.comisionBps).toBe(3000);
  });

  it("y un reto NO patrocinado no guarda marca aunque el formulario la traiga", async () => {
    // Desmarcar la casilla y dejar el nombre escrito es lo normal al editar: la fila no puede
    // quedarse con media marca.
    const creado = await crearRetoAdmin(
      prisma,
      adminId,
      datos({ esPatrocinado: false, sponsorNombre: "Marca S.A." }),
    );
    const fila = await prisma.challenge.findUniqueOrThrow({ where: { id: creado.id } });

    expect(fila.esPatrocinado).toBe(false);
    expect(fila.sponsorNombre).toBeNull();
  });

  it("editar puede QUITAR el patrocinio, y entonces se va también el logo", async () => {
    const creado = await crearRetoAdmin(prisma, adminId, datos());
    await prisma.challenge.update({
      where: { id: creado.id },
      data: { sponsorLogo: "/portadas/x-sponsor.webp?v=1" },
    });

    await editarRetoAdmin(
      prisma,
      creado.id,
      creado.publicCode,
      datos({ esPatrocinado: false, sponsorNombre: null }),
    );

    const fila = await prisma.challenge.findUniqueOrThrow({ where: { id: creado.id } });
    expect(fila.esPatrocinado).toBe(false);
    expect(fila.sponsorNombre).toBeNull();
    expect(fila.sponsorLogo, "el logo sigue apuntado en un reto sin marca").toBeNull();
  });
});

/**
 * EL CASO QUE PROTEGE LA CONTABILIDAD ENTERA. El porcentaje vive en la FILA: cambiar la tarifa del
 * producto el mes que viene no puede reescribir lo que ya se pactó —ni lo que ya se facturó—.
 */
describe("el porcentaje es del RETO, no del producto", () => {
  it("un reto guardado con el 30% sigue al 30% aunque el default fuera otro", async () => {
    const r = crearRetoSchema(AHORA).safeParse(
      campos({ esPatrocinado: "1", sponsorNombre: "Vieja Tarifa", comisionBps: "3000" }),
    );
    if (!r.success) throw new Error("la fixture no valida");
    const creado = await crearRetoAdmin(prisma, adminId, r.data);

    // Se simula el cambio de tarifa: lo que cambiaría es la CONSTANTE, no las filas.
    const fila = await prisma.challenge.findUniqueOrThrow({ where: { id: creado.id } });
    expect(fila.comisionBps).toBe(3000);
    expect(fila.comisionBps).not.toBe(COMISION_SPONSOR_BPS_DEFECTO);
    // Y la comisión se calcula con el valor de la FILA, no con el del producto.
    expect(comisionCents(fila.prizeAmountCents, fila.comisionBps)).toBe(30_000);
  });
});

describe("un reto patrocinado sigue siendo un reto", () => {
  it("se compone con exclusivo y con nivel mínimo: los tres ejes conviven", async () => {
    const r = crearRetoSchema(AHORA).safeParse(
      campos({
        esPatrocinado: "1",
        sponsorNombre: "Marca S.A.",
        soloVip: "1",
        nivelMinimo: "pro",
      }),
    );
    if (!r.success) throw new Error("la fixture no valida");
    const creado = await crearRetoAdmin(prisma, adminId, r.data);

    const fila = await prisma.challenge.findUniqueOrThrow({ where: { id: creado.id } });
    expect([fila.esPatrocinado, fila.soloVip, fila.nivelMinimo]).toEqual([true, true, "pro"]);
  });
});
