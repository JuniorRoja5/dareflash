/**
 * LOS MENSAJES DE LA API, LEÍDOS DEL CÓDIGO (Fase 11 · P5b3) — por AST, sin ejecutar nada.
 *
 * Dos cosas por fichero:
 *  - `pares`: cada `apiError(código, mensaje, …)` con su mensaje RESUELTO cuando se puede (una cadena,
 *    una constante `MSG_*` de `config/constants`, una constante local, un `t("clave")` del espacio
 *    `api`, o las dos ramas de un `?:`). Lo que no se puede resolver queda como `‹expresión›`.
 *  - `frases`: toda cadena con forma de frase del fichero (fuera de los `console.*`), con los huecos de
 *    una plantilla escritos `{…}`.
 *
 * Con eso se fija el ANTES (`tests/fixtures/mensajes-api-antes.json`) y se compara el DESPUÉS: cada par
 * tiene que decir exactamente lo mismo, y cada frase tiene que seguir existiendo letra a letra (en el
 * diccionario o en su sitio). Ver `tests/mensajes-api-congelados`.
 */
import ts from "typescript";

/** Los huecos, del lado que sea (`${x}` de una plantilla, `{x}` de una clave), se comparan igual. */
export const normalizarHuecos = (s: string): string =>
  s.replace(/\$\{[^}]*\}/g, "{…}").replace(/\{[A-Za-z_][\w:]*\}/g, "{…}");

/** ¿Tiene forma de frase? Dos palabras y una letra al menos; no una clase, una ruta ni un código. */
export function esFrase(s: string): boolean {
  if (s.length < 6) return false;
  if (!/[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}/.test(s)) return false;
  if (!/\s/.test(s.trim())) return false;
  // Clases de Tailwind, SQL, rutas y cabeceras no son frases.
  if (/^(SELECT|UPDATE|INSERT|DELETE)\b/.test(s)) return false;
  if (/^[a-z0-9:[\]/.%_-]+( [a-z0-9:[\]/.%_-]+)+$/.test(s)) return false;
  return true;
}

function textoDe(n: ts.Node, sf: ts.SourceFile): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) {
    let s = n.head.text;
    for (const sp of n.templateSpans) s += `\${${sp.expression.getText(sf)}}` + sp.literal.text;
    return s;
  }
  return null;
}

export interface Lectura {
  pares: string[];
  frases: string[];
}

export interface Resolutores {
  /** El valor de una constante exportada de `config/constants` (`MSG_…`), si es una cadena. */
  constante: (nombre: string) => string | undefined;
  /** El texto de una clave del espacio `api` del diccionario (`t("clave")`). */
  clave: (clave: string) => string | undefined;
}

export function leerMensajesApi(nombre: string, fuente: string, r: Resolutores): Lectura {
  const sf = ts.createSourceFile(nombre, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const locales = new Map<string, ts.Expression>();
  const pares: string[] = [];
  const frases: string[] = [];

  // Constantes locales (`const MENSAJE = {…}` o `const X = "…"`), para resolver lo que se nombra.
  const recoger = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      locales.set(n.name.text, n.initializer);
    }
    ts.forEachChild(n, recoger);
  };
  recoger(sf);

  const resolver = (e: ts.Expression, prof = 0): string[] => {
    if (prof > 4) return [`‹${e.getText(sf)}›`];
    const literal = textoDe(e, sf);
    if (literal !== null) return [literal];
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) {
      return resolver(e.expression, prof + 1);
    }
    if (ts.isConditionalExpression(e)) {
      return [...resolver(e.whenTrue, prof + 1), ...resolver(e.whenFalse, prof + 1)];
    }
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      return [...resolver(e.left, prof + 1), ...resolver(e.right, prof + 1)];
    }
    if (ts.isIdentifier(e)) {
      const local = locales.get(e.text);
      if (local && !ts.isObjectLiteralExpression(local)) return resolver(local, prof + 1);
      const c = r.constante(e.text);
      if (c !== undefined) return [c];
    }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "t") {
      const a = e.arguments[0];
      if (a && ts.isStringLiteral(a)) {
        const v = r.clave(a.text);
        return [v ?? `‹clave api.${a.text} inexistente›`];
      }
      // `t(MAPA[motivo] ?? "clave")`: cada entrada del mapa local (claves) y la de por defecto.
      if (
        a &&
        ts.isBinaryExpression(a) &&
        a.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        const izq = a.left;
        const entradas =
          ts.isElementAccessExpression(izq) && ts.isIdentifier(izq.expression)
            ? locales.get(izq.expression.text)
            : undefined;
        const porDefecto = ts.isStringLiteral(a.right) ? r.clave(a.right.text) : undefined;
        if (entradas && ts.isObjectLiteralExpression(entradas) && porDefecto !== undefined) {
          return [
            porDefecto,
            ...entradas.properties.flatMap((p) =>
              ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)
                ? [
                    `[${p.name.getText(sf)}] ${r.clave(p.initializer.text) ?? "‹clave inexistente›"}`,
                  ]
                : [],
            ),
          ];
        }
        if (porDefecto !== undefined) return [`‹${izq.getText(sf)}›`, porDefecto];
      }
    }
    // P5b3: `frase(t, dato)` dice lo que antes decía el error o el veredicto del que sale el dato
    // (que llevaba la frase en `.message` / `.mensaje`; ahora lleva la clave en `.mensaje`).
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "frase") {
      const dato = e.arguments[1]?.getText(sf) ?? "";
      return [`‹${dato.replace(/^e\.mensaje$/, "e.message")}›`];
    }
    // `mensajeDeValidacion(t, issue, t("clave"))`: el mensaje del esquema, o la frase por defecto.
    if (
      ts.isCallExpression(e) &&
      ts.isIdentifier(e.expression) &&
      e.expression.text === "mensajeDeValidacion"
    ) {
      const [, issue, porDefecto] = e.arguments;
      return [
        `‹${issue?.getText(sf)}?.message›`,
        ...(porDefecto ? resolver(porDefecto, prof + 1) : []),
      ];
    }
    // `MENSAJE[motivo]` con `MENSAJE` un objeto local: todas sus entradas, con su clave.
    if (ts.isElementAccessExpression(e) && ts.isIdentifier(e.expression)) {
      const obj = locales.get(e.expression.text);
      if (obj && ts.isObjectLiteralExpression(obj)) {
        return obj.properties.flatMap((p) =>
          ts.isPropertyAssignment(p)
            ? resolver(p.initializer, prof + 1).map((v) => `[${p.name.getText(sf)}] ${v}`)
            : [],
        );
      }
    }
    return [`‹${e.getText(sf).replace(/\s+/g, " ")}›`];
  };

  const visitar = (n: ts.Node): void => {
    // Los logs no los ve nadie: siguen en castellano y no entran.
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === "console"
    ) {
      return;
    }
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "apiError"
    ) {
      const [codigo, mensaje] = n.arguments;
      if (codigo && mensaje) {
        const cod = textoDe(codigo, sf) ?? `‹${codigo.getText(sf)}›`;
        for (const m of resolver(mensaje)) pares.push(normalizarHuecos(`${cod} → ${m}`));
      }
    }
    const t = textoDe(n, sf);
    if (t !== null && esFrase(t) && !ts.isImportDeclaration(n.parent)) {
      frases.push(normalizarHuecos(t));
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return { pares: pares.sort(), frases: [...new Set(frases)].sort() };
}
