/**
 * Medidas de color para los tests de la paleta. Dos números, cada uno con su trabajo:
 *
 *  - CONTRASTE WCAG: ¿se LEE? (texto sobre su fondo, relleno bajo su texto).
 *  - CIEDE2000 (ΔE): ¿se DISTINGUEN? Dos colores que significan cosas distintas —acción y dinero, oro
 *    del podio y dorado del dinero— tienen que separarse a ojo, y "a ojo" aquí es un número.
 *
 * Sin dependencias: son cuatro fórmulas y así no entra un paquete al bundle de tests.
 */

/** #rrggbb -> [r,g,b] en 0..1. */
function canales(hex: string): [number, number, number] {
  const s = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error(`color no válido: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const aLineal = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Luminancia relativa (WCAG 2.x). */
export function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map(aLineal) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores opacos: 1 (idénticos) .. 21 (negro sobre blanco). */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** sRGB -> CIELAB (D65). */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = canales(hex).map(aLineal) as [number, number, number];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Tono en grados (0..360) del color, para afirmar "esto sigue siendo verde". */
export function tono(hex: string): number {
  const [, a, b] = lab(hex);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return h >= 0 ? h : h + 360;
}

/**
 * CIEDE2000. Referencia práctica: ~1 es el límite de lo perceptible, >10 son colores claramente
 * distintos y >20 no los confunde nadie.
 */
export function deltaE(hex1: string, hex2: string): number {
  const [L1, a1, b1] = lab(hex1);
  const [L2, a2, b2] = lab(hex2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);
  const anguloDe = (b: number, a: number): number => {
    if (b === 0 && a === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h >= 0 ? h : h + 360;
  };
  const hp1 = anguloDe(b1, ap1);
  const hp2 = anguloDe(b2, ap2);
  const dL = L2 - L1;
  const dC = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * rad) / 2);
  const Lm = (L1 + L2) / 2;
  const Cpm = (Cp1 + Cp2) / 2;
  let hpm = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hpm += hpm < 360 ? 360 : -360;
    hpm /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hpm - 30) * rad) +
    0.24 * Math.cos(2 * hpm * rad) +
    0.32 * Math.cos((3 * hpm + 6) * rad) -
    0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
