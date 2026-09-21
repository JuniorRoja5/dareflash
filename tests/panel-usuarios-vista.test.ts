/**
 * Tests ESTRUCTURALES de `/panel/usuarios`. Fijan decisiones que un refactor podría deshacer sin que
 * nada más se queje:
 *
 *  1. UN SOLO BUSCADOR DE USUARIOS. La segunda búsqueda del panel (`buscarCuentasAdmin`) está
 *     eliminada y no puede volver a aparecer: era solo por prefijo y no quitaba la `@`, así que el
 *     back-office encontraba menos y peor que la app.
 *  2. La visibilidad de los controles sale de `controlesCuenta`, nunca de condiciones a ojo en el JSX.
 *  3. LA FRONTERA DE ROL: esta pantalla es del MODERADOR y NO toca el saldo. Ni ajuste de puntos ni
 *     historial del ledger; eso vive en `/panel/ranking`, que es ADMIN.
 *  4. PII: el email no se pinta en la lista. Solo existe como acción, y la acción es un POST.
 *  5. KEYSET: se pagina con `cursor`, jamás con un número de página ni un `offset`.
 *  6. No se inventan rutas ni se escribe en pantalla el vocabulario de la base de datos.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { seccionPorHref } from "../src/app/panel/secciones";

const RAIZ = process.cwd();
const DIR = join(RAIZ, "src", "app", "panel", "usuarios");
const leer = (...p: string[]) => readFileSync(join(...p), "utf8");
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGINA = soloCodigo(leer(DIR, "page.tsx"));
const FICHA = soloCodigo(leer(DIR, "ficha.tsx"));
const ACCIONES = soloCodigo(leer(DIR, "acciones-cuenta.tsx"));
const VER_EMAIL = soloCodigo(leer(DIR, "ver-email.tsx"));
const PANTALLA = PAGINA + FICHA + ACCIONES + VER_EMAIL;

/** Todos los .ts/.tsx de `src`, para las afirmaciones que valen sobre TODO el proyecto. */
function fuentes(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "generated") fuentes(p, salida);
    } else if (e.endsWith(".ts") || e.endsWith(".tsx")) salida.push(p);
  }
  return salida;
}
const SRC = fuentes(join(RAIZ, "src"));

