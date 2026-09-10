/**
 * CIERRE DE RETO · la DECISIÓN, pura y total. Sin Prisma, sin red: entra la lista de participaciones
 * que cuentan y sale quién gana, quién entra en el top-20 y por qué el reto cierra como cierra.
 *
 * Está separada del servicio a propósito. Un cierre otorga dinero y puntos, y es la clase de cosa que
 * se ejecuta una vez y no se puede deshacer: la parte que decide tiene que poder probarse a mano, caso
 * por caso, sin base de datos de por medio.
 *
 * LO QUE ESTA FUNCIÓN NO HACE, y es deliberado: no parte los empates en la línea del premio. El orden
 * que produce es TOTAL —determinista hasta el último elemento— así que técnicamente *podría* partir
 * cualquiera; pero repartir dinero por milisegundo de `createdAt` es una decisión de producto, no de
 * código. Cuando el empate cruza el corte, el reto cierra a la espera del admin y no se otorga nada.
 */
import type { MotivoCierre } from "@/config/constants";

/** Cuántas posiciones premian con puntos de top-20. */
export const TOP20_TAMANO = 20;

/** Una participación que ENTRA al cómputo (ya filtrada por el llamante: real y visible al cierre). */
export interface ParticipacionCierre {
  submissionId: string;
  userId: string;
  voteCount: number;
  createdAt: Date;
}

export interface GanadorCierre {
  submissionId: string;
  userId: string;
  /** 1 = primero. Correlativo y sin huecos. */
  rank: number;
}

export interface DecisionCierre {
  motivo: MotivoCierre;
  /** Ganadores declarados. VACÍO salvo en `CON_GANADORES`. */
  ganadores: GanadorCierre[];
}

/**
 * userIds de las 20 primeras del orden canónico.
 *
 * VA APARTE DE `decidirCierre`, y la razón salió de un test que se puso rojo: el top-20 NO depende
 * del empate en la línea del premio. Cuando venía dentro de la decisión, un reto que cerró en
 * `EMPATE_PENDIENTE` devolvía la lista vacía; al resolver el admin, la decisión —recalculada desde
 * unos votos que siguen empatados— seguía diciendo "empate" y devolvía vacío, así que el ganador
 * cobraba sus 30 de victoria y se quedaba sin los 10 del top-20. Dos fuentes discrepando sobre el
 * mismo hecho, que es exactamente lo que esta pieza existe para no hacer.
 *
 * Ahora el orden es un dato y el DERECHO a cobrarlo es una decisión del llamante, que la toma
 * mirando el motivo GUARDADO del reto. Una cosa, un sitio.
 */
export function top20DeParticipaciones(participaciones: readonly ParticipacionCierre[]): string[] {
  return ordenarParaCierre(participaciones)
    .slice(0, TOP20_TAMANO)
    .map((p) => p.userId);
}

/**
 * ORDEN CANÓNICO: más votos primero; a igual voto, la más reciente primero; y a igualdad de las dos,
 * por `submissionId`.
 *
 * El tercer criterio no viene del encargo y no es decorativo: sin él el orden no es TOTAL, y ni
 * `Array.prototype.sort` ni la base garantizan un orden estable entre elementos que comparan igual.
 * Dos ejecuciones del mismo cierre podrían producir listas distintas con los mismos datos, y un
 * cierre que no es reproducible no se puede reintentar — que es exactamente lo que hace el barrido.
 */
export function ordenarParaCierre(
  participaciones: readonly ParticipacionCierre[],
): ParticipacionCierre[] {
  return [...participaciones].sort((a, b) => {
    if (a.voteCount !== b.voteCount) return b.voteCount - a.voteCount;
    const ta = a.createdAt.getTime();
    const tb = b.createdAt.getTime();
    if (ta !== tb) return tb - ta;
    return a.submissionId < b.submissionId ? -1 : a.submissionId > b.submissionId ? 1 : 0;
  });
}

/**
 * Decide el cierre. `participaciones` ya viene filtrada: solo las que CUENTAN.
 *
 * Los tres desenlaces son terminales y no confundibles:
 *  - CON_GANADORES: hay ganadores y sus posiciones son inequívocas. Es el ÚNICO que reparte.
 *  - SIN_MINIMO: no hay bastantes participaciones para producir un resultado válido. Cierra vacío.
 *  - EMPATE_PENDIENTE: la línea del premio cae dentro de un empate a votos. No decide el sistema.
 *
 * Reparto de puntos, decisión EXPLÍCITA y no un efecto colateral: ganar y estar en el top-20 son
 * razones DISTINTAS, así que quien hace las dos cosas cobra las dos. Por eso `ganadores` y `top20` se
 * devuelven por separado y se solapan a propósito.
 */
export function decidirCierre(input: {
  participaciones: readonly ParticipacionCierre[];
  winnersCount: number;
  /** `null` = el reto no exige mínimo. */
  minParticipaciones: number | null;
}): DecisionCierre {
  const orden = ordenarParaCierre(input.participaciones);
  /** Cierre que no reparte nada. Se construye en cada uso: devolver el MISMO array a dos llamantes
   *  invitaría a que uno lo mutara y se lo encontrara el otro. */
  const vacio = (): Pick<DecisionCierre, "ganadores"> => ({ ganadores: [] });

  // El conjunto vacío cae aquí igual que el que se queda corto: sin participaciones no hay resultado
  // válido posible, y es el mismo desenlace para quien mira ("cerró sin ganador"). No se inventa un
  // cuarto motivo para decir lo mismo.
  const minimo = Math.max(input.minParticipaciones ?? 0, 1);
  if (orden.length < minimo) return { motivo: "SIN_MINIMO", ...vacio() };

  // Un reto que no pide ganadores no puede producir resultado válido. No se llega aquí desde el panel
  // —el Zod de creación exige >= 1— pero esta función es TOTAL: ante una fila corrupta no inventa un
  // ganador, que es lo único que no puede hacer cuando hay dinero detrás.
  const corte = Math.min(input.winnersCount, orden.length);
  if (corte < 1) return { motivo: "SIN_MINIMO", ...vacio() };

  const ultimoDentro = orden[corte - 1];
  const primeroFuera = orden[corte];
  // EMPATE EN LA LÍNEA DEL PREMIO: el último que entra tiene los MISMOS votos que el primero que se
  // queda fuera. Nadie cobra —tampoco quien ganó limpiamente por encima— porque el reparto entero
  // depende de una decisión que no es nuestra. Cuando el admin resuelva, se otorga todo de una vez
  // por el mismo camino idempotente.
  if (
    primeroFuera !== undefined &&
    ultimoDentro !== undefined &&
    ultimoDentro.voteCount === primeroFuera.voteCount
  ) {
    return { motivo: "EMPATE_PENDIENTE", ...vacio() };
  }

  return {
    motivo: "CON_GANADORES",
    ganadores: orden.slice(0, corte).map((p, i) => ({
      submissionId: p.submissionId,
      userId: p.userId,
      rank: i + 1,
    })),
  };
}

/**
 * Clave de idempotencia de un otorgamiento de puntos. Se deriva del HECHO (este usuario, en este
 * reto, por esta razón), no del momento ni de un contador: por eso re-ejecutar el cierre no vuelve a
 * sumar, y por eso un cierre a medias se completa simplemente volviéndolo a ejecutar.
 */
export function clavePuntosCierre(input: {
  challengeId: string;
  userId: string;
  razon: string;
}): string {
  return `cierre:${input.challengeId}:${input.userId}:${input.razon}`;
}
