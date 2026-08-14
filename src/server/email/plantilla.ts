/**
 * PLANTILLA de marca para correos transaccionales — SOLO presentacion (genera el `html` de un
 * `EmailMessage`; el `text` de cada correo se sigue escribiendo a mano en su builder, sin tocar).
 * Compartida por verificacion y desbloqueo para que los dos correos usen el MISMO lenguaje visual
 * (brief v2: fondo void, una accion magenta, tipografia display) sin duplicar el maquetado.
 *
 * Reglas de un email que sobrevive a un cliente de correo real:
 *  - Tablas + estilos INLINE (nada de <style> de bloque: Gmail/Outlook los recortan o ignoran).
 *  - Sin webfonts externas: pila de sistema (Arial/Helvetica). El peso 800 + mayusculas imita el
 *    caracter de Archivo Expanded sin depender de que la fuente cargue.
 *  - `bgcolor` ademas de `background-color` (Outlook de escritorio ignora el CSS del atributo).
 *  - `color-scheme`/`supported-color-schemes` fijan el tema: el fondo YA es oscuro a proposito
 *    (brief: "el producto es oscuro siempre"), asi que no debe invertirse en Gmail/Apple Mail dark.
 *  - El enlace va SIEMPRE visible como texto plano bajo el boton: si el cliente bloquea el boton
 *    (o los estilos), el usuario puede copiarlo igualmente.
 */
import "server-only";

// Mismos valores que --df-* en globals.css, en HEX literal (los emails no leen custom properties).
const COLOR = {
  void: "#07090d",
  surface: "#10141c",
  line: "#232a35", // aproximacion solida de --color-line (rgb 255 255 255 / 0.1) sobre --color-surface
  text: "#f2f4f7",
  textDim: "#8d95a3",
  textFaint: "#5b6270",
  action: "#ff2e88",
} as const;

const FUENTE = "Arial, Helvetica, sans-serif";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PlantillaCorreoInput {
  /** Texto de previsualizacion (inbox preview); oculto en el cuerpo. */
  preheader: string;
  /** Titular (h1) de la tarjeta. */
  titulo: string;
  /** Parrafo de introduccion, antes del boton. */
  intro: string;
  /** UNICA accion del correo: boton magenta solido (mismo lenguaje que el CTA principal de /entrar). */
  cta: { texto: string; href: string };
  /** Parrafos adicionales tras el boton (caducidad, avisos de seguridad), en orden. */
  notas: string[];
}

/** Compone el HTML de marca de un correo transaccional a partir de su contenido. */
export function renderCorreoHtml(input: PlantillaCorreoInput): string {
  const href = escapeHtml(input.cta.href);
  const notas = input.notas
    .map(
      (nota) =>
        `<p style="margin:0 0 10px;font-family:${FUENTE};font-size:13px;line-height:1.6;color:${COLOR.textDim};">${escapeHtml(nota)}</p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(input.titulo)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.void};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.void}" style="background-color:${COLOR.void};">
<tr>
<td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.surface}" style="max-width:600px;background-color:${COLOR.surface};border:1px solid ${COLOR.line};border-radius:8px;">
<tr>
<td style="padding:32px 32px 4px;">
<p style="margin:0;font-family:${FUENTE};font-size:20px;font-weight:800;letter-spacing:0.06em;color:${COLOR.text};text-transform:uppercase;">DARE<span style="color:${COLOR.action};">FLASH</span></p>
</td>
</tr>
<tr>
<td style="padding:24px 32px 0;">
<h1 style="margin:0 0 12px;font-family:${FUENTE};font-size:24px;line-height:1.3;font-weight:800;color:${COLOR.text};">${escapeHtml(input.titulo)}</h1>
<p style="margin:0 0 28px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${COLOR.textDim};">${escapeHtml(input.intro)}</p>
</td>
</tr>
<tr>
<td align="left" style="padding:0 32px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="center" bgcolor="${COLOR.action}" style="background-color:${COLOR.action};border-radius:4px;">
<a href="${href}" style="display:inline-block;padding:14px 30px;font-family:${FUENTE};font-size:15px;font-weight:700;color:${COLOR.void};text-decoration:none;border-radius:4px;">${escapeHtml(input.cta.texto)}</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:0 32px 24px;">
<p style="margin:0 0 4px;font-family:${FUENTE};font-size:13px;line-height:1.6;color:${COLOR.textDim};">Si el boton no funciona, copia y pega este enlace en tu navegador:</p>
<p style="margin:0;font-family:${FUENTE};font-size:13px;line-height:1.6;word-break:break-all;"><a href="${href}" style="color:${COLOR.action};text-decoration:underline;">${href}</a></p>
</td>
</tr>
<tr>
<td style="padding:20px 32px 0;border-top:1px solid ${COLOR.line};">
<div style="padding-top:20px;">
${notas}
</div>
</td>
</tr>
<tr>
<td style="padding:8px 32px 32px;">
<p style="margin:0;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${COLOR.textFaint};">DareFlash &middot; Retos en video corto con premios reales.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
