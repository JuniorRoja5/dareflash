/**
 * Logica PURA de las primitivas de DareFlash: umbrales y eleccion de token de color. Se extrae
 * aparte —sin React, sin DOM— para poder ATARLA con tests. Dos invariantes de producto que no
 * pueden depender de que alguien se acuerde:
 *   - la cuenta atras pasa de --df-time a --df-alarm por debajo de 24 h;
 *   - el oro (--df-rank) solo sale en el podio (1/2/3).
 */

/** Por debajo de esto la cuenta atras es CRITICA (--df-time -> --df-alarm). Evento de producto. */
export const UMBRAL_ALARMA_MS = 24 * 60 * 60 * 1000; // 24 h

/** ¿La cuenta atras esta en zona CRITICA? (< 24 h restantes, agotado incluido). */
export function esCuentaAtrasCritica(msRestantes: number): boolean {
  return msRestantes < UMBRAL_ALARMA_MS;
}

/**
 * Token de color de la cuenta atras. SOLO "time" o "alarm": el tiempo NUNCA es money/rank/action/ok.
 * "alarm" en zona critica (<24 h), "time" en el resto. En el limite EXACTO de 24 h todavia es time.
 */
export function tokenCuentaAtras(msRestantes: number): "time" | "alarm" {
  return esCuentaAtrasCritica(msRestantes) ? "alarm" : "time";
}

/** Tiempo restante formateado: >=24 h -> "6 d 04 h"; <24 h -> "HH:MM:SS"; agotado -> "00:00:00". */
export function formatearCuentaAtras(msRestantes: number): string {
  if (msRestantes <= 0) return "00:00:00";
  const totalSeg = Math.floor(msRestantes / 1000);
  if (msRestantes >= UMBRAL_ALARMA_MS) {
    const dias = Math.floor(totalSeg / 86_400);
    const horas = Math.floor((totalSeg % 86_400) / 3_600);
    return `${dias} d ${String(horas).padStart(2, "0")} h`;
  }
  const hh = String(Math.floor(totalSeg / 3_600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeg % 3_600) / 60)).padStart(2, "0");
  const ss = String(totalSeg % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Token de color de un puesto de ranking: "rank" (oro) SOLO en 1, 2 y 3; el resto "neutral". El oro
 * NUNCA es decorativo. Un puesto no entero o fuera de rango no es podio.
 */
export function tokenPuesto(puesto: number): "rank" | "neutral" {
  return Number.isInteger(puesto) && puesto >= 1 && puesto <= 3 ? "rank" : "neutral";
}

/** Importe en centimos -> texto de moneda (USD por defecto), formato en-US: 125000 -> "$1,250.00". */
export function formatearImporte(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// BOTON — mapa variante -> tokens de color. Fuente de verdad, extraida para atarla: un boton con
// RELLENO semantico lleva SIEMPRE texto negro (--df-void), nunca blanco. Romper el mapa (p. ej.
// principal -> money, o texto de un relleno a "text") cae en rojo.
// ---------------------------------------------------------------------------

export type BotonVariante = "principal" | "secundario" | "fantasma" | "peligro";

export type BotonTokens = {
  /** Token de relleno, o null si el boton no lleva relleno (secundario/fantasma). */
  fondo: "action" | "alarm" | null;
  /** Token del texto. Sobre relleno semantico, SIEMPRE "void" (negro). */
  texto: "void" | "text";
  /** Filete de 1 px (solo el secundario). */
  filete: boolean;
};

export function botonTokens(variante: BotonVariante): BotonTokens {
  switch (variante) {
    case "principal":
      return { fondo: "action", texto: "void", filete: false };
    case "peligro":
      return { fondo: "alarm", texto: "void", filete: false };
    case "secundario":
      return { fondo: null, texto: "text", filete: true };
    case "fantasma":
      return { fondo: null, texto: "text", filete: false };
  }
}

// ---------------------------------------------------------------------------
// NAVEGACION — catalogo canonico de destinos (nombres, rutas, clave). Fuente de verdad unica,
// extraida para atarla: reordenar o perder uno cae en rojo. `central` marca el [+] (Crear en movil).
//
// La nav DIVERGE entre movil y escritorio (el brief: "no son la misma pantalla a distinto ancho"):
//   - Escritorio (barra lateral): Inicio, Feed, Retos, Ranking, Perfil. Crear NO va aqui: es el
//     boton magenta de la barra superior (el UNICO magenta de la pantalla).
//   - Movil (barra inferior): Feed (home del movil), Retos, [+] Crear, Ranking, Perfil. Inicio
//     (portada) es concepto de escritorio, no va en la barra inferior.
// ---------------------------------------------------------------------------

export const NAV_DESTINOS = [
  { clave: "inicio", nombre: "Inicio", href: "/inicio" },
  { clave: "feed", nombre: "Feed", href: "/feed" },
  { clave: "retos", nombre: "Retos", href: "/retos" },
  { clave: "crear", nombre: "Crear", href: "/crear", central: true },
  { clave: "ranking", nombre: "Ranking", href: "/ranking" },
  { clave: "perfil", nombre: "Perfil", href: "/perfil" },
] as const;

export type NavDestino = (typeof NAV_DESTINOS)[number];
export type DestinoClave = NavDestino["clave"];

/** Subconjuntos ORDENADOS por contexto (claves de NAV_DESTINOS). */
export const NAV_ESCRITORIO = ["inicio", "feed", "retos", "ranking", "perfil"] as const;
export const NAV_MOVIL = ["feed", "retos", "crear", "ranking", "perfil"] as const;

/** Resuelve una lista de claves a sus destinos, preservando el orden. */
export function destinosDe(claves: readonly DestinoClave[]): NavDestino[] {
  return claves.map((c) => NAV_DESTINOS.find((d) => d.clave === c)!);
}

/**
 * Ruta actual -> clave del destino activo, o null si ninguna. PURA (sin router). Una SUBRUTA como
 * "/retos/123" sigue siendo Retos; "/retosxyz" NO es subruta de /retos; una ruta desconocida (y "/",
 * que redirige por dispositivo) es null. El armazon la llama desde una isla cliente y pasa `activo`
 * a la nav, que sigue presentacional y pura.
 */
export function destinoActivo(pathname: string): DestinoClave | null {
  for (const d of NAV_DESTINOS) {
    if (pathname === d.href || pathname.startsWith(`${d.href}/`)) return d.clave;
  }
  return null;
}
