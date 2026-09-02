/**
 * ESTADO DE VOTO EN CLIENTE — dónde tengo el voto de cada reto y qué le he sumado al recuento.
 *
 * Mismo patrón que el registro de "vistas" (`visto-cliente`) y por la misma razón: el botón del rail
 * del feed y el del modal del detalle son DOS montajes distintos del mismo componente, y la celda de
 * la rejilla es un tercero. Con estado local por componente se contradirían entre sí — votas en el
 * modal, lo cierras, y la celda de debajo sigue enseñando el número viejo.
 *
 * ┌─ POR QUÉ DOS MAPAS Y NO UNO ───────────────────────────────────────────────────────────────────┐
 * │ `votoPorReto`: dónde está mi voto, POR RETO. La regla del producto es "un voto por reto", así    │
 * │   que el reto es la clave natural: mover el voto es cambiar ESE valor, y por eso el origen se    │
 * │   descubre solo (no hay que buscarlo por ninguna lista).                                         │
 * │ `deltaPorParticipacion`: lo que YO he sumado o restado al recuento que vino del servidor. Se     │
 * │   guarda el DELTA, no el total: el total de partida lo trae cada superficie en su payload y       │
 * │   puede ser distinto (dos páginas del feed cargadas en momentos distintos). Guardar totales       │
 * │   obligaría a decidir cuál gana; con deltas, cada superficie suma el suyo y ninguna miente.       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OPTIMISTA SOLO EN TU PROPIA ACCIÓN, y con reversión: se aplica el cambio antes de la respuesta y se
 * DESHACE entero si el servidor dice que no. No hay streaming ni refresco en vivo de votos ajenos: el
 * número de partida es el de la carga, y encima solo se pinta lo que tú has hecho.
 */