describe("un solo buscador de usuarios", () => {
  it("`buscarCuentasAdmin` ya no existe en ninguna parte del código", () => {
    // Se mira TODO `src`, no solo la página: el fallo que se evita es que alguien la resucite en otro
    // sitio "porque el panel necesita ver a los suspendidos" — que es lo que hace el modo panel.
    const supervivientes = SRC.filter((p) => soloCodigo(leer(p)).includes("buscarCuentasAdmin"));
    expect(supervivientes).toEqual([]);
  });

  it("las dos búsquedas de usuarios salen del MISMO motor, con un parámetro de diferencia", () => {
    const buscar = soloCodigo(leer(RAIZ, "src", "server", "services", "buscar.ts"));
    // Una sola función construye el SQL...
    expect(buscar.match(/function filasDeUsuarios/g)).toHaveLength(1);
    // ...y las dos puertas la llaman en vez de tener la suya.
    expect(buscar.match(/filasDeUsuarios[<(]/g)?.length).toBeGreaterThanOrEqual(3);
    for (const entrada of [
      "export async function buscarUsuarios",
      "export async function buscarCuentas",
    ]) {
      expect(buscar, entrada).toContain(entrada);
    }
    // Y el término se normaliza en UN sitio, que es lo que arregla «@yuyu» en los dos a la vez.
    expect(buscar.match(/function normalizarTermino/g)).toHaveLength(1);
  });

  it("la página usa el listado del panel, no una consulta propia", () => {
    expect(PAGINA).toContain("listarCuentas");
    expect(PAGINA).toContain("fichaCuenta");
    // Nada de armar un `prisma.user.findMany` en la vista.
    expect(PAGINA).not.toContain("prisma.user");
  });
});

describe("/panel/usuarios", () => {
  it("es del MODERADOR: su guard sale de la sección, no de un rol escrito a mano", () => {
    expect(PAGINA).not.toContain("Placeholder");
    expect(PAGINA).toContain('requireSeccion("/panel/usuarios")');
    expect(PAGINA).not.toContain("requireRole");
    expect(seccionPorHref("/panel/usuarios")?.fase).toBeNull();
    expect(seccionPorHref("/panel/usuarios")?.rol).toBe("MODERATOR");
    // Y el rol de quien mira sale de la SESIÓN: es lo que hace correcta la pantalla para los dos roles.
    expect(FICHA + PAGINA).toMatch(/rolMira=\{(quienMira\.role|rolMira)\}/);
  });

  it("la visibilidad de los controles sale de `controlesCuenta`, no de ifs a mano", () => {
    expect(ACCIONES).toContain("controlesCuenta(");
    expect(ACCIONES).not.toMatch(/rol\w*\s*===\s*["'](ADMIN|MODERATOR)["']/);
    expect(PAGINA + FICHA).not.toMatch(/===\s*["'](ADMIN|MODERATOR)["']/);
  });

  it("no inventa rutas: las tres de gobierno y la del email", () => {
    const rutas = [...PANTALLA.matchAll(/\/api\/panel\/cuentas\/\$\{userId\}\/(\w+)/g)].map(
      (m) => m[1],
    );
    expect([...new Set(rutas)].sort()).toEqual(["email", "levantar", "rol", "suspender"]);
  });

  it("en pantalla no se escriben los códigos internos del rol ni del baneo", () => {
    expect(PANTALLA).not.toContain("bannedAt");
    expect(PANTALLA).not.toMatch(/>\s*(MODERATOR|ADMIN|USER)\s*</);
  });
});

describe("la frontera de rol: aquí no se toca el saldo", () => {
  it("la pantalla del moderador no enlaza ni importa el ajuste de puntos ni el ledger", () => {
    for (const prohibido of [
      "AjustarPuntos",
      "HistorialPuntos",
      "ajustarPuntos",
      "historialPuntos",
      "/api/panel/dareup",
    ]) {
      expect(PANTALLA, prohibido).not.toContain(prohibido);
    }
    // Lo que sí hace es enseñar la CIFRA, en solo lectura: eso ayuda a entender una cuenta.
    expect(FICHA).toContain("ficha.puntos");
  });

  it("el ajuste y el historial siguen viviendo en una sección de ADMIN", () => {
    expect(seccionPorHref("/panel/ranking")?.rol).toBe("ADMIN");
    const ranking = soloCodigo(leer(RAIZ, "src", "app", "panel", "ranking", "page.tsx"));
    expect(ranking).toContain("AjustarPuntos");
    expect(ranking).toContain("historialPuntos");
  });
});

describe("PII: el email no está en la lista", () => {
  it("la página no lee ni pinta ninguna dirección", () => {
    // El DTO del listado ni siquiera lo trae; esto fija que nadie lo añada "para ahorrar un clic".
    // SIN `\b` y SIN distinguir mayúsculas a propósito: la primera versión de esta comprobación no
    // veía un `MOSTRAR_EMAIL` —ni la mayúscula ni el guion bajo casaban—, y lo destapó romperla.
    expect(PAGINA).not.toMatch(/email/i);
    expect(FICHA).not.toMatch(/\.email\b/i);
  });

  it("el email se pide con un POST, que es lo que escribe el rastro", () => {
    expect(VER_EMAIL).toContain("postJsonCsrf");
    expect(VER_EMAIL).toContain("/email");
    // Un GET no valdría: no pasaría por `mutatingRoute` y cualquier página podría dispararlo.
    expect(VER_EMAIL).not.toMatch(/fetch\([^)]*\/email/);
  });

  it("el correo es del SUPERADMIN, no de la sección: la ruta exige ADMIN", () => {
    // Es la única acción de /panel/usuarios que no alcanza un moderador, y la asimetría es el
    // invariante: suspender sí es moderar, pedir el correo no. Alguien podría "cuadrarlo con la
    // sección" bajándolo a MODERATOR sin que nada más se quejara.
    const ruta = soloCodigo(
      leer(RAIZ, "src", "app", "api", "panel", "cuentas", "[id]", "email", "route.ts"),
    );
    expect(ruta).toContain('requireRole("ADMIN")');
    expect(ruta).not.toContain('requireRole("MODERATOR")');
    // Y la pantalla pregunta la MISMA regla en vez de decidir a ojo: nada de ofrecer un botón que la
    // API va a rechazar.
    expect(FICHA).toContain("puedeVerEmail(rolMira)");
    expect(FICHA).not.toMatch(/rolMira\s*===/);
  });

  it("no hay ninguna otra puerta al email: la única ruta que lo devuelve es la que anota", () => {
    const rutas = SRC.filter((p) => p.includes(join("app", "api")) && p.endsWith("route.ts"));
    const conEmailDeCuenta = rutas.filter((p) => leer(p).includes("emailDeCuenta"));
    expect(conEmailDeCuenta).toHaveLength(1);
    // Y el servicio escribe el rastro dentro de la misma transacción que la lectura.
    const servicio = leer(RAIZ, "src", "server", "services", "cuentas-panel.ts");
    const cuerpo = servicio.slice(servicio.indexOf("export async function emailDeCuenta"));
    expect(cuerpo).toContain("$transaction");
    expect(cuerpo).toContain('action: "EMAIL_VIEW"');
  });
});

describe("lo que el listado necesita de la base de datos", () => {
  const ESQUEMA = leer(RAIZ, "prisma", "schema.prisma");

  it("cada orden y el filtro de estado tienen su índice", () => {
    // Sin ellos, el listado del panel recorre la tabla `User` entera en CADA carga. Es el tipo de
    // decisión que se borra sin que nada se queje: todo sigue en verde, solo que más lento cada mes.
    for (const indice of [
      "@@index([createdAt, id])",
      "@@index([pointsBalance, id])",
      "@@index([victoriasTotales, id])",
      "@@index([bannedAt])",
    ]) {
      expect(ESQUEMA, indice).toContain(indice);
    }
  });

  it("la migración que añade el contador lo RELLENA con lo que ya había", () => {
    // Un caché que arranca a cero miente sobre todo el que ya había ganado un reto, y no se nota:
    // la columna existe, la consulta funciona y el número es plausible.
    const dir = join(RAIZ, "prisma", "migrations");
    const conLaColumna = readdirSync(dir)
      .filter((m) => statSync(join(dir, m)).isDirectory())
      .map((m) => join(dir, m, "migration.sql"))
      .filter((p) => readFileSync(p, "utf8").includes("ADD COLUMN `victoriasTotales`"));

    expect(conLaColumna).toHaveLength(1);
    // Fuera los comentarios ANTES de afirmar: un `-- UPDATE ...` dejaba pasar la comprobación con el
    // relleno desactivado. Lo destapó romperlo a propósito.
    const sql = readFileSync(conLaColumna[0]!, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/UPDATE\s+`User`/);
    expect(sql).toContain("ChallengeResult");
  });
});

describe("keyset, nunca OFFSET", () => {
  it("la paginación de la lista viaja por cursor", () => {
    expect(PAGINA).toContain("proximoCursor");
    // El PARÁMETRO se llama `cursor`, no solo la variable: comprobar que la palabra aparece en el
    // fichero no vale de nada —aparece diez veces— y dejaba pasar un `p.set("page", …)`.
    expect(PAGINA).toMatch(/p\.set\("cursor", /);
    for (const prohibido of [/\boffset\b/i, /\bskip:/, /p\.set\("page"/]) {
      expect(PAGINA, String(prohibido)).not.toMatch(prohibido);
    }
    const servicio = soloCodigo(leer(RAIZ, "src", "server", "services", "cuentas-panel.ts"));
    expect(servicio).not.toMatch(/\bskip\b/);
  });

  it("todo orden por una columna REPETIBLE lleva su desempate por `id`, y en la misma dirección", () => {
    // Esto NO se puede probar ejecutando: hoy el índice `(columna, id)` recorrido hacia atrás
    // devuelve el mismo orden aunque el `ORDER BY` no nombre el `id`, así que quitarlo no cambia
    // ningún resultado... hasta que el optimizador elija otro plan y la página siguiente repita
    // filas. Lo que se protege es la DECISIÓN, y por eso la comprobación es sobre el código.
    const servicio = soloCodigo(leer(RAIZ, "src", "server", "services", "cuentas-panel.ts"));
    const cuerpo = servicio.slice(
      servicio.indexOf("function ordenPrisma"),
      servicio.indexOf("function condicionKeyset"),
    );
    const ordenes = [...cuerpo.matchAll(/return \[(.+?)\];/g)].map((m) => m[1]!);
    expect(ordenes).toHaveLength(4);

    for (const o of ordenes) {
      // El alfabético es la ÚNICA excepción, y no por descuido: `username` es UNIQUE, o sea que ya
      // es un orden total por sí solo.
      if (o.includes("username")) continue;
      expect(o, o).toContain('{ id: "desc" }');
      // Las dos columnas en la MISMA dirección: con direcciones mezcladas InnoDB no puede recorrer
      // el índice de una pasada y ordena en memoria (la lección ya escrita en `RankingMensual`).
      expect(o, o).not.toContain('"asc"');
    }
  });
});
