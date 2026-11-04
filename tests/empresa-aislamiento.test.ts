/**
 * AISLAMIENTO ENTRE EMPRESAS (Fase 9 · P1) — la prioridad 1 de la pieza.
 *
 * La pregunta que hay que poder contestar sin leer código es: «¿por qué la empresa A no puede ver
 * nada de la B?». «Porque todas las consultas filtran» no es una respuesta: es una promesa que se
 * rompe el día que alguien añade la consulta número quince. Esta fase ya pagó esa factura —el
 * auto-ocultado filtraba en una superficie y no en la otra, con la suite entera en verde—, y lo que
 * falló no fue la lógica: fue que UNA SUPERFICIE NO SE CONTÓ.
 *
 * Así que aquí hay dos clases de comprobación, y las dos hacen falta:
 *
 *  - CONTRA LA BASE DE DATOS, con dos empresas de verdad: lo que el portal devuelve para A no trae
 *    ni un campo de B. Con un mock esto saldría verde sin probar nada — un mock no demuestra un
 *    `where`.
 *  - UN CENSO DE SUPERFICIES: que el `empresaId` solo lo produzca el chokepoint y que ninguna
 *    función nueva se cuele cogiendo un `userId` para buscar una empresa por su cuenta. Es la
 *    comprobación que el fallo del auto-ocultado habría cazado y la suite no tenía.
 *
 * Para romperlo a propósito: cambiar el `findUnique({ where: { id } })` de `miEmpresa` por un
 * `findFirst({})` (rojo el primero); añadir al servicio un `miEmpresaDeUsuario(db, userId)` de
 * conveniencia (rojo el censo); leer `empresaId` del cuerpo de una ruta del portal (rojo el del
 * chokepoint).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  empresaDeUsuario,
  listarEmpresas,
  miEmpresa,
  registrarEmpresa,
  verificarEmpresa,
} from "../src/server/services/empresas";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;

/** A y B: dos empresas de dos personas distintas, con datos distinguibles a simple vista. */
let userA: string;
let userB: string;
let empresaA: string;
let empresaB: string;
let admin: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "admin_aislamiento" });
  userA = await crearUsuario(prisma, { username: "duena_a" });
  userB = await crearUsuario(prisma, { username: "dueno_b" });

  const aviso = { adminEmail: null, urlPanel: "https://dareflash.com/panel/empresas" };
  empresaA = (
    await registrarEmpresa(
      prisma,
      {
        userId: userA,
        nombre: "Panadería A",
        tipoCuenta: "EMPRESA",
        tipoNegocio: "FISICO",
        direccion: "Calle A",
      },
      aviso,
      new Date(Date.UTC(2027, 0, 10, 12)),
    )
  ).id;
  empresaB = (
    await registrarEmpresa(
      prisma,
      {
        userId: userB,
        nombre: "Tienda B",
        tipoCuenta: "MARCA_PERSONAL",
        tipoNegocio: "MARCA_O_DIGITAL",
        webUrl: "https://b.example.com",
      },
      aviso,
      new Date(Date.UTC(2027, 0, 11, 12)),
    )
  ).id;
});