import { MSG_VOTO_SIN_VER, MSG_VOTO_YA_VOTO_OTRA } from "@/config/constants";
import { delCsrf, mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

// ---------------------------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------------------------

/** retoId -> participación donde tengo el voto (`null` = no he votado en ese reto). */
const votoPorReto = new Map<string, string | null>();
/** participacionId -> lo que YO le he sumado al recuento del servidor. */
const deltaPorParticipacion = new Map<string, number>();
/** Retos con una acción en vuelo: dos pulsaciones seguidas no lanzan dos peticiones. */
const enCurso = new Set<string>();
const oyentes = new Set<() => void>();

function avisar(): void {
  for (const o of oyentes) o();
}

/** Dónde tengo el voto de este reto. `undefined` = el store todavía no sabe nada de este reto. */
export function votoEnReto(retoId: string): string | null | undefined {
  return votoPorReto.get(retoId);
}

/**
 * QUÉ VOTO ENSEÑAR: lo que sepa el store y, si no sabe nada de este reto, lo que trajo el payload.
 * PURA — no escribe nada. Por eso la vista puede llamarla en cada render sin tocar estado compartido
 * ni avisar a otros componentes a media renderización.
 *
 * OJO CON EL `??`: aquí NO vale `votoEnReto(reto) ?? miVoto`. `undefined` y `null` significan cosas
 * DISTINTAS —"no sé" y "sé que no tienes voto"— y `??` los trata igual, así que en cuanto el usuario
 * QUITA su voto (store = `null`) el fallback lo resucitaría con el valor del payload. La comprobación
 * tiene que ser explícita contra `undefined`.
 */
export function votoVisible(retoId: string, miVoto: string | null): string | null {
  const conocido = votoPorReto.get(retoId);
  return conocido === undefined ? miVoto : conocido;
}

/**
 * SIEMBRA PEREZOSA, dentro del handler de la acción y nunca en render. Fija el estado del payload solo
 * si el store aún no sabe nada de este reto.
 *
 * Hace falta para conservar el ORIGEN del movimiento: al mover, el store tiene que saber de dónde sale
 * el voto para restarle 1. Sin esto, la primera acción de la página creería que no había voto previo y
 * el contador del origen se quedaría alto.
 *
 * NO avisa a los oyentes: no cambia NADA de lo que se está pintando (`votoVisible` ya devolvía este
 * mismo valor), y el `aplicar` que viene justo detrás avisa igualmente.
 */
function sembrarSiFalta(retoId: string, miVoto: string | null | undefined): void {
  if (miVoto === undefined || votoPorReto.has(retoId)) return;
  votoPorReto.set(retoId, miVoto);
}

/** Lo que hay que sumarle al recuento que trajo el payload de esta participación. */
export function deltaDe(participacionId: string): number {
  return deltaPorParticipacion.get(participacionId) ?? 0;
}

export function suscribirVotos(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Vacía el estado. Para los tests, y para cuando cambia la sesión (el voto era de otro usuario). */
export function olvidarVotos(): void {
  votoPorReto.clear();
  deltaPorParticipacion.clear();
  enCurso.clear();
  avisar();
}

function sumarDelta(participacionId: string, n: number): void {
  const v = (deltaPorParticipacion.get(participacionId) ?? 0) + n;
  if (v === 0) deltaPorParticipacion.delete(participacionId);
  else deltaPorParticipacion.set(participacionId, v);
}

/**
 * Aplica el movimiento de voto de un reto: baja el origen (si lo había), sube el destino (si lo hay) y
 * apunta dónde queda. Sirve para votar (`destino`), quitar (`null`) y mover, que son la misma
 * operación con distintos extremos — escribirlas por separado era garantizar que una se desincronice.
 */
function aplicar(retoId: string, destino: string | null): void {
  const origen = votoPorReto.get(retoId) ?? null;
  if (origen === destino) return;
  if (origen) sumarDelta(origen, -1);
  if (destino) sumarDelta(destino, 1);
  votoPorReto.set(retoId, destino);
  avisar();
}

// ---------------------------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------------------------

/**
 * Lo que puede pasar al pulsar. Cada valor pinta algo distinto, por eso no es un booleano:
 *  - `hecho`: el estado ya refleja el cambio.
 *  - `requiere-mover`: el servidor pide consentimiento; la UI abre el diálogo con `votoActualEn`.
 *  - `sin-ver` / `rechazado`: no se pudo, con COPY HUMANO ya listo (nunca un código crudo).
 *  - `ocupado`: había otra acción del mismo reto en vuelo; se ignora la pulsación.
 */
export type ResultadoAccion =
  | { estado: "hecho" }
  | { estado: "requiere-mover"; votoActualEn: string | null; mensaje: string }
  | { estado: "sin-ver"; mensaje: string }
  | { estado: "rechazado"; mensaje: string }
  | { estado: "ocupado" };

/** Transporte inyectable: en los tests se sustituye por uno falso, sin red. */
export interface TransporteVoto {
  votar(
    participacionId: string,
    permitirMover: boolean,
  ): Promise<{ ok: boolean; status: number; code: string; data: unknown }>;
  quitar(
    participacionId: string,
  ): Promise<{ ok: boolean; status: number; code: string; data: unknown }>;
}

const transportePorDefecto: TransporteVoto = {
  votar: (id, permitirMover) =>
    postJsonCsrf(`/api/participaciones/${encodeURIComponent(id)}/voto`, { permitirMover }),
  quitar: (id) => delCsrf(`/api/participaciones/${encodeURIComponent(id)}/voto`),
};

const COPY_GENERICO = "No se pudo registrar tu voto. Inténtalo de nuevo.";

/** El copy SIEMPRE sale del servidor (`error.message`, ya humano); el genérico es solo para la red. */
function copyDe(data: unknown): string {
  return mensajeDe(data) || COPY_GENERICO;
}

/**
 * VOTAR esta participación, opcionalmente moviendo el voto que ya hubiera en otra del mismo reto.
 *
 * El cambio se aplica ANTES de la respuesta y se DESHACE entero si el servidor dice que no: guardar el
 * estado previo y restaurarlo es lo que evita el "éxito y revierte a medias" (contador movido pero
 * botón sin cambiar, o al revés).
 */
export async function accionVotar(
  input: {
    retoId: string;
    participacionId: string;
    permitirMover?: boolean;
    /** Voto que traía el payload, para la siembra perezosa (ver `sembrarSiFalta`). */
    miVoto?: string | null;
  },
  opts: { transporte?: TransporteVoto } = {},
): Promise<ResultadoAccion> {
  const { retoId, participacionId } = input;
  if (enCurso.has(retoId)) return { estado: "ocupado" };
  sembrarSiFalta(retoId, input.miVoto);
  const previo = votoPorReto.get(retoId) ?? null;
  if (previo === participacionId) return { estado: "hecho" }; // ya votada: nada que hacer

  enCurso.add(retoId);
  aplicar(retoId, participacionId);
  try {
    const r = await (opts.transporte ?? transportePorDefecto).votar(
      participacionId,
      input.permitirMover === true,
    );
    const cuerpo = r.data as { estado?: string; votoActualEn?: string; mensaje?: string } | null;

    // `requiere-mover` llega como 200 (no es un error: es una pregunta). Se DESHACE el optimismo y se
    // devuelve la señal para que la UI pida consentimiento.
    if (r.ok && cuerpo?.estado === "requiere-mover") {
      aplicar(retoId, previo);
      return {
        estado: "requiere-mover",
        votoActualEn: cuerpo.votoActualEn ?? null,
        mensaje: cuerpo.mensaje || MSG_VOTO_YA_VOTO_OTRA,
      };
    }
    if (r.ok) return { estado: "hecho" };

    aplicar(retoId, previo);
    // El gate NO debería saltar aquí (el botón no se habilita sin marca), pero puede: la marca del
    // servidor caduca sola. Se distingue para que la UI vuelva a pedir reproducción, no un reintento.
    if (r.code === "SIN_VER")
      return { estado: "sin-ver", mensaje: mensajeDe(r.data) || MSG_VOTO_SIN_VER };
    return { estado: "rechazado", mensaje: copyDe(r.data) };
  } catch {
    aplicar(retoId, previo); // red caída: no se queda un "Votado" que no existe en el servidor
    return { estado: "rechazado", mensaje: COPY_GENERICO };
  } finally {
    enCurso.delete(retoId);
  }
}

/** QUITAR el voto de esta participación. Mismo optimismo con reversión. */
export async function accionQuitar(
  input: { retoId: string; participacionId: string; miVoto?: string | null },
  opts: { transporte?: TransporteVoto } = {},
): Promise<ResultadoAccion> {
  const { retoId, participacionId } = input;
  if (enCurso.has(retoId)) return { estado: "ocupado" };
  sembrarSiFalta(retoId, input.miVoto);
  const previo = votoPorReto.get(retoId) ?? null;
  if (previo !== participacionId) return { estado: "hecho" }; // no hay voto aquí que quitar

  enCurso.add(retoId);
  aplicar(retoId, null);
  try {
    const r = await (opts.transporte ?? transportePorDefecto).quitar(participacionId);
    if (r.ok) return { estado: "hecho" };
    aplicar(retoId, previo);
    return { estado: "rechazado", mensaje: copyDe(r.data) };
  } catch {
    aplicar(retoId, previo);
    return { estado: "rechazado", mensaje: COPY_GENERICO };
  } finally {
    enCurso.delete(retoId);
  }
}

// ---------------------------------------------------------------------------------------------
// Qué pintar
// ---------------------------------------------------------------------------------------------

/**
 * Estado VISIBLE del botón. Se calcula, no se guarda: derivarlo de los mapas (más la sesión, el gate y
 * la ventana del reto) es lo que impide que el botón y el estado real se separen.
 *
 * ORDEN de las guardas, y no es arbitrario: primero lo que NO depende del usuario (reto cerrado, no
 * votable), luego la sesión, luego el gate. Así un invitado ante un reto cerrado ve "cerrado" y no un
 * "inicia sesión" que no le llevaría a ninguna parte.
 */
export type EstadoBoton = "cerrado" | "invitado" | "sin-ver" | "votar" | "votado" | "no-votable";

export function estadoBoton(input: {
  retoAbierto: boolean;
  haySesion: boolean;
  visto: boolean;
  votoActual: string | null | undefined;
  participacionId: string;
  /** ¿Es MÍA? No se puede votar la propia participación (el servidor responde AUTOVOTO). */
  esMia?: boolean;
}): EstadoBoton {
  if (!input.retoAbierto) return "cerrado";
  if (input.esMia) return "no-votable";
  // Quitar el voto propio SÍ se permite sin marca de visto (igual que en el servidor): exigirla para
  // deshacer sería una trampa, porque la marca caduca antes que el voto.
  if (input.votoActual === input.participacionId) return input.haySesion ? "votado" : "invitado";
  if (!input.haySesion) return "invitado";
  if (!input.visto) return "sin-ver";
  return "votar";
}
