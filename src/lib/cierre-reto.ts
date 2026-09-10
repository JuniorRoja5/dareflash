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

// ============================================================================
// RESOLUCIÓN DEL EMPATE (la decide el admin, pero NO decide lo que quiera)
// ============================================================================

/**
 * El reparto pendiente cuando un reto cerró en empate: quién ganó LIMPIO por encima de la línea, quién
 * está en disputa, y cuántas plazas de premio quedan por asignar dentro del grupo.
 */
export interface ReparticionEmpate {
  /** Por encima del empate. Su posición NO está en discusión y no se puede alterar. */
  limpios: ParticipacionCierre[];
  /** El grupo con los mismos votos donde cae la línea del premio. Aquí es donde el admin elige. */
  empatados: ParticipacionCierre[];
  /** Plazas de premio a repartir entre `empatados`. Siempre >= 1 cuando hay empate. */
  plazas: number;
}

/**
 * Analiza el empate de un reto. `null` si no hay ninguno (el resultado era inequívoco).
 *
 * Se recalcula sobre las participaciones que cuentan y no se guarda en ninguna tabla porque no hace
 * falta: la entrada está CONGELADA —los votos ya no cambian tras el deadline y ninguna participación
 * nueva puede publicarse en un reto cerrado—, así que esto es una función del dato, no un estado más
 * que mantener sincronizado. Inventar una tabla para guardarlo sería crear una segunda verdad.
 */
export function analizarEmpate(input: {
  participaciones: readonly ParticipacionCierre[];
  winnersCount: number;
}): ReparticionEmpate | null {
  const orden = ordenarParaCierre(input.participaciones);
  const corte = Math.min(input.winnersCount, orden.length);
  if (corte < 1) return null;

  const ultimoDentro = orden[corte - 1];
  const primeroFuera = orden[corte];
  if (
    primeroFuera === undefined ||
    ultimoDentro === undefined ||
    ultimoDentro.voteCount !== primeroFuera.voteCount
  ) {
    return null;
  }

  const votosEnDisputa = ultimoDentro.voteCount;
  let inicio = corte - 1;
  while (inicio > 0 && orden[inicio - 1]?.voteCount === votosEnDisputa) inicio -= 1;
  // El grupo llega hasta donde llegue ese mismo número de votos, también por debajo del corte: los de
  // fuera empatan con los de dentro y por eso el sistema no puede elegir.
  let fin = corte;
  while (fin < orden.length && orden[fin]?.voteCount === votosEnDisputa) fin += 1;

  return {
    limpios: orden.slice(0, inicio),
    empatados: orden.slice(inicio, fin),
    plazas: corte - inicio,
  };
}

/** Por qué se rechaza una resolución. Se traduce a copy humano en la ruta; aquí es un código. */
export type RechazoEmpate =
  /** El reto no tiene ningún empate que resolver. */
  | "SIN_EMPATE"
  /** No se han elegido tantas participaciones como plazas hay. */
  | "CANTIDAD"
  /** Se ha tocado a alguien cuya posición no estaba en discusión. */
  | "LIMPIOS_ALTERADOS"
  /** Se ha colado alguien que no estaba empatado (con menos votos, típicamente). */
  | "FUERA_DEL_GRUPO"
  /** La misma participación aparece dos veces. */
  | "REPETIDA";

export type ResolucionEmpate =
  { ok: true; ganadores: GanadorCierre[] } | { ok: false; rechazo: RechazoEmpate };

/**
 * Valida la elección del admin y produce los ganadores definitivos.
 *
 * POR QUÉ ESTA GUARDA EXISTE, y es de dinero: que el desempate lo decida una persona no significa que
 * pueda decidir CUALQUIER COSA. Sin esto, bastaba enviar el id de una participación con menos votos
 * para coronarla campeona, o reordenar a quien ya había ganado limpiamente por arriba. El admin
 * ROMPE el empate; no anula los votos.
 *
 * La regla, entera: los `limpios` conservan su orden y su rank; las plazas restantes solo pueden
 * llenarse con miembros del grupo EMPATADO, sin repetir. Cualquier otra cosa se rechaza.
 *
 * `elegidas` son las participaciones EN DISPUTA que el admin ordena — no la lista completa de
 * ganadores. Pedirle que reenvíe a los limpios sería darle la oportunidad de alterarlos.
 */
export function validarResolucionEmpate(input: {
  participaciones: readonly ParticipacionCierre[];
  winnersCount: number;
  elegidas: readonly string[];
}): ResolucionEmpate {
  const empate = analizarEmpate(input);
  if (!empate) return { ok: false, rechazo: "SIN_EMPATE" };
  if (input.elegidas.length !== empate.plazas) return { ok: false, rechazo: "CANTIDAD" };
  if (new Set(input.elegidas).size !== input.elegidas.length) {
    return { ok: false, rechazo: "REPETIDA" };
  }

  const enDisputa = new Map(empate.empatados.map((p) => [p.submissionId, p]));
  // Un id de los LIMPIOS entre las elegidas significa que se está intentando reordenar a quien ganó
  // por arriba. Se distingue de "no estaba empatado" porque son dos errores distintos del admin.
  const limpios = new Set(empate.limpios.map((p) => p.submissionId));
  for (const id of input.elegidas) {
    if (limpios.has(id)) return { ok: false, rechazo: "LIMPIOS_ALTERADOS" };
    if (!enDisputa.has(id)) return { ok: false, rechazo: "FUERA_DEL_GRUPO" };
  }

  const elegidas = input.elegidas.map((id) => enDisputa.get(id) as ParticipacionCierre);
  return {
    ok: true,
    ganadores: [...empate.limpios, ...elegidas].map((p, i) => ({
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