describe("con dos empresas de verdad en la base de datos", () => {
  it("el chokepoint resuelve la de cada uno, y solo la de cada uno", async () => {
    expect((await empresaDeUsuario(prisma, userA))?.id).toBe(empresaA);
    expect((await empresaDeUsuario(prisma, userB))?.id).toBe(empresaB);
    // Y quien no tiene empresa no hereda la de nadie: `null` es una respuesta, no un hueco.
    const sinEmpresa = await crearUsuario(prisma, { username: "sin_empresa" });
    expect(await empresaDeUsuario(prisma, sinEmpresa)).toBeNull();
  });

  it("el portal de A no devuelve NI UN campo de B", async () => {
    const suya = await miEmpresa(prisma, empresaA);
    expect(suya?.id).toBe(empresaA);
    expect(suya?.nombre).toBe("Panadería A");
    const serializada = JSON.stringify(suya);
    for (const deB of [empresaB, "Tienda B", "https://b.example.com", userB]) {
      expect(serializada, `se ha colado ${deB}`).not.toContain(deB);
    }
  });

  it("y sigue siendo la de A aunque B sea la más reciente Y la única verificada", async () => {
    // El caso que cazaría un `findFirst` sin `where`: B es la que saldría "primera" por cualquier
    // orden natural (más nueva, verificada), así que si el ámbito se perdiera, se vería aquí.
    await verificarEmpresa(prisma, { empresaId: empresaB, actorId: admin });
    const suya = await miEmpresa(prisma, empresaA);
    expect(suya?.id).toBe(empresaA);
    expect(suya?.estado).toBe("PENDIENTE");
  });

  it("un id que no es de nadie no devuelve la primera que haya", async () => {
    // "No existe" y "no es tuya" tienen que dar lo MISMO (null -> 404 arriba): dos respuestas
    // distintas serían un oráculo que confirma qué empresas existen.
    expect(await miEmpresa(prisma, "empresa-que-no-existe")).toBeNull();
  });

  it("el panel SÍ ve las dos: es su trabajo, y por eso su DTO es otro", async () => {
    const pagina = await listarEmpresas(prisma, {});
    expect(pagina.items.map((e) => e.id).sort()).toEqual([empresaA, empresaB].sort());
    // Lo que NO ve ni el panel: el correo del dueño. Solo su handle.
    expect(JSON.stringify(pagina.items)).not.toContain("@dareflash");
    expect(pagina.items.map((e) => e.dueno).sort()).toEqual(["dueno_b", "duena_a"].sort());
  });
});

// ---------------------------------------------------------------------------------------------------
// EL CENSO DE SUPERFICIES (estructural). No comprueba un resultado: fija una DECISIÓN.
// ---------------------------------------------------------------------------------------------------

const raiz = (...p: string[]) => path.resolve(__dirname, "..", ...p);
const leer = (...p: string[]) => readFileSync(raiz(...p), "utf8");

const FUENTE_SERVICIO = leer("src", "server", "services", "empresas.ts");
const FUENTE_CHOKEPOINT = leer("src", "server", "auth", "empresa-actual.ts");

/**
 * SIN COMENTARIOS. Una página que EXPLICA en su docblock que el ámbito sale del chokepoint contiene
 * la palabra `empresaId` en la prosa, y el detector la contaba como infracción: se ponía rojo por el
 * texto que documenta la regla que vigila. Un guard que castiga explicar la regla acaba borrado, y
 * con él la vigilancia de verdad. (La misma precaución que `panel-roles`.)
 */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Las funciones exportadas del servicio, tal y como están escritas. */
function exportadas(fuente: string): string[] {
  return [...fuente.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]!);
}

/**
 * La firma de una función: de su nombre hasta el paréntesis que CIERRA su lista de parámetros,
 * contando anidamientos.
 *
 * Cortar «hasta `Promise<`» parecía más corto y era un falso rojo: `claveAvisoEmpresa` no devuelve
 * una promesa, así que el corte se iba a la función siguiente y le atribuía SUS parámetros. Un
 * detector que lee de más acusa a quien no es, y eso acaba con el detector borrado.
 */
function firmaDe(fuente: string, nombre: string): string {
  const i = fuente.indexOf(`function ${nombre}(`);
  if (i < 0) return "";
  let profundidad = 0;
  for (let j = fuente.indexOf("(", i); j < fuente.length; j += 1) {
    if (fuente[j] === "(") profundidad += 1;
    else if (fuente[j] === ")") {
      profundidad -= 1;
      if (profundidad === 0) return fuente.slice(i, j + 1);
    }
  }
  return "";
}

/**
 * CADA FUNCIÓN DEL SERVICIO, CLASIFICADA A MANO. Esto es el censo: una función nueva no puede
 * aparecer sin que alguien escriba aquí de qué clase es, que es justo el paso que no se dio con el
 * auto-ocultado.
 */
const CLASIFICADAS: Record<string, "clave" | "chokepoint" | "alta" | "ambito" | "panel"> = {
  claveAvisoEmpresa: "clave",
  // La ÚNICA que busca una empresa por su dueño. La llama solo el chokepoint.
  empresaDeUsuario: "chokepoint",
  registrarEmpresa: "alta",
  miEmpresa: "ambito",
  verificarEmpresa: "ambito",
  rechazarEmpresa: "ambito",
  listarEmpresas: "panel",
};

