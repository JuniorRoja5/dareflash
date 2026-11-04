/**
 * CUÁNTA CPU DE LA MÁQUINA SE ESTÁ USANDO. Puro: recibe el texto de `/proc/stat`, no lo lee.
 *
 * ┌─ POR QUÉ EL HOST Y NO EL CONTENEDOR ───────────────────────────────────────────────────────────┐
 * │ La máquina tiene UNA vCPU y la comparten los cinco contenedores. Lo que se agota es ese núcleo │
 * │ entero, no la cuota de ninguno: medir solo el del worker diría que todo va bien mientras `web` │
 * │ y MariaDB se lo comen. En Docker, `/proc/stat` NO está aislado por contenedor —lo que se lee   │
 * │ desde dentro son los contadores del host—, así que esto mide justo lo que hace falta sin       │
 * │ montar nada ni hablar con el demonio de Docker.                                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ EL `steal` CUENTA PARA EL UMBRAL. DECISIÓN, CON MOTIVO ───────────────────────────────────────┐
 * │ `steal` es el tiempo en que nuestra vCPU estaba lista para ejecutar y el hipervisor le dio el  │
 * │ procesador físico a otro huésped. Desde dentro es indistinguible de estar ocupados: las        │
 * │ peticiones esperan igual. Como la pregunta del aviso es «¿nos estamos quedando sin núcleo?»,   │
 * │ un ciclo robado está tan perdido como uno gastado, y dejarlo fuera haría que una máquina       │
 * │ ahogada por un vecino ruidoso se viera ociosa en el aviso.                                      │
 * │                                                                                                 │
 * │ PERO LA ACCIÓN NO ES LA MISMA, y por eso el correo los separa: si lo que sube es lo NUESTRO,   │
 * │ toca la segunda vCPU; si lo que sube es el `steal`, una vCPU más no arregla nada —el problema  │
 * │ está en el anfitrión y lo que toca es reclamar o mudarse—. Contarlo junto y enseñarlo separado │
 * │ es lo que evita comprar el remedio equivocado.                                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Los contadores acumulados de la línea `cpu` de `/proc/stat`, en jiffies. */
export interface ContadoresCpu {
  /** Trabajo NUESTRO: user + nice + system + irq + softirq. */
  propio: number;
  /** Ciclos que el hipervisor le dio a otro huésped. */
  steal: number;
  /** Ocioso de verdad: idle + iowait. */
  ocioso: number;
  /** La suma de los tres. */
  total: number;
}

/**
 * Lee la primera línea `cpu` (la agregada de todos los núcleos).
 *
 * `guest` y `guest_nice` se IGNORAN a propósito: el kernel ya los tiene sumados dentro de `user` y
 * `nice`, así que sumarlos otra vez inflaría el total y el porcentaje saldría bajo. Es el error
 * clásico al leer este fichero.
 *
 * `iowait` cuenta como OCIOSO, no como ocupado: en ese tiempo el núcleo estaba libre esperando al
 * disco, y contarlo como uso haría saltar el aviso por un pico de entrada/salida que no agota CPU.
 */
export function leerContadores(procStat: string): ContadoresCpu | null {
  const linea = procStat.split("\n").find((l) => /^cpu\s/.test(l));
  if (!linea) return null;

  const n = linea
    .trim()
    .split(/\s+/)
    .slice(1)
    .map((x) => Number(x));
  // Hacen falta al menos hasta `steal` (8 campos). Un /proc/stat más corto es de un kernel
  // antiquísimo o no es /proc/stat: mejor devolver null que inventar un número.
  if (n.length < 8 || n.some((x) => !Number.isFinite(x) || x < 0)) return null;

  const [user, nice, system, idle, iowait, irq, softirq, steal] = n as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const propio = user + nice + system + irq + softirq;
  const ocioso = idle + iowait;
  return { propio, steal, ocioso, total: propio + steal + ocioso };
}

/** El reparto de un INTERVALO, en tanto por ciento del núcleo. */
export interface UsoCpu {
  /** Lo nuestro, 0-100. */
  propioPct: number;
  /** Lo que se llevó el hipervisor, 0-100. */
  stealPct: number;
  /** `propioPct + stealPct`: lo que NO estuvo disponible. Es lo que mira el umbral. */
  usadoPct: number;
}

/**
 * El uso entre dos lecturas. Devuelve `null` si no se puede calcular, que es lo correcto en los
 * tres casos en que pasa: la primera muestra (no hay anterior), dos lecturas idénticas (intervalo
 * de cero) y un contador que RETROCEDE (reinicio de la máquina). Inventar un 0 % en cualquiera de
 * los tres metería una muestra falsa justo en la mediana que decide el aviso.
 */
export function usoEntre(antes: ContadoresCpu, ahora: ContadoresCpu): UsoCpu | null {
  const total = ahora.total - antes.total;
  const propio = ahora.propio - antes.propio;
  const steal = ahora.steal - antes.steal;
  if (total <= 0 || propio < 0 || steal < 0) return null;

  const pct = (x: number) => Math.min(100, Math.max(0, (x / total) * 100));
  const propioPct = pct(propio);
  const stealPct = pct(steal);
  return { propioPct, stealPct, usadoPct: Math.min(100, propioPct + stealPct) };
}

/**
 * La MEDIANA de las muestras, que es lo que se compara con el umbral.
 *
 * Mediana y no media: la media la mueve un solo pico —el cron de puntuaciones, una migración, un
 * barrido— y el aviso saltaría por algo que dura dos minutos. Con veinte muestras de treinta
 * segundos, un pico de tres minutos son seis muestras y la mediana ni se entera.
 */
export function medianaUso(muestras: readonly number[]): number | null {
  if (muestras.length === 0) return null;
  const orden = [...muestras].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1]! + orden[medio]!) / 2 : orden[medio]!;
}
