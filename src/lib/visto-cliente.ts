/**
 * GATE DE "VISTO", LADO CLIENTE — mide reproducción real y deja la marca en el servidor.
 *
 * Aquí vive TODA la decisión (cuánto se ha visto, cuándo avisar, si reintentar); el reproductor solo
 * conecta los eventos del `<video>` con esto. Es a propósito: en este repo los tests corren en Node sin
 * DOM, así que lo que quede dentro de un `useEffect` NO se puede poner en rojo. Sacándolo aquí, sí.
 *
 * ┌─ CÓMO SE MIDE "REPRODUCIDO" (y por qué no con un temporizador) ────────────────────────────────┐
 * │ Se suman los AVANCES de `currentTime`, no segundos de reloj de pared. Consecuencias, todas      │
 * │ deseadas y ninguna programada aparte:                                                           │
 * │  - PAUSA: el `<video>` deja de emitir `timeupdate` y `currentTime` no avanza -> no acumula. No  │
 * │    hace falta escuchar `pause`/`play` ni parar ningún contador: sale gratis.                     │
 * │  - SEEK adelante: el salto es mayor que un avance natural -> NO da crédito (solo reajusta la    │
 * │    referencia). Arrastrar la barra hasta el final no "ve" el vídeo.                              │
 * │  - BUCLE (el feed repite): el salto al principio es negativo -> tampoco da crédito.              │
 * │  - PESTAÑA EN SEGUNDO PLANO: el navegador espacia los eventos; un hueco grande se descarta igual │
 * │    que un seek. Se pierde algo de crédito, que es el lado correcto en el que equivocarse.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * QUÉ ES Y QUÉ NO: fricción, no una garantía. Cualquiera puede llamar al endpoint sin reproducir nada
 * (ver `server/services/visto.ts`). No se sobre-ingenieriza con anti-spoof porque no serviría de nada.
 */
import { VISTO_SEGUNDOS_MINIMOS } from "@/config/constants";
import { postJsonCsrf } from "@/lib/cliente-http";

/**
 * Avance máximo (en segundos de vídeo) que se acepta como reproducción natural entre dos medidas.
 * `timeupdate` dispara ~4 veces por segundo, así que 1,5 s es holgadísimo para el caso normal y sigue
 * descartando cualquier salto deliberado.
 */
export const SALTO_MAX_SEG = 1.5;

// ---------------------------------------------------------------------------------------------
// 1. Medida de reproducción
// ---------------------------------------------------------------------------------------------

export interface VigilanteVisto {
  /** A llamar en cada `timeupdate` con el `currentTime` del elemento. */
  tiempo(currentTime: number): void;
  /** Vuelve a empezar: otro vídeo, o un intento fallido que se quiere reintentar. */
  reiniciar(): void;
  /** Segundos de reproducción REAL acumulados (para poder afirmarlo en un test). */
  readonly acumulado: number;
}

/**
 * `alCumplir` se llama UNA SOLA VEZ al cruzar el umbral, por mucho que se siga viendo: la idempotencia
 * del cliente se resuelve aquí, no confiando en que el servidor aguante las repeticiones.
 */
