/**
 * UN ENLACE INTERNO NO PIERDE EL IDIOMA (Fase 11 · P5a) — censo estructural, por AST (un comentario no
 * cuenta y el fallo da fichero y línea).
 *
 * Todo lo que lleva a otra página de la app de usuario pasa por los envoltorios que ponen el prefijo del
 * idioma: `Enlace` y `useNavegar` (`src/components/enlace.tsx`) en el cliente, `redirigir` /
 * `redirigirPermanente` (`src/server/redirigir.ts`) en el servidor. Fuera de ellos —y fuera del panel y
 * de la API, que no llevan idioma— nadie:
 *  1. importa `next/link`;
 *  2. importa `redirect` / `permanentRedirect` de `next/navigation`;
 *  3. llama a `router.push` / `router.replace` (el `router.refresh()` sí: no cambia de ruta);
 *  4. llama a `navegarDuro` de `lib` (la recarga del login y el logout; va por `useNavegarDuro()`);
 *  5. escribe un `href` interno literal (`"/…"` o `` `/…` ``) en un `<a>` en bruto, ni en un componente
 *     que no pase por `Enlace` (hoy, solo `Enlace` y `Boton`, y `Boton` se comprueba);
 *  6. compara con `usePathname()` a secas: da la ruta CON prefijo; para comparar, `useRutaSinIdioma()`.
 *     Solo la usan, a propósito, los que necesitan la ruta completa del navegador (volver a la misma
 *     página con `siguiente=` o limpiar la query).
 *
 * Para romperlo: un `<a href="/retos">` en un componente (rojo 5 con el fichero), un `import Link from
 * "next/link"` (rojo 1), un `redirect("/entrar")` (rojo 2), un `router.push("/x")` (rojo 3).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const SRC = path.join(RAIZ, "src");
const rel = (f: string) => path.relative(RAIZ, f).replaceAll("\\", "/");

/** Lo que no lleva idioma o ES el envoltorio. */
const FUERA = ["src/generated/", "src/app/panel/", "src/app/api/"];
const ENVOLTORIOS = new Set([
  "src/components/enlace.tsx",
  "src/server/redirigir.ts",
  "src/lib/navegacion-dura.ts",
]);
/** Componentes que reciben un `href` interno y lo pasan por `Enlace` (se comprueba abajo). */
const PASAN_POR_ENLACE: Record<string, string> = {
  Enlace: "src/components/enlace.tsx",
  Boton: "src/components/ui/boton.tsx",
};
/** Los que usan `usePathname()` A PROPÓSITO: necesitan la ruta del navegador, con su prefijo. */
const RUTA_COMPLETA = new Set([
  "src/components/enlace.tsx",
  "src/app/(app)/(shell)/boosts/aviso-compra.tsx",
  "src/app/(app)/(shell)/vip/aviso-suscripcion.tsx",
  "src/components/feed/comentarios-video.tsx",
  "src/components/ui/denunciar.tsx",
]);

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? ficheros(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

const fuentes = ficheros(SRC)
  .map((f) => ({ f: rel(f), abs: f }))
  .filter(({ f }) => !FUERA.some((x) => f.startsWith(x)));

type Hallazgo = string;
function analizar(f: string, abs: string, texto = readFileSync(abs, "utf8")) {
  const src = ts.createSourceFile(
    abs,
    texto,
    ts.ScriptTarget.Latest,
    true,
    abs.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const h = {
    link: [] as Hallazgo[],
    redirect: [] as Hallazgo[],
    router: [] as Hallazgo[],
    duro: [] as Hallazgo[],
    href: [] as Hallazgo[],
    pathname: [] as Hallazgo[],
  };
  const donde = (n: ts.Node) => `${f}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const routers = new Set<string>();
  const visita = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const m = n.moduleSpecifier.text;
      if (m === "next/link") h.link.push(donde(n));
      if (
        m === "next/navigation" &&
        n.importClause?.namedBindings &&
        ts.isNamedImports(n.importClause.namedBindings)
      ) {
        for (const e of n.importClause.namedBindings.elements) {
          if (["redirect", "permanentRedirect"].includes((e.propertyName ?? e.name).text))
            h.redirect.push(donde(e));
        }
      }
      // El de `lib` se mira por su IMPORT, no por el nombre de la llamada: quien usa
      // `useNavegarDuro()` puede llamar a su función como quiera, también `navegarDuro`.
      if (
        /(^|\/)navegacion-dura$/.test(m) &&
        n.importClause?.namedBindings &&
        ts.isNamedImports(n.importClause.namedBindings) &&
        n.importClause.namedBindings.elements.some(
          (e) => (e.propertyName ?? e.name).text === "navegarDuro",
        )
      )
        h.duro.push(donde(n));
    }
    if (
      ts.isVariableDeclaration(n) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText() === "useRouter" &&
      ts.isIdentifier(n.name)
    ) {
      routers.add(n.name.text);
    }
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      if (ts.isPropertyAccessExpression(c) && ["push", "replace"].includes(c.name.text)) {
        const obj = c.expression.getText();
        if (routers.has(obj) || obj === "useRouter()") h.router.push(donde(n));
      }
      if (ts.isIdentifier(c) && c.text === "usePathname") h.pathname.push(donde(n));
    }
    if (ts.isJsxAttribute(n) && n.name.getText() === "href" && n.initializer) {
      const ini = n.initializer;
      let texto: string | null = null;
      if (ts.isStringLiteral(ini)) texto = ini.text;
      else if (ts.isJsxExpression(ini) && ini.expression) {
        const e = ini.expression;
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) texto = e.text;
        else if (ts.isTemplateExpression(e)) texto = e.head.text;
      }
      if (texto !== null && texto.startsWith("/") && !texto.startsWith("//")) {
        const tag = (n.parent.parent as ts.JsxOpeningLikeElement).tagName.getText();
        if (!(tag in PASAN_POR_ENLACE)) h.href.push(`${donde(n)} <${tag} href="${texto}">`);
      }
    }
    ts.forEachChild(n, visita);
  };
  visita(src);
  return h;
}

const todos = fuentes.map(({ f, abs }) => ({ f, h: analizar(f, abs) }));
const de = (k: keyof ReturnType<typeof analizar>, excepto: (f: string) => boolean = () => false) =>
  todos.filter(({ f }) => !ENVOLTORIOS.has(f) && !excepto(f)).flatMap(({ h }) => h[k]);

describe("los enlaces internos pasan por los envoltorios del idioma", () => {
  it("el censo recorre la app (si no, no probaría nada)", () => {
    expect(fuentes.length).toBeGreaterThan(200);
    expect(todos.some(({ h }) => h.href.length === 0)).toBe(true);
  });

  it("1 · nadie importa next/link (salvo el panel y `Enlace`)", () => {
    const x = de("link");
    expect(x, `importan next/link: ${x.join(", ")}`).toEqual([]);
  });

  it("2 · nadie importa redirect/permanentRedirect (van por `redirigir`)", () => {
    const x = de("redirect");
    expect(x, `redirigen sin idioma: ${x.join(", ")}`).toEqual([]);
  });

  it("3 · nadie llama a router.push/replace (van por `useNavegar`)", () => {
    const x = de("router");
    expect(x, `navegan sin idioma: ${x.join(", ")}`).toEqual([]);
  });

  it("4 · nadie llama al navegarDuro de lib (va por `useNavegarDuro()`)", () => {
    const x = de("duro");
    expect(x, `recargan sin idioma: ${x.join(", ")}`).toEqual([]);
  });

  it("5 · ningún href interno literal fuera de `Enlace`/`Boton`", () => {
    const x = de("href");
    expect(x, `enlazan sin idioma: ${x.join(", ")}`).toEqual([]);
  });

  it("5b · y `Boton` de verdad pasa por `Enlace`", () => {
    const boton = readFileSync(path.join(RAIZ, PASAN_POR_ENLACE.Boton!), "utf8");
    expect(boton).toMatch(/import \{ Enlace \} from "@\/components\/enlace";/);
    expect(boton).toMatch(/<Enlace\b/);
    expect(boton).not.toMatch(/from "next\/link"/);
  });

  it("6 · usePathname a secas, solo quien necesita la ruta completa (el resto, useRutaSinIdioma)", () => {
    const x = de("pathname", (f) => RUTA_COMPLETA.has(f));
    expect(x, `comparan con la ruta CON prefijo: ${x.join(", ")}`).toEqual([]);
  });

  it("el censo SÍ ve un <a href> interno (control: si no lo viera, el 5 sería un verde vacío)", () => {
    const h = analizar(
      "control.tsx",
      "control.tsx",
      'export const X = () => <a href="/retos">r</a>;',
    );
    expect(h.href).toEqual(['control.tsx:1 <a href="/retos">']);
    const r = analizar(
      "c.tsx",
      "c.tsx",
      'import { redirect } from "next/navigation"; const router = useRouter(); router.push("/x");',
    );
    expect(r.redirect.length).toBe(1);
    expect(r.router.length).toBe(1);
  });
});
