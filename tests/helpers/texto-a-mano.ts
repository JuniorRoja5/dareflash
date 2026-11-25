/**
 * EL DETECTOR DE TEXTO ESCRITO A MANO EN UN COMPONENTE (Fase 11 · P5b1). Lo usa `textos-a-mano`.
 *
 * Cuenta como texto a mano —algo que debería salir de `t()`— lo que un usuario LEE u OYE:
 *  - el texto de JSX con alguna letra (`<p>Hola</p>`);
 *  - un atributo que se lee u oye (`aria-label`, `alt`, `title`, `placeholder`, `label`) con una cadena
 *    literal con letras, o con una cadena en una de sus ramas (`aria-label={x ? "a" : "b"}`);
 *  - una cadena con letras que se PINTA desde una expresión de JSX: `{"Hola"}`, `{x ? "a" : "b"}`,
 *    `{x || "otro"}`, `{x && "algo"}`, o una plantilla con letras (`{`${n} votos`}`);
 *  - (P5b2a) una cadena que LLEGA a la pantalla por otro camino: el valor de una propiedad con nombre de
 *    texto (`{ titulo: "…" }`, `{ etiqueta: "…" }`, el `title` de un `metadata`) o lo que se le pasa a
 *    un `set…` de React (`setError("…")`, `setError(msg || "…")`). Así se escaparon a la P5b1 el estado
 *    de cada vídeo del perfil y los títulos de pestaña: no estaban en el JSX, llegaban a él.
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

/** Propiedades cuyo valor es, por su nombre, un texto que se enseña. */
const PROPIEDADES_DE_TEXTO = new Set([
  "title",
  "titulo",
  "texto",
  "etiqueta",
  "label",
  "mensaje",
  "descripcion",
  "description",
  "detalle",
  "pie",
  "nota",
  "placeholder",
]);
/** Un `set…` de React: lo que recibe acaba pintado. */
const SETTER = /^set[A-Z]/;
/**
 * Por esos dos caminos también viajan CÓDIGOS (`setEstado("enviando")`, `{ tono: "ok" }`): ahí solo
 * cuenta lo que tiene forma de frase —un espacio, o empieza por mayúscula, `¿` o `¡`—. Un código no la
 * tiene; una frase o una etiqueta, siempre.
 */
const PROSA = /\s|^[\p{Lu}¿¡]/u;

/**
 * ¿El nodo es lo que se PINTA? Sube por ramas de condicional y `||`/`??`/`&&`. `"si-es-prosa"`: llega a
 * la pantalla por una propiedad de texto o un `set…`, y cuenta solo si tiene forma de frase (`PROSA`).
 */
function sePinta(n: ts.Node): boolean | "si-es-prosa" {
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
    if (ts.isPropertyAssignment(p) && p.initializer === hijo) {
      return PROPIEDADES_DE_TEXTO.has(p.name.getText().replace(/^["']|["']$/g, ""))
        ? "si-es-prosa"
        : false;
    }
    if (ts.isCallExpression(p) && p.arguments.includes(hijo as ts.Expression)) {
      return SETTER.test(p.expression.getText()) ? "si-es-prosa" : false;
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
  /** ¿Cuenta este literal? Por el JSX, siempre; por los caminos nuevos, si tiene forma de frase. */
  const cuenta = (n: ts.Node, texto: string) => {
    const via = sePinta(n);
    return via === true || (via === "si-es-prosa" && PROSA.test(texto));
  };
  const visita = (n: ts.Node) => {
    // Una entidad HTML (`&nbsp;`) no es texto que se lea: se quita antes de buscar letras.
    if (ts.isJsxText(n) && LETRA.test(n.text.replace(/&[a-z]+;|&#\d+;/gi, ""))) apunta(n, n.text);
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
      cuenta(n, n.text)
    )
      apunta(n, JSON.stringify(n.text));
    else if (
      ts.isTemplateExpression(n) &&
      LETRA.test(n.head.text + n.templateSpans.map((s) => s.literal.text).join("")) &&
      cuenta(n, n.getText().slice(1, -1))
    )
      apunta(n, n.getText());
    ts.forEachChild(n, visita);
  };
  visita(src);
  return salida;
}
