/**
 * AVISO DE CAPACIDAD — avisar ANTES del acantilado, no cuando ya está lento.
 *
 * ┌─ POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────────┐
 * │ El lanzamiento es gradual y la máquina no se amplía por adelantado: se amplía cuando el       │
 * │ tráfico se acerque al techo medido. Eso solo funciona si alguien se entera a tiempo, y el     │
 * │ margen es estrecho: entre «va bien» e «inservible» la latencia se multiplica por veinticinco. │
 * │                                                                                                 │
 * │ EL CORREO NO DICE CUÁNTA GENTE ES ESO, a propósito. La equivalencia entre porcentaje de CPU y │
 * │ personas cambia con cada optimización —el 50 % eran ~150 personas y tras arreglar el feed son  │
 * │ ~215— así que una cifra en el correo envejece sin que nadie la revise, y un aviso que miente   │
 * │ deja de leerse. El correo dice el PORCENTAJE sostenido, el reparto propio/steal y la acción.   │
 * │ Las equivalencias, con su fecha y su SHA, viven en el comentario de `constants.ts`.            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUÉ LA CPU Y NO OTRA COSA ────────────────────────────────────────────────────────────────┐
 * │ Es lo que de verdad se agota: en las cinco tandas del banco la memoria no pasó del 42 % de su │
 * │ límite en ningún contenedor, y el acantilado coincide con que el núcleo llega al 90 %. Además │
 * │ lo recoge TODO —anónimos, con sesión, worker, cron— sin contar nada por petición.              │
 * │                                                                                                 │
 * │ Descartadas: contar PETICIONES obliga a un contador que en memoria se pierde en cada           │
 * │ despliegue y en base de datos es una escritura por petición (añadir carga para medir la        │
 * │ carga); contar SESIONES mira a quien tiene cuenta, y el tráfico de un lanzamiento es anónimo.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOS UMBRALES INDEPENDIENTES, cada uno con su histéresis: cruzar el de «amplía ya» no re-arma ni
 * re-dispara el de «prepárate». Son dos avisos distintos con dos acciones distintas, y mezclarlos
 * haría que el segundo tapara al primero.
 */
import "server-only";

import { readFile } from "node:fs/promises";

import {
  CPU_AVISO_AMPLIA_PCT,
  CPU_AVISO_PREPARATE_PCT,
  CPU_MUESTRAS_VENTANA,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  leerContadores,
  medianaUso,
  usoEntre,
  type ContadoresCpu,
  type UsoCpu,
} from "@/lib/cpu-host";
import type { EmailAdapter } from "@/server/email/adapter";

import { avisarConHisteresis } from "./aviso-histeresis";

/** Claves de histéresis. Una por umbral: ver el docblock de arriba. */
const CLAVE_PREPARATE = "aviso:cpu_preparate";
const CLAVE_AMPLIA = "aviso:cpu_amplia";

/** Dónde vive el contador del host. Inyectable solo para poder probar el parseo con un fichero. */
const PROC_STAT = "/proc/stat";

/**
 * El vigilante. Guarda su ventana EN MEMORIA a propósito: una muestra de CPU de hace una hora no
 * vale nada, así que no hay motivo para persistirla, y un reinicio del worker solo cuesta diez
 * minutos de rearme. Lo que SÍ sobrevive al reinicio es el estado de los avisos, que vive en
 * `SystemState` — si no, cada despliegue reavisaría.
 */
export class VigilanteCapacidad {
  private anterior: ContadoresCpu | null = null;
  private readonly ventana: UsoCpu[] = [];

  constructor(
    private readonly leerProc: () => Promise<string> = () => readFile(PROC_STAT, "utf8"),
  ) {}

  /** Cuántas muestras tiene acumuladas. Para el log y para los tests. */
  get muestras(): number {
    return this.ventana.length;
  }

  /**
   * Toma una muestra. Devuelve el uso del intervalo, o `null` si todavía no se puede calcular (la
   * primera llamada no tiene con qué comparar).
   */
  async muestrear(): Promise<UsoCpu | null> {
    let texto: string;
    try {
      texto = await this.leerProc();
    } catch {
      // Sin /proc/stat (otro sistema operativo, o el fichero no está): el aviso simplemente no
      // mide. No se lanza: un worker que se cae por no poder leer un contador sería mucho peor
      // que un aviso que no avisa.
      return null;
    }
    const ahora = leerContadores(texto);
    if (!ahora) return null;

    const previo = this.anterior;
    this.anterior = ahora;
    if (!previo) return null;

    const uso = usoEntre(previo, ahora);
    if (!uso) return null;

    this.ventana.push(uso);
    if (this.ventana.length > CPU_MUESTRAS_VENTANA) this.ventana.shift();
    return uso;
  }

  /** La mediana del uso TOTAL (propio + steal) de la ventana, o `null` si aún no está llena. */
  medianaUsado(): number | null {
    // Solo se decide con la ventana COMPLETA: con tres muestras, "diez minutos sostenidos" es
    // mentira y el aviso saltaría a los noventa segundos de arrancar el worker.
    if (this.ventana.length < CPU_MUESTRAS_VENTANA) return null;
    return medianaUso(this.ventana.map((u) => u.usadoPct));
  }

  /** La mediana de cada parte, para poder contarlas por separado en el correo. */
  medianasPorParte(): { propio: number; steal: number } | null {
    if (this.ventana.length < CPU_MUESTRAS_VENTANA) return null;
    return {
      propio: medianaUso(this.ventana.map((u) => u.propioPct)) ?? 0,
      steal: medianaUso(this.ventana.map((u) => u.stealPct)) ?? 0,
    };
  }