export function crearVigilanteVisto(opts: {
  minimoSeg?: number;
  alCumplir: () => void;
}): VigilanteVisto {
  const minimo = opts.minimoSeg ?? VISTO_SEGUNDOS_MINIMOS;
  let acumulado = 0;
  let anterior: number | null = null;
  let cumplido = false;

  return {
    get acumulado() {
      return acumulado;
    },
    tiempo(currentTime: number) {
      if (cumplido) return;
      if (anterior !== null) {
        const avance = currentTime - anterior;
        // Solo el avance NATURAL suma. Negativo (bucle/rebobinado) o demasiado grande (seek, pestaña
        // dormida) no da crédito: solo se reajusta la referencia y se sigue midiendo desde ahí.
        if (avance > 0 && avance <= SALTO_MAX_SEG) acumulado += avance;
      }
      anterior = currentTime;
      if (acumulado >= minimo) {
        cumplido = true;
        opts.alCumplir();
      }
    },
    reiniciar() {
      acumulado = 0;
      anterior = null;
      cumplido = false;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Registro local de "ya vistas"
// ---------------------------------------------------------------------------------------------

/**
 * Qué participaciones ha visto YA el usuario en esta carga de página. Lo consulta el botón de voto
 * (Pieza 3B) para no ofrecer un éxito optimista que el gate del servidor revertiría un instante después.
 *
 * En memoria y por carga de página, NO en `localStorage`: la marca del servidor caduca sola
 * (`VISTO_TTL_SEC`) y una copia persistente sobreviviría a la de verdad, que es justo el desajuste que
 * este registro existe para evitar. Perderla al recargar solo cuesta volver a ver unos segundos.
 */
const vistas = new Set<string>();
const oyentes = new Set<() => void>();

export function estaVista(submissionId: string): boolean {
  return vistas.has(submissionId);
}

/** Suscripción al estilo `useSyncExternalStore`: devuelve la función para darse de baja. */
export function suscribirVistas(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Vacía el registro. Para los tests, y para cuando cambia la sesión (las marcas eran de otro usuario). */
export function olvidarVistas(): void {
  vistas.clear();
  enVuelo.clear();
  for (const o of oyentes) o();
}

// ---------------------------------------------------------------------------------------------
// 3. Dejar la marca en el servidor
// ---------------------------------------------------------------------------------------------

/**
 * Qué pasó al intentar marcar. Cada valor tiene una CONSECUENCIA distinta para quien llama, por eso son
 * seis y no un booleano:
 *  - `marcada`: hecho; el registro local ya lo refleja.
 *  - `ya-estaba` / `en-vuelo`: no se repite la llamada (idempotencia del cliente).
 *  - `sin-sesion`: un invitado no marca. NO se reintenta: seguir viendo no le va a dar una sesión.
 *  - `descartada`: el servidor dijo que no (4xx: retirada, no publicada…). Reintentar no lo arreglaría.
 *  - `fallo`: red o servidor. Es lo ÚNICO que merece otro intento más adelante.
 */
export type ResultadoMarcaVista =
  "marcada" | "ya-estaba" | "en-vuelo" | "sin-sesion" | "descartada" | "fallo";

/** Llamadas en curso: dos avisos simultáneos de la misma participación no hacen dos POST. */
const enVuelo = new Set<string>();

/** El envío, inyectable para poder probarlo sin red. Por defecto, el cliente HTTP con CSRF del repo. */
export type EnviarMarca = (submissionId: string) => Promise<{ ok: boolean; status: number }>;

const enviarPorDefecto: EnviarMarca = (submissionId) =>
  postJsonCsrf(`/api/participaciones/${encodeURIComponent(submissionId)}/visto`, {});

/**
 * Deja la marca "he visto esta participación". NUNCA lanza: un fallo aquí no puede romper la
 * reproducción — el usuario está viendo un vídeo, no haciendo una operación con efectos.
 *
 * El registro local se actualiza SOLO si el servidor aceptó. Marcarlo antes (optimista) sería
 * exactamente el fallo que este registro existe para evitar: el botón de voto se habilitaría y el gate
 * del servidor lo tumbaría al pulsar.
 */
export async function marcarVista(
  submissionId: string,
  opts: { haySesion: boolean; enviar?: EnviarMarca },
): Promise<ResultadoMarcaVista> {
  // Un invitado no marca. El endpoint ya devuelve 401, pero llamar para que te digan que no tienes
  // sesión es gastar una petición (dos, con la del token CSRF) para nada.
  if (!opts.haySesion) return "sin-sesion";
  if (vistas.has(submissionId)) return "ya-estaba";
  if (enVuelo.has(submissionId)) return "en-vuelo";

  enVuelo.add(submissionId);
  try {
    const res = await (opts.enviar ?? enviarPorDefecto)(submissionId);
    if (res.ok) {
      vistas.add(submissionId);
      for (const o of oyentes) o();
      return "marcada";
    }
    // 4xx = el servidor ha dicho que no y no va a cambiar de idea (salvo 429, que es "ahora no").
    return res.status >= 400 && res.status < 500 && res.status !== 429 ? "descartada" : "fallo";
  } catch {
    // Excepción de red, o `postJsonCsrf` lanzando SIN_SESION. Se traga a propósito: el vídeo se ve
    // pase lo que pase. Como mucho, el usuario tendrá que reproducir un poco más para poder votar.
    return "fallo";
  } finally {
    enVuelo.delete(submissionId);
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Las dos cosas juntas: lo que consume el reproductor
// ---------------------------------------------------------------------------------------------

/**
 * Medir + marcar, ya atado. Es lo ÚNICO que usa el reproductor: allí solo queda `addEventListener`.
 *
 * REINTENTO ACOTADO: si la marca falla por red o por el servidor, otro tramo de reproducción vuelve a
 * intentarlo — pero un número fijo de veces, no en bucle. Con el servidor caído, un vídeo largo en
 * bucle dispararía una petición cada pocos segundos para siempre; y quien está viendo un vídeo no tiene
 * por qué enterarse de nada de esto.
 */
export function crearMarcadorVisto(
  submissionId: string,
  opts: {
    haySesion: boolean;
    enviar?: EnviarMarca;
    /** Reintentos TRAS el primer envío fallido. */
    reintentos?: number;
    minimoSeg?: number;
  },
): { tiempo(currentTime: number): void; readonly acumulado: number } {
  let restantes = opts.reintentos ?? 1;
  const vigilante = crearVigilanteVisto({
    minimoSeg: opts.minimoSeg,
    alCumplir: () => {
      void marcarVista(submissionId, { haySesion: opts.haySesion, enviar: opts.enviar }).then(
        (r) => {
          // SOLO `fallo` merece otra vuelta: `sin-sesion` y `descartada` no cambiarían viendo más vídeo,
          // y reintentarlas sería machacar un endpoint que ya ha dicho que no.
          if (r === "fallo" && restantes > 0) {
            restantes -= 1;
            vigilante.reiniciar();
          }
        },
      );
    },
  });
  return {
    tiempo: (t) => vigilante.tiempo(t),
    get acumulado() {
      return vigilante.acumulado;
    },
  };
}