describe("el censo de superficies del portal", () => {
  it("toda función exportada del servicio está clasificada", () => {
    const sinClasificar = exportadas(FUENTE_SERVICIO).filter((n) => !(n in CLASIFICADAS));
    // Si esto falla: clasifica la función nueva arriba. Si recibe un `userId` para BUSCAR una
    // empresa, no la clasifiques: hazla pasar por el chokepoint.
    expect(sinClasificar).toEqual([]);
  });

  it("solo UNA función busca una empresa por su usuario", () => {
    const conUserId = exportadas(FUENTE_SERVICIO).filter((n) =>
      /\buserId\b/.test(firmaDe(FUENTE_SERVICIO, n)),
    );
    expect(conUserId).toEqual(["empresaDeUsuario"]);
  });

  it("y las que operan sobre UNA empresa reciben su `empresaId` por parámetro obligatorio", () => {
    for (const [nombre, clase] of Object.entries(CLASIFICADAS)) {
      if (clase !== "ambito") continue;
      const firma = firmaDe(FUENTE_SERVICIO, nombre);
      expect(firma, `${nombre} no recibe empresaId`).toMatch(/empresaId/);
      // Y no opcional: un `empresaId?` volvería a ser un filtro que se puede olvidar.
      expect(firma, `${nombre} lo recibe opcional`).not.toMatch(/empresaId\?/);
    }
  });

  it("el resolvedor del chokepoint no se usa en ningún otro sitio", () => {
    // La garantía de "un solo productor del ámbito" es esta: si alguien importa `empresaDeUsuario`
    // en una ruta o una página, ya hay dos caminos para obtener un id y uno no pasa por el guard.
    expect(FUENTE_CHOKEPOINT).toContain("empresaDeUsuario");
    const sospechosos = [
      "src/app/(app)/(shell)/empresa/page.tsx",
      "src/app/(app)/(shell)/empresa/alta/page.tsx",
      "src/app/api/empresa/route.ts",
      "src/app/panel/empresas/page.tsx",
    ].filter((rel) => soloCodigo(leer(...rel.split("/"))).includes("empresaDeUsuario"));
    expect(sospechosos).toEqual([]);
  });

  it("el detector mira el CÓDIGO, no la prosa que explica la regla", () => {
    // Control: la pantalla del dueño documenta en su docblock de dónde sale el ámbito, y nombra
    // `empresaId` al hacerlo. Si `soloCodigo` dejara de quitar comentarios, el caso de arriba se
    // pondría rojo por la documentación — y alguien lo arreglaría borrando la explicación.
    const crudo = leer("src", "app", "(app)", "(shell)", "empresa", "page.tsx");
    expect(crudo).toMatch(/\* .*empresaId/);
    expect(soloCodigo(crudo)).not.toMatch(/\* .*empresaId/);
  });

  it("ninguna superficie del portal saca el `empresaId` de la petición", () => {
    // Un `empresaId` que viene del cliente es un IDOR con otro nombre. En el portal, todas sus
    // apariciones tienen que venir del ámbito que devuelve el guard.
    for (const rel of [
      "src/app/(app)/(shell)/empresa/page.tsx",
      "src/app/(app)/(shell)/empresa/alta/page.tsx",
      "src/app/api/empresa/route.ts",
    ]) {
      const fuente = soloCodigo(leer(...rel.split("/")));
      const usos = [...fuente.matchAll(/(\w*\.)?empresaId/g)].map((m) => m[0]);
      for (const uso of usos) {
        expect(uso, `${rel}: ${uso} no sale del ámbito`).toBe("ambito.empresaId");
      }
    }
  });

  it("la lista del panel compone el keyset con AND, no por spread", () => {
    // `...dondeDesde()` funciona hoy —el filtro es una conjunción plana— y se come una rama el día
    // que alguien añada un `OR` ("pendientes O rechazadas"), sin avisar y sin fallar.
    expect(FUENTE_SERVICIO).toContain("conKeysetTiempo(filtro");
    expect(FUENTE_SERVICIO).not.toMatch(/\.\.\.dondeDesde\(/);
  });
});
