/**
 * PARTICIPACIÓN -> ÍTEM DE FEED. La conversión que permite que UN SOLO componente de feed pinte tanto
 * el feed global como el de un reto.
 *
 * Vive aquí, pura y en un único sitio, porque la usan tres superficies (la página del detalle, el
 * endpoint que pagina, y el overlay en cliente) y las tres tienen que producir EXACTAMENTE la misma
 * forma. Si cada una la escribiera a su manera, un campo que se olvidase en una —como pasó con
 * `participacionId`— rompería solo en esa pantalla y en silencio.
 *
 * NO firma nada ni consulta nada: recibe las URLs ya firmadas por quien tiene el `env` a mano. Así se
 * puede testear sin entorno, igual que el resto de \`src/lib\`.
 */

/** Lo mínimo de la participación que hace falta para pintarla en el feed. */
export interface ParticipacionParaFeed {
  submissionId: string;
  videoId: string;
  title: string | null;
  votos: number;
  username: string;
  displayName: string | null;
  retoId: string;
  retoAbierto: boolean;
  miVoto: string | null;
}

/** Datos del RETO, iguales para toda la lista: se pasan una vez, no por ítem. */
export interface RetoParaFeed {
  titulo: string;
  /** Nombre ya resuelto de la categoría (o `null`), igual que lo devuelve el feed global. */
  categoria: string | null;
}

/**
 * Item del feed construido desde una participación.
 *
 * `id` es el del VÍDEO —igual que en el feed global— porque es la clave de React de cada slide y lo
 * que usa `onNoDisponible` para retirar uno roto. El de la PARTICIPACIÓN va aparte en
 * `participacionId`, que es de lo que hablan las rutas de voto y del gate de "visto".
 */
export function postDeParticipacion(
  p: ParticipacionParaFeed,
  reto: RetoParaFeed,
  urls: { src: string; poster: string },
) {
  return {
    id: p.videoId,
    displayName: p.displayName,
    username: p.username,
    // El caption del feed es el TÍTULO DEL RETO, no el del vídeo: dentro del feed de un reto todos
    // comparten reto, y es lo que da contexto ("Reto: …") igual que en el feed global.
    retoTitulo: reto.titulo,
    categoria: reto.categoria,
    votos: p.votos,
    src: urls.src,
    poster: urls.poster,
    participacionId: p.submissionId,
    retoId: p.retoId,
    retoAbierto: p.retoAbierto,
    miVoto: p.miVoto,
  };
}
