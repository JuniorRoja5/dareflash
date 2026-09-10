/**
 * SUBIDA DE VÍDEO · ESTADO REAL Y COPY. Lógica PURA (sin React, sin tus-js-client) para poder atarla
 * con tests: qué estado corresponde a cada señal, y qué se le dice al usuario en cada uno.
 *
 * POR QUÉ EXISTE. La subida tenía UN solo camino de error —"No se pudo subir el vídeo. Revisa tu
 * conexión"— para causas que no se parecen en nada: el móvil sin cobertura, la subida cortada al 70 %,
 * la credencial caducada y un rechazo del propio Bunny. Al usuario se le pedía que revisara su
 * conexión aunque su conexión estuviera perfecta. Y al terminar, un "lo estamos procesando" mudo que
 * no distinguía "esto tarda porque hay una cola de codificación" de "algo va mal".
 *
 * LA DISTINCIÓN QUE IMPORTA, y por qué es estructural y no cosmética: subir bytes y codificar son dos
 * fases con dueños distintos. Los bytes son nuestros (del navegador a Bunny, por TUS). La codificación
 * es de Bunny, y ocurre DESPUÉS de que el último byte haya llegado. Meterlas en un mismo "procesando"
 * es el mismo error que costó el veto de participación: un estado que significa dos cosas acaba
 * mintiendo sobre una de las dos. Aquí son estados separados y una función se niega a producir el
 * segundo mientras quede un byte por enviar.
 */

/**
 * Estados visibles de una subida: cuatro de curso normal y los de `ESTADOS_FALLO`. Los fallos son
 * distintos A PROPÓSITO, porque cada uno lleva a una acción distinta del usuario (mirar la cobertura,
 * reintentar, volver a empezar, cambiar de fichero, recortar el vídeo). Colapsarlos es volver al bug.
 */
export type EstadoSubida =
  /**
   * Pidiendo permiso de subida al servidor. Todavía NO se mueve un byte de vídeo: decir "subiendo"
   * aquí es la misma mentira en pequeño, y encima es la fase donde caen los rechazos por reglas
   * (sesión, elegibilidad, reto cerrado) que no tienen nada que ver con la red.
   */
  | "preparando"
  /** Bytes en vuelo hacia Bunny. Es el ÚNICO estado mientras la subida no haya terminado. */
  | "subiendo"
  /** Subida COMPLETA. El vídeo está a salvo en Bunny y espera turno en su cola de codificación. */
  | "en-cola"
  /** Codificado y reproducible. */
  | "listo"
  /** No salió ni un byte y no hubo respuesta: no se pudo conectar. */
  | "sin-conexion"
  /** Salieron bytes y luego se cortó: reintentable, la subida TUS es reanudable. */
  | "corte"
  /** La credencial de subida ya no vale (caducó o fue rechazada). Hay que empezar de nuevo. */
  | "credencial"
  /** Bunny respondió pero no aceptó el fichero (formato, tamaño, cuota). Cambiar el vídeo. */
  | "rechazo"
  /** Bunny respondió con un fallo suyo (5xx). No es culpa del usuario: reintentar más tarde. */
  | "servidor-ocupado"
  /**
   * La subida llegó entera pero la CODIFICACIÓN falló: el vídeo no va a publicarse nunca. Es un
   * desenlace terminal, no una espera larga, y por eso no puede compartir estado con "en-cola".
   */
  | "fallo-codificacion"
  /** El servidor midió la duración real y supera el límite. Terminal y con una acción clara: recortar. */
  | "demasiado-largo";

/** Los estados que son un fallo. Fuente única: la UI no vuelve a mantener su propia lista. */
export const ESTADOS_FALLO = [
  "sin-conexion",
  "corte",
  "credencial",
  "rechazo",
  "servidor-ocupado",
  "fallo-codificacion",
  "demasiado-largo",
] as const;

/** Las cinco causas que se deducen de un fallo del TRANSPORTE (a diferencia de las de codificación). */
export const ESTADOS_FALLO_SUBIDA = [
  "sin-conexion",
  "corte",
  "credencial",
  "rechazo",
  "servidor-ocupado",
] as const;

export function esFallo(estado: EstadoSubida): boolean {
  return (ESTADOS_FALLO as readonly string[]).includes(estado);
}

/**
 * ¿Tiene sentido ofrecer "reintentar" con el MISMO fichero? Un corte o un servidor ocupado sí (TUS es
 * reanudable y la causa es transitoria). Una credencial caducada también, pero rearrancando desde
 * cero. Un rechazo del fichero NO: reintentar lo mismo da lo mismo, hay que cambiar de vídeo.
 */
