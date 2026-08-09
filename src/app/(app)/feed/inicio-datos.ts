/**
 * INICIO · datos de VISTA y formato (Paso C · feed inmersivo). Maqueta: NO es el modelo de datos.
 * `PostVista` es forma de presentacion (tipada para que la fuente real entre luego). `_inicio` es
 * carpeta PRIVADA (prefijo `_`): no crea ruta; el feed vive en la ruta "/" del grupo (app).
 */

export type PostVista = {
  id: string;
  username: string;
  retoTitulo: string;
  categoria: string;
  meGusta: number;
  comentarios: number;
  votos: number;
  compartidos: number;
};

export const POSTS_INICIO: readonly PostVista[] = [
  {
    id: "salto-en-caja",
    username: "carlos_fit",
    retoTitulo: "Tu mejor salto en caja (box jump)",
    categoria: "Fitness",
    meGusta: 12400,
    comentarios: 342,
    votos: 1240,
    compartidos: 210,
  },
  {
    id: "receta-60s",
    username: "cocina_express_maria",
    retoTitulo: "Receta viral en 60 segundos",
    categoria: "Cocina",
    meGusta: 45200,
    comentarios: 1200,
    votos: 3410,
    compartidos: 890,
  },
  {
    id: "clutch-1v5",
    username: "noscope_king_2012",
    retoTitulo: "Clutch 1v5 en ranked",
    categoria: "Gaming",
    meGusta: 88900,
    comentarios: 2100,
    votos: 5620,
    compartidos: 1500,
  },
  {
    id: "cover-una-toma",
    username: "lucia.voz",
    retoTitulo: "Cover a una sola toma, sin cortes",
    categoria: "Música",
    meGusta: 210000,
    comentarios: 5400,
    votos: 12840,
    compartidos: 3200,
  },
  {
    id: "coreo-agosto",
    username: "dario",
    retoTitulo: "Coreografía del reto de agosto",
    categoria: "Baile",
    meGusta: 7600,
    comentarios: 190,
    votos: 890,
    compartidos: 95,
  },
];

/** 1 decimal, sin ".0" (1.0 -> "1", 12.4 -> "12.4"). */
function redondea1(x: number): string {
  return (Math.round(x * 10) / 10).toString();
}

/**
 * Formato COMPACTO de un contador (decision PURA, atada con dientes): < 1000 tal cual; miles -> "K";
 * millones -> "M". Se renderiza con `tabular-nums`. Romper el formato (no compactar) cae en rojo.
 */
export function formatearContador(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${redondea1(n / 1000)}K`;
  return `${redondea1(n / 1_000_000)}M`;
}
