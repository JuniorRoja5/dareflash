/**
 * EL DETECTOR DE TEXTO ESCRITO A MANO EN UN COMPONENTE (Fase 11 · P5b1). Lo usa `textos-a-mano`.
 *
 * Cuenta como texto a mano —algo que debería salir de `t()`— lo que un usuario LEE u OYE:
 *  - el texto de JSX con alguna letra (`<p>Hola</p>`);
 *  - un atributo que se lee u oye (`aria-label`, `alt`, `title`, `placeholder`, `label`) con una cadena
 *    literal con letras, o con una cadena en una de sus ramas (`aria-label={x ? "a" : "b"}`);
 *  - una cadena con letras que se PINTA desde una expresión de JSX: `{"Hola"}`, `{x ? "a" : "b"}`,
 *    `{x || "otro"}`, `{x && "algo"}`, o una plantilla con letras (`{`${n} votos`}`).
 * NO cuenta: comparaciones (`estado === "votado"`), clases, rutas ni nada que no se pinta.
 */
import ts from "typescript";

const ATRIBUTOS = new Set([
  "aria-label",
  "placeholder",
  "title",
  "alt",
  "aria-description",
  "label",
]);
const LETRA = /\p{L}/u;

/** ¿El nodo es lo que se PINTA de una expresión? Sube por ramas de condicional y `||`/`??`/`&&`. */
function sePinta(n: ts.Node): boolean {
  let hijo: ts.Node = n;
  let p = n.parent;
  while (p) {
    if (ts.isParenthesizedExpression(p)) {
      hijo = p;
      p = p.parent;
      continue;
    }
    if (ts.isConditionalExpression(p)) {
      if (p.condition === hijo) return false;
      hijo = p;
      p = p.parent;
      continue;
    }
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      const pinta =
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken ||
        (op === ts.SyntaxKind.AmpersandAmpersandToken && p.right === hijo);
      if (!pinta) return false;
      hijo = p;
      p = p.parent;
      continue;
    }
    if (ts.isJsxExpression(p)) {
      const dueno = p.parent;
      if (ts.isJsxElement(dueno) || ts.isJsxFragment(dueno)) return true;
      if (ts.isJsxAttribute(dueno)) return ATRIBUTOS.has(dueno.name.getText());
      return false;
    }
    return false;
  }
  return false;
}

/** Los textos a mano de un fichero `.tsx`, como «línea: texto». */
export function textosAMano(fichero: string, codigo: string): string[] {
  const src = ts.createSourceFile(fichero, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const salida: string[] = [];
  const apunta = (n: ts.Node, t: string) =>
    salida.push(
      `${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${t.trim().replace(/\s+/g, " ")}`,
    );
  const visita = (n: ts.Node) => {
    if (ts.isJsxText(n) && LETRA.test(n.text)) apunta(n, n.text);
    else if (
      ts.isJsxAttribute(n) &&
      ATRIBUTOS.has(n.name.getText()) &&
      n.initializer &&
      ts.isStringLiteral(n.initializer) &&
      LETRA.test(n.initializer.text)
    )
      apunta(n, n.getText());
    else if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      LETRA.test(n.text) &&
      sePinta(n)
    )
      apunta(n, JSON.stringify(n.text));
    else if (
      ts.isTemplateExpression(n) &&
      LETRA.test(n.head.text + n.templateSpans.map((s) => s.literal.text).join("")) &&
      sePinta(n)
    )
      apunta(n, n.getText());
    ts.forEachChild(n, visita);
  };
  visita(src);
  return salida;
}