export function puedeReintentar(estado: EstadoSubida): boolean {
  return estado === "corte" || estado === "servidor-ocupado" || estado === "credencial";
}

/**
 * Señal cruda de un fallo de `tus-js-client`. `estadoHttp` es `originalResponse?.getStatus()` del
 * `DetailedError`: **null cuando no hubo respuesta HTTP en absoluto** (DNS, sin red, CORS, conexión
 * abortada), que es justo lo que separa "no se pudo conectar" de "conectó y algo dijo".
 *
 * MEDIDO, no supuesto, hasta donde se puede desde aquí: la forma del error es la de tus-js-client
 * 4.3.1 (`DetailedError.originalResponse: HttpResponse | null`, `getStatus(): number`), verificada en
 * sus tipos. El reparto por CÓDIGO se hace por SEMÁNTICA HTTP (5xx = del servidor, 401/403 = la
 * credencial, resto 4xx = el fichero), NO por una tabla de códigos propios de Bunny: no se han
 * observado contra la API real, y escribir de memoria una lista que no se ha visto es exactamente la
 * clase de comentario que promete de más. Si algún día se miden, el reparto se afina aquí y solo aquí.
 */
export interface SenalFallo {
  /** Bytes que llegaron a salir. 0 = no salió nada. */
  bytesEnviados: number;
  /** Código HTTP de la respuesta, o `null` si no hubo respuesta. */
  estadoHttp: number | null;
}

/**
 * Clasifica un fallo de subida en su causa REAL. Es la función que sustituye al genérico único.
 *
 * El orden importa: primero "¿hubo respuesta?", porque sin respuesta el código no existe y lo único
 * que distingue los dos casos es si llegó a salir algún byte.
 */
export function clasificarFalloSubida(senal: SenalFallo): EstadoSubida {
  if (senal.estadoHttp === null) {
    // Sin respuesta. Con 0 bytes fuera es un problema de conexión; con bytes fuera, la conexión
    // existía y se cortó — y eso se reanuda, así que no se le dice al usuario que revise su red.
    return senal.bytesEnviados > 0 ? "corte" : "sin-conexion";
  }
  if (senal.estadoHttp >= 500) return "servidor-ocupado";
  if (senal.estadoHttp === 401 || senal.estadoHttp === 403) return "credencial";
  return "rechazo";
}

/**
 * Estado mientras la subida está en marcha. INVARIANTE DURO: nunca devuelve "en-cola" si la subida no
 * ha COMPLETADO, ni siquiera cuando los bytes enviados igualan al total.
 *
 * Por qué el porcentaje NO basta: TUS reporta el progreso del cuerpo enviado, pero la subida no está
 * cerrada hasta que el último PATCH recibe su respuesta. Hay una ventana real —la más larga en móvil
 * con subida lenta— en la que el contador marca 100 % y el fichero todavía no está entero en Bunny.
 * Anunciar ahí "en cola de codificación" sería mentir en el peor momento: si esa última petición
 * falla, ya le habríamos dicho al usuario que su vídeo estaba a salvo. Por eso manda `subidaCompleta`
 * (el `onSuccess` de tus) y nada más.
 */
export function estadoEnVuelo(input: {
  subidaCompleta: boolean;
  bytesEnviados: number;
  bytesTotales: number;
}): "subiendo" | "en-cola" {
  return input.subidaCompleta ? "en-cola" : "subiendo";
}

/**
 * Estado del vídeo tal y como lo cuenta el servidor a su dueño (`GET /api/videos/[id]`). Mismos
 * literales que el estado interno del perfil; la ruta los traduce con un `Record` total, así que un
 * caso nuevo allí rompe la compilación en vez de colarse aquí como "procesando".
 */
export type EstadoVideoSondeo =
  "procesando" | "publicado" | "demasiado-largo" | "no-disponible" | "error";

/**
 * Traduce lo que dice el servidor al estado que ve quien está esperando su subida.
 *
 * ESTA FUNCIÓN ES LA CORRECCIÓN DE UN AGUJERO REAL. Antes se sondeaba `/reproduccion`, que responde
 * 404 tanto para "sigue en la cola" como para "la codificación falló". Con una sola señal para dos
 * desenlaces opuestos, un vídeo fallido dejaba al usuario mirando "aparecerá cuando esté listo" para
 * siempre — perdiendo su participación sin enterarse, cuando todavía estaba a tiempo de reemplazarla
 * si el reto seguía abierto. Un estado que significa dos cosas acaba mintiendo sobre una de las dos.
 *
 * `no-disponible` (estuvo publicado y su objeto desapareció) se trata como fallo de codificación a
 * propósito: en el minuto siguiente a una subida es inalcanzable —exige haber estado publicado antes—
 * y para quien mira la pantalla en ese momento la acción es exactamente la misma. Se dobla porque no
 * se puede alcanzar, no por comodidad; si algún día se alcanzara, merece estado propio.
 */