  /** Las muestras tal cual, de la más antigua a la más reciente. Van en el correo. */
  instantaneas(): readonly UsoCpu[] {
    return this.ventana;
  }
}

const pct = (x: number) => `${x.toFixed(1)} %`;

/** La hora que lee quien recibe el correo, no UTC: el aviso lo abre una persona en España. */
function horaLocal(now: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(now);
}

/**
 * El cuerpo del correo. Separa lo NUESTRO del `steal` porque la acción no es la misma: si sube lo
 * nuestro, toca la segunda vCPU; si sube el `steal`, una vCPU más no arregla nada —el problema
 * está en el anfitrión—. Contarlo junto para el umbral y enseñarlo separado aquí es lo que evita
 * comprar el remedio equivocado.
 */
function cuerpo(
  v: VigilanteCapacidad,
  input: { mediana: number; umbral: number; titular: string; queHacer: string; now: Date },
): string {
  const partes = v.medianasPorParte() ?? { propio: 0, steal: 0 };
  const serie = v
    .instantaneas()
    .map(
      (u, i) =>
        `  ${String(i + 1).padStart(2)}. ${pct(u.usadoPct)}  (propio ${pct(u.propioPct)}, steal ${pct(u.stealPct)})`,
    )
    .join("\n");

  return [
    input.titular,
    "",
    `CPU del nucleo, mediana de los ultimos 10 minutos: ${pct(input.mediana)} (umbral ${input.umbral} %).`,
    `  de lo cual nuestro: ${pct(partes.propio)}`,
    `  y robado por el hipervisor (steal): ${pct(partes.steal)}`,
    "",
    input.queHacer,
    "",
    "Si lo que ha subido es el STEAL, una segunda vCPU no arregla nada: el procesador se lo esta",
    "llevando otro huesped del mismo anfitrion, y lo que toca es reclamar al proveedor o mudarse.",
    "",
    `Hora (Europe/Madrid): ${horaLocal(input.now)}`,
    "",
    "Las 20 muestras de la ventana, de la mas antigua a la mas reciente:",
    serie,
    "",
    "Aviso UNICO: no se repite hasta que la mediana baje del umbral y lo vuelva a cruzar.",
    "OJO: un despliegue (npm ci + next build) pone la CPU al tope varios minutos y puede",
    "disparar este aviso. Si las muestras son una montana y no una meseta, probablemente fue eso.",
  ].join("\n");
}

export interface ResultadoAvisoCapacidad {
  /** `null` mientras la ventana no está llena. */
  mediana: number | null;
  avisos: { preparate: boolean; amplia: boolean };
}

/**
 * Comprueba los dos umbrales. Se llama en la misma cadencia que el aviso de trabajos fallidos.
 *
 * El de «amplía ya» va PRIMERO porque es el que importa cuando los dos están cruzados; pero los
 * dos se evalúan siempre, porque son independientes y cada uno lleva su propia histéresis.
 */
export async function avisarSiCargaAlta(
  db: PrismaClient,
  adapter: EmailAdapter,
  vigilante: VigilanteCapacidad,
  input: { now?: Date; adminEmail?: string; log?: (m: string) => void },
): Promise<ResultadoAvisoCapacidad> {
  const now = input.now ?? new Date();
  const mediana = vigilante.medianaUsado();
  if (mediana === null) return { mediana: null, avisos: { preparate: false, amplia: false } };

  const amplia = await avisarConHisteresis(db, {
    clave: CLAVE_AMPLIA,
    superado: mediana >= CPU_AVISO_AMPLIA_PCT,
    mensaje: () => ({
      to: "",
      subject: `[DareFlash] AMPLIA YA: CPU al ${pct(mediana)} sostenido`,
      text: cuerpo(vigilante, {
        mediana,
        umbral: CPU_AVISO_AMPLIA_PCT,
        titular: "Amplia ya: estamos cerca del limite medido.",
        queHacer: "QUE HACER: ampliar a 2 vCPU.",
        now,
      }),
    }),
    sinDestinatario: `[worker] AVISO CAPACIDAD (sin ADMIN_EMAIL, NO enviado): CPU ${pct(mediana)} >= ${CPU_AVISO_AMPLIA_PCT} % (ampliar ya).`,
    enviado: `[worker] AVISO CAPACIDAD enviado (${input.adminEmail}): CPU ${pct(mediana)} >= ${CPU_AVISO_AMPLIA_PCT} % (ampliar ya).`,
    adapter,
    adminEmail: input.adminEmail,
    log: input.log,
  });

  const preparate = await avisarConHisteresis(db, {
    clave: CLAVE_PREPARATE,
    superado: mediana >= CPU_AVISO_PREPARATE_PCT,
    mensaje: () => ({
      to: "",
      subject: `[DareFlash] Preparate: CPU al ${pct(mediana)} sostenido`,
      text: cuerpo(vigilante, {
        mediana,
        umbral: CPU_AVISO_PREPARATE_PCT,
        titular: "Preparate: hay margen, pero conviene planificar la 2.a vCPU.",
        queHacer: "QUE HACER: planificar la segunda vCPU. Todavia no hay que correr.",
        now,
      }),
    }),
    sinDestinatario: `[worker] AVISO CAPACIDAD (sin ADMIN_EMAIL, NO enviado): CPU ${pct(mediana)} >= ${CPU_AVISO_PREPARATE_PCT} % (preparate).`,
    enviado: `[worker] AVISO CAPACIDAD enviado (${input.adminEmail}): CPU ${pct(mediana)} >= ${CPU_AVISO_PREPARATE_PCT} % (preparate).`,
    adapter,
    adminEmail: input.adminEmail,
    log: input.log,
  });

  return { mediana, avisos: { preparate, amplia } };
}
