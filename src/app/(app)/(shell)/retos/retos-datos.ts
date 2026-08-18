/**
 * RETOS · datos de VISTA y logica pura del feed (Paso C · unidad 2). Todo aqui es maqueta: NO es el
 * modelo de datos (eso es decision posterior) ni toca backend. `RetoVista` es la forma de
 * PRESENTACION —tipada para que la fuente real entre luego sin rediseñar la pantalla— y `RETOS_SEED`
 * es el mock. El plazo se guarda como OFFSET (`restanteMs`) para poder ver la alarma en vivo; el
 * feed (cliente) lo convierte a `deadlineMs` absoluto en el montaje (sin Date.now() en el render).
 */

import { CATEGORIES, type CategoryKey } from "@/config/constants";

/**
 * Las 14 categorias — FUENTE UNICA: `CATEGORIES` de `config/constants` (documento maestro; sin
 * "Deportes"). Aqui NO se duplica la lista: solo se ADAPTA su forma a la vista (`clave` = la `key`
 * estable que guarda `Challenge.category`; `nombre` = la etiqueta en español).
 */
export const CATEGORIAS = CATEGORIES.map((c) => ({ clave: c.key, nombre: c.es }));

export type CategoriaClave = CategoryKey;

/** clave -> etiqueta legible de una categoria. Acepta `string` (una clave desconocida se devuelve tal
 *  cual): asi vale tambien para la categoria cruda de un resultado de busqueda. */
export function nombreCategoria(clave: string): string {
  return CATEGORIES.find((c) => c.key === clave)?.es ?? clave;
}

/** Clave del filtro "Todos" (no es una categoria: no puede chocar con ninguna `clave`). */
export const CATEGORIA_TODOS = "todos" as const;

/**
 * Forma de VISTA de un reto (solo presentacion). En datos reales `deadlineMs` sera absoluto.
 * `autorUsername` y `votos` son campos de vista minimos para el detalle (unidad 3): representan el
 * video del participante que se esta votando en la maqueta; NO son el modelo de datos.
 */
export type RetoVista = {
  id: string;
  titulo: string;
  categoria: CategoriaClave;
  premioCents: number;
  deadlineMs: number;
  miniaturaPlaceholder: string;
  autorUsername: string;
  votos: number;
};

/** Semilla del mock: como `RetoVista` pero el plazo va como offset desde "ahora" (`restanteMs`). */
export type RetoSemilla = Omit<RetoVista, "deadlineMs"> & { restanteMs: number };

const H = 60 * 60 * 1000;
const D = 24 * H;
const M = 60 * 1000;

export const RETOS_SEED: readonly RetoSemilla[] = [
  {
    id: "salto-en-caja",
    titulo: "Tu mejor salto en caja (box jump)",
    categoria: "fitness",
    premioCents: 25000,
    restanteMs: 6 * D + 4 * H,
    miniaturaPlaceholder: "Salto en caja",
    autorUsername: "carlos_fit",
    votos: 1240,
  },
  {
    id: "receta-60s",
    titulo: "Receta viral en 60 segundos, un solo plano",
    categoria: "lifestyle",
    premioCents: 12000,
    restanteMs: 18 * H, // < 24 h -> alarma
    miniaturaPlaceholder: "Receta 60s",
    autorUsername: "cocina_express_maria",
    votos: 3410,
  },
  {
    id: "coreo-agosto",
    titulo: "Coreografía del reto de agosto con el giro que nadie ha clavado todavía",
    categoria: "baile",
    premioCents: 50000,
    restanteMs: 2 * D,
    miniaturaPlaceholder: "Coreo agosto",
    autorUsername: "dario",
    votos: 890,
  },
  {
    id: "clutch-1v5",
    titulo: "Clutch 1v5 en ranked",
    categoria: "gaming",
    premioCents: 7500,
    restanteMs: 3 * H + 20 * M, // < 24 h -> alarma
    miniaturaPlaceholder: "Clutch 1v5",
    autorUsername: "noscope_king_2012",
    votos: 5620,
  },
  {
    id: "cover-una-toma",
    titulo: "Cover a una sola toma, sin cortes",
    categoria: "musica",
    premioCents: 125000,
    restanteMs: 5 * D + 12 * H,
    miniaturaPlaceholder: "Cover 1 toma",
    autorUsername: "lucia.voz",
    votos: 12840,
  },
  {
    id: "sketch-30s",
    titulo: "Sketch de 30 s",
    categoria: "humor",
    premioCents: 4000,
    restanteMs: 45 * M, // < 24 h -> alarma (por vencer)
    miniaturaPlaceholder: "Sketch 30s",
    autorUsername: "rae",
    votos: 430,
  },
  {
    id: "truco-perro",
    titulo: "El truco más rápido de tu perro",
    categoria: "talento",
    premioCents: 9000,
    restanteMs: 9 * D,
    miniaturaPlaceholder: "Truco perro",
    autorUsername: "maxi_y_rocky",
    votos: 2075,
  },
  {
    id: "tiro-centro",
    titulo: "Tiro libre desde el círculo central",
    categoria: "street",
    premioCents: 30000,
    restanteMs: 12 * H, // < 24 h -> alarma
    miniaturaPlaceholder: "Tiro centro",
    autorUsername: "laia10",
    votos: 760,
  },
];

/**
 * Filtro PURO del feed. `todos` -> todos (copia estable, mismo orden); una categoria -> solo los que
 * coinciden. NO muta la lista original. Extraido para atarlo con dientes: ignorar la categoria cae
 * en rojo. Generico sobre `{ categoria }` para atarlo con datos minimos.
 */
export function filtrarRetos<T extends { categoria: string }>(
  retos: readonly T[],
  categoria: string,
): T[] {
  if (categoria === CATEGORIA_TODOS) return retos.slice();
  return retos.filter((reto) => reto.categoria === categoria);
}

/**
 * Busca un reto por id (PURA). Existente -> el reto; inexistente -> undefined (el detalle server la
 * usa para decidir el 404 con notFound()). Extraida para atarla con dientes: romper la busqueda
 * (devolver algo para un id que no existe) cae en rojo.
 */
export function buscarReto(id: string): RetoSemilla | undefined {
  return RETOS_SEED.find((reto) => reto.id === id);
}

/**
 * Seleccion de retos DESTACADOS (PURA): los `n` MAS votados, de mayor a menor. Copia (no muta) y
 * ordena por `votos` desc; `n<=0` -> vacio; `n` mayor que la lista -> todos ordenados. Extraida para
 * atarla con dientes: cambiar el criterio (ordenar ascendente, por premio, o no ordenar) cambia el
 * resultado y cae en rojo. La portada la usa (el 1o al hero, el resto a la rejilla); NO es ranking ni
 * modelo de datos. Generica sobre `{ votos }` para atarla con datos minimos.
 */
export function retosDestacados<T extends { votos: number }>(retos: readonly T[], n: number): T[] {
  return retos
    .slice()
    .sort((a, b) => b.votos - a.votos)
    .slice(0, Math.max(0, n));
}