export function estadoTrasSondeo(estadoVideo: EstadoVideoSondeo): EstadoSubida {
  switch (estadoVideo) {
    case "publicado":
      return "listo";
    case "procesando":
      return "en-cola";
    case "demasiado-largo":
      return "demasiado-largo";
    case "error":
    case "no-disponible":
      return "fallo-codificacion";
  }
}

/** ¿Hay que seguir preguntando? Solo mientras el desenlace no esté decidido. */
export function sondeoSigueAbierto(estado: EstadoSubida): boolean {
  return estado === "en-cola";
}

/**
 * COPY por estado, ES y EN. Fuente única: la UI no escribe literales sueltos.
 *
 * Reglas que cumple, y que el test vigila: nada de códigos crudos en pantalla (ni 403, ni PENDING, ni
 * "tus"), y ninguna promesa de plazo que no podemos sostener — la cola de codificación de Bunny no
 * nos dice cuánto va a tardar, así que no se dice "en un momento".
 *
 * EN está aquí como fuente lista para el día que haya selector de idioma; hoy la app renderiza solo
 * ES. Se define ahora porque el momento de escribir la traducción es cuando se escribe el original,
 * no seis meses después intentando recordar qué quería decir cada estado.
 */
export const COPY_SUBIDA: Record<EstadoSubida, { es: string; en: string }> = {
  preparando: {
    es: "Preparando la subida…",
    en: "Getting the upload ready…",
  },
  subiendo: {
    es: "Subiendo tu vídeo…",
    en: "Uploading your video…",
  },
  "en-cola": {
    es: "Vídeo subido y a salvo. Está en cola para prepararse; aparecerá en tu perfil cuando esté listo.",
    en: "Video uploaded and safe. It's queued for processing; it'll show up on your profile when it's ready.",
  },
  listo: {
    es: "Listo. Tu vídeo ya se puede ver.",
    en: "Done. Your video is ready to watch.",
  },
  "sin-conexion": {
    es: "No se pudo conectar para subir el vídeo. Revisa tu conexión e inténtalo de nuevo.",
    en: "Couldn't connect to upload the video. Check your connection and try again.",
  },
  // OJO con lo que NO dice: no promete reanudar. El protocolo TUS es reanudable, pero hoy el botón de
  // reintentar vuelve a pedir credencial y arranca una subida NUEVA, así que "seguirá donde lo dejó"
  // sería una promesa falsa — justo la clase de mentira que esta pieza viene a quitar. Si algún día el
  // reintento reutiliza la subida en curso, este texto se actualiza a la vez y no antes.
  corte: {
    es: "La subida se cortó a mitad. Tu conexión funciona, así que vuelve a intentarlo.",
    en: "The upload stopped partway. Your connection is fine, so give it another go.",
  },
  credencial: {
    es: "El permiso de subida ha caducado. Vuelve a pulsar Publicar para empezar de nuevo.",
    en: "The upload permission expired. Press Publish again to start over.",
  },
  rechazo: {
    es: "No se aceptó este vídeo. Prueba con otro fichero o con otro formato.",
    en: "This video wasn't accepted. Try another file or another format.",
  },
  "servidor-ocupado": {
    es: "El servicio de vídeo no está respondiendo ahora mismo. No es cosa tuya: inténtalo en unos minutos.",
    en: "The video service isn't responding right now. It's not your fault: try again in a few minutes.",
  },
  // Los dos terminales de codificación. Dicen QUÉ pasó y QUÉ hacer, y sobre todo dicen que la espera
  // se acabó: es lo que evita que alguien siga esperando a un vídeo que no va a llegar.
  "fallo-codificacion": {
    es: "Tu vídeo no se pudo preparar y no llegará a publicarse. Sube otro para participar.",
    en: "Your video couldn't be prepared and won't be published. Upload another one to take part.",
  },
  "demasiado-largo": {
    es: "Tu vídeo dura más de 90 segundos, así que no se ha publicado. Recórtalo y súbelo otra vez.",
    en: "Your video is longer than 90 seconds, so it wasn't published. Trim it and upload it again.",
  },
};

/** Copy en castellano de un estado (lo que renderiza la app hoy). */
export function copySubida(estado: EstadoSubida): string {
  return COPY_SUBIDA[estado].es;
}
