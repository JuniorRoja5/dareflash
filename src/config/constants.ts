/**
 * Constantes centralizadas de configuracion de producto/infraestructura.
 *
 * Las reglas de producto que aun no ha cerrado el propietario van aqui con un
 * comentario `// PENDIENTE`, nunca esparcidas por el codigo.
 */
import { z } from "zod";

/**
 * Limite POR DEFECTO de conexiones del pool contra MariaDB (se puede sobreescribir con la variable
 * DB_CONNECTION_LIMIT, ver env.ts, para afinar en produccion SIN recompilar la imagen).
 *
 * HISTORIA (importante, no volver a bajarlo "por si acaso"): valia 5 porque el plan COMPARTIDO de
 * Hostinger limitaba las conexiones simultaneas. Ese plan ya no existe: produccion es un VPS con su
 * propio MariaDB, cuyo `max_connections` por defecto es 151. La razon de aquel 5 se fue con el hosting.
 *
 * Y 5 era un TECHO REAL, no una precaucion barata: CADA render de una ruta del shell consulta la BD
 * (el layout resuelve la sesion + la cuenta de la barra = 2 consultas), y Next dispara MUCHAS
 * peticiones `_rsc` de prefetch a la vez al navegar. Con 5 huecos, un pico de navegacion los ocupa y
 * la siguiente peticion que necesite BD (el login, por ejemplo) ESPERA a que se libere uno.
 *
 * 15 sigue siendo conservador: web(15) + worker(15) = 30, muy por debajo de 151 (ver
 * MARIADB_MAX_CONNECTIONS_DEFECTO y el test que vigila ese margen).
 */
export const DB_CONNECTION_LIMIT_DEFECTO = 15;

/**
 * Cuanto espera una peticion a que se libere una conexion del pool antes de RENDIRSE.
 *
 * EXPLICITO a proposito: el default del driver `mariadb` es 10 000 ms, y diez segundos de espera son
 * indistinguibles de un cuelgue para quien esta mirando la pantalla ("Entrando..." parado). Con 6 s,
 * si alguna vez se agota el pool la peticion FALLA RAPIDO y con un error que sale en los logs, en vez
 * de quedarse colgada en silencio. Es un cambio de diagnostico, no solo de tiempo: un fallo visible se
 * arregla; un cuelgue silencioso se investiga a ciegas durante dias.
 *
 * INVARIANTE: debe ser MENOR que el default del driver (si no, se pierde la propiedad de "fallar
 * antes de que el usuario lo lea como un cuelgue"). Lo vigila un test.
 */
export const DB_ACQUIRE_TIMEOUT_MS = 6_000;

/** Default del driver `mariadb` para `acquireTimeout` (verificado en su pool-options.js). */
export const DB_ACQUIRE_TIMEOUT_DRIVER_DEFECTO_MS = 10_000;

/**
 * Conexiones OCIOSAS que el pool mantiene abiertas. El driver, si no se le dice nada, usa
 * `minimumIdle = connectionLimit`: abriria y mantendria las 15 aunque no se use ninguna.
 *
 * Se fija BAJO por dos motivos. Uno: el VPS es pequeno y cada conexion cuesta memoria en MariaDB.
 * Dos —y este importa para diagnosticar— asi el numero de conexiones abiertas VUELVE A SIGNIFICAR
 * ALGO: con `minimumIdle = connectionLimit`, un `SHOW PROCESSLIST` devuelve el maximo del pool tanto
 * si el sistema esta saturado como si esta dormido, y contar conexiones no distingue un caso del otro.
 * Con este valor, muchas conexiones abiertas = trabajo de verdad.
 */
export const DB_MINIMUM_IDLE = 4;

/** `max_connections` por defecto de MariaDB. El techo contra el que se mide el margen de los pools. */
export const MARIADB_MAX_CONNECTIONS_DEFECTO = 151;

/**
 * Moneda por defecto de la app. Toda la documentacion de producto esta en dolares
 * (premios "$20", VIP "$10/mes", Boost "$5"). NO se incrusta como default en el
 * esquema: la app la aplica desde aqui al crear filas con `currency`.
 * PENDIENTE: decision final del propietario (Sergio).
 */
export const DEFAULT_CURRENCY = "USD"; // PENDIENTE

/**
 * Zona horaria de TODOS los limites temporales del producto. Decidido
 * EXPLICITAMENTE: **UTC**, como el resto del sistema. Afecta al "dia" del limite
 * de boosts y al "mes" del reinicio del ranking. Fijarlo aqui evita que cada
 * implementador elija distinto y aparezcan discrepancias en los bordes del dia/mes.
 * El corte del dia es 00:00 UTC; el del mes, el dia 1 a las 00:00 UTC.
 */
export const RESET_TIMEZONE = "UTC";

/**
 * Maximo de activaciones de Boost por usuario y DIA (UTC, ver RESET_TIMEZONE).
 * Fuente: documentacion de producto ("3 apariciones destacadas por usuario al dia").
 */
export const BOOST_DAILY_LIMIT = 3;

// ============================================================================
// DECISIONES DE PRODUCTO CONFIRMADAS POR EL PROPIETARIO
// ============================================================================

/**
 * Duracion maxima de un video, en segundos. DEFINITIVO.
 * OJO deuda de contenido: las Normas Oficiales y el FAQ del documento decian 30 s;
 * ese texto legal hay que corregirlo antes del lanzamiento (no es deuda de codigo).
 * Se valida EN SERVIDOR al confirmar la subida a Bunny (nunca fiarse del cliente).
 */
export const VIDEO_MAX_DURATION_SEC = 90;

/**
 * Caducidad de la credencial de subida TUS PREFIRMADA a Bunny (segundos). Bunny compara
 * `AuthorizationExpire` contra el fin de la subida COMPLETA (401 si caduca a media subida), NO contra
 * la duracion del video: un clip de <=90 s pesa cientos de MB y una subida en conexion movil mala
 * supera de sobra los minutos. La doc oficial de Bunny recomienda EXPLICITAMENTE >= 1 h; 2 h da margen
 * para ficheros grandes en movil sin dejar la credencial viva eternamente. (Atado en tests/bunny.test.ts.)
 */
export const BUNNY_TUS_CREDENTIAL_TTL_SEC = 2 * 60 * 60;

/**
 * TTL de la URL de REPRODUCCION firmada (token-auth de la pull-zone). Holgado (2 h) aunque el video
 * dure <=90 s: cubre re-ver, seek y pausas largas sin tener que re-firmar. El token es de DIRECTORIO
 * (/{videoId}/), asi que la misma firma vale para la playlist y todos los segmentos.
 */
export const BUNNY_PLAYBACK_TTL_SEC = 2 * 60 * 60;

/**
 * Confirmacion de subida (sondeo por el worker a Bunny). El barrido revisa los Video en PENDING
 * cuyo `createdAt >= now - SONDEO_MAX_EDAD_MS`: un video de 90 s se transcodifica en segundos-minutos,
 * asi que 6 h sin llegar a Finished = atascado/abandonado -> lo hereda la reconciliacion (rama
 * siguiente), no se sondea eternamente. `CONFIRM_LOTE` acota el trabajo por vuelta.
 */
export const SONDEO_MAX_EDAD_MS = 6 * 60 * 60 * 1000; // 6 h
export const CONFIRM_LOTE = 100;
/** Cadencia ADAPTATIVA del barrido: frecuente si quedaron PENDING, en reposo si no. */
export const CONFIRM_CADENCIA_ACTIVO_MS = 15 * 1000; // 15 s
export const CONFIRM_CADENCIA_REPOSO_MS = 5 * 60 * 1000; // 5 min
/**
 * Marca de "despertar" del confirm en SystemState (event-kick). La ruta upload-credential la escribe
 * en la MISMA transaccion que crea la fila Video PENDING; el worker la lee en su tick y fuerza un
 * barrido, saltandose la espera de reposo (colapsa el arranque en frio). Fuente unica: ruta + worker.
 */
export const CONFIRM_WAKE_KEY = "confirm:wake";

/**
 * RECONCILIACION de subidas abandonadas (Parte A). Una Video en PENDING mas VIEJA que este umbral es
 * DEMOSTRABLEMENTE abandonada: pasada la caducidad de la credencial TUS, Bunny ya no acepta bytes, asi
 * que jamas va a completarse. Se le da un margen extra (15 min) sobre el TTL para no matar NUNCA una
 * subida legitima aun en curso. Las PENDING mas RECIENTES que esto son territorio del confirm.
 */
export const UMBRAL_ABANDONO_MS = BUNNY_TUS_CREDENTIAL_TTL_SEC * 1000 + 15 * 60 * 1000; // TTL + 15 min
/** Cadencia del barrido de reconciliacion: cada 10 min (red de seguridad, no latencia critica). */
export const RECON_CADENCIA_MS = 10 * 60 * 1000; // 10 min

/**
 * Limpieza de HUERFANOS en Bunny (reconciliacion Parte B, DESTRUCTIVA). Una fila FAILED debe llevar
 * >= esta gracia antes de borrar su objeto (margen por si se inspecciona). La cadencia es BAJA
 * (listar la biblioteca es pesado y los huerfanos no son urgentes). La pagina es el tope de la API.
 */
export const RECON_HUERFANOS_GRACIA_MS = 24 * 60 * 60 * 1000; // 24 h
export const RECON_HUERFANOS_PAGINA = 100; // itemsPerPage (tope de la API de Bunny)
export const RECON_HUERFANOS_CADENCIA_MS = 6 * 60 * 60 * 1000; // 6 h

/**
 * Reconciliacion Parte C: PUBLICADOS DESAPARECIDOS (integridad de datos, NO moderacion). Sonda filas
 * PUBLISHED contra Bunny (getVideo); si el objeto ya no existe (404), la degrada a FAILED/
 * OBJETO_INEXISTENTE. INCREMENTAL: cada barrido sonda como mucho LOTE_POR_CICLO filas a partir de un
 * CURSOR ROTATORIO persistido (SystemState), y al llegar al fin de la tabla reinicia el cursor
 * (round-robin de cobertura completa). Coste por ciclo FIJO sea cual sea el tamaño del catalogo.
 * Cadencia BAJA (una getVideo por fila es pesado; no es urgente). SALVAGUARDA anti-incidente: se
 * aborta el modo actuar si los candidatos superan `min(TOPE_FILAS, ceil(revisados_del_barrido*PCT))`.
 */
export const RECON_PUBLICADOS_CADENCIA_MS = 6 * 60 * 60 * 1000; // 6 h
export const RECON_PUBLICADOS_LOTE_POR_CICLO = 500; // filas sondeadas por barrido (coste fijo)
export const RECON_PUBLICADOS_TOPE_FILAS = 50; // nunca degradar mas de 50 filas en un barrido
export const RECON_PUBLICADOS_TOPE_PCT = 0.2; // ni mas del 20% de las sondeadas (lo que sea MENOR)

/**
 * BUSQUEDA (Fase 1). `BUSCAR_LIMITE`: filas por pagina (keyset). `BUSCAR_MIN_FULLTEXT`: longitud minima
 * para usar FULLTEXT (el token minimo de InnoDB es 3; por debajo, usuarios caen a prefijo indexado y
 * los retos a vacio). El RECALCULO del scoreAutoridad lo hace el WORKER en un barrido de BAJA cadencia
 * con cursor keyset rotatorio (patron de las reconciliaciones): coste FIJO por ciclo.
 */
export const BUSCAR_LIMITE = 20;
/** Tope del desplegable de SUGERENCIAS de la barra (P4): pocas por tipo, respuesta ligera. */
export const BUSCAR_SUGERENCIAS_LIMITE = 6;
export const BUSCAR_MIN_FULLTEXT = 3;
export const BUSCAR_CACHE_TTL_SEC = 45; // TTL corto de la cache Redis por (q,tipo,cursor): descarga la BD
export const RECALCULO_SCORES_CADENCIA_MS = 60 * 60 * 1000; // 1 h
export const RECALCULO_SCORES_LOTE = 500; // filas (por entidad) recalculadas por barrido

/**
 * PORTADA de reto (Fase 2). Límite de bytes de ENTRADA (seguridad del servidor: acota memoria/CPU del
 * decodificado ANTES de tocar la imagen) y lado máximo de SALIDA (encaja en un cuadro conservando el
 * aspecto; el recorte por slot lo hace el object-cover de la tarjeta). Mayor que el avatar porque una
 * portada apaisada 16:9 grande pesa más, pero sigue acotado.
 */
export const PORTADA_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const PORTADA_MAX_LADO = 1280; // px

/**
 * MINIATURA personalizada de video (Fase 2, opcional, subida por el dueño). Se procesa con el pipeline
 * compartido (modo "contener", salida JPEG porque Bunny sirve las miniaturas en JPEG) y se envía a Bunny Set
 * Thumbnail. Límite de bytes de ENTRADA (acota memoria/CPU antes de decodificar) y lado máximo de
 * SALIDA (una miniatura 16:9 no necesita más de 1280 de ancho).
 */
export const MINIATURA_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
export const MINIATURA_MAX_LADO = 1280; // px

/**
 * HANDLES RESERVADOS (fuente única) para la edición manual del username (P2). Dos motivos:
 *  1. RUTAS: un handle que choque con un segmento de la app (`/admin`, `/buscar`, `/u`…) rompería el
 *     enrutado o el perfil `/u/[username]`. Se listan las rutas de primer nivel reales + `u`.
 *  2. MARCA / impersonación: nadie debe poder hacerse pasar por la plataforma o su equipo.
 * Comparación en minúsculas (el username se almacena y valida en minúsculas).
 */
export const HANDLES_RESERVADOS = [
  // rutas / segmentos
  "admin",
  "api",
  "buscar",
  "retos",
  "perfil",
  "editar",
  "crear",
  "ranking",
  "inicio",
  "feed",
  "entrar",
  "verify",
  "unlock",
  "recuperar",
  "restablecer",
  "login",
  "register",
  "logout",
  "boost",
  "u",
  "settings",
  // marca / impersonación
  "dareflash",
  "support",
  "oficial",
  "staff",
] as const;

/** ¿El handle (ya en minúsculas o no) choca con un reservado? */
export function esHandleReservado(handle: string): boolean {
  return (HANDLES_RESERVADOS as readonly string[]).includes(handle.trim().toLowerCase());
}

/**
 * Motivo de un Video en FAILED (String tipado con Zod, no enum de Prisma; convencion del proyecto).
 * TRANSCODE_ERROR: Bunny reporto Error/UploadFailed. TOO_LONG: transcodifico bien pero supera 90 s.
 * UPLOAD_INCOMPLETE: la subida no llego a completarse (credencial caducada sin Finished, u objeto
 * inexistente en Bunny) -> lo resuelve la reconciliacion de subidas abandonadas.
 * OBJETO_INEXISTENTE: estuvo PUBLISHED pero su objeto en Bunny desaparecio (404) -> lo degrada la
 * reconciliacion Parte C. Distinto de un fallo de proceso: SI llego a publicarse.
 */
export const VideoFailureReasonSchema = z.enum([
  "TRANSCODE_ERROR",
  "TOO_LONG",
  "UPLOAD_INCOMPLETE",
  "OBJETO_INEXISTENTE",
]);
export type VideoFailureReason = z.infer<typeof VideoFailureReasonSchema>;

/** Idiomas de lanzamiento. Solo estos dos. */
export const LAUNCH_LOCALES = ["en", "es"] as const;
export type Locale = (typeof LAUNCH_LOCALES)[number];

/**
 * Puntos por accion (sistema DareUp). Los puntos suben de nivel y dan fama; NO son
 * dinero ni se canjean por dinero (Terminos y Condiciones, punto 8; implementado como
 * ledgers separados que no se convierten entre si). Valores del documento maestro,
 * con "invitar a un amigo que se registra" = +50 por decision del propietario (el
 * documento proponia +10). El resto de la tabla queda como el documento.
 */
export const POINTS = {
  WIN_CHALLENGE: 30,
  INVITE_FRIEND: 50,
  REGISTER_FROM_VIDEO_LINK: 10,
  TOP20: 10,
  VIDEO_100_EXTERNAL_VIEWS: 10,
} as const;

/**
 * Las 14 categorias de reto (documento maestro; sin "Deportes"). `key` es el
 * identificador ESTABLE que se guarda en Challenge.category; `emoji` y `es` son
 * presentacion. Las etiquetas en ingles llegan con el multiidioma (Fase 11).
 */
export const CATEGORIES = [
  { key: "humor", emoji: "🎭", es: "Humor" },
  { key: "fitness", emoji: "🏋️", es: "Fitness" },
  { key: "musica", emoji: "🎵", es: "Música" },
  { key: "baile", emoji: "💃", es: "Baile" },
  { key: "gaming", emoji: "🎮", es: "Gaming" },
  { key: "lifestyle", emoji: "🌍", es: "Lifestyle" },
  { key: "street", emoji: "🛹", es: "Street" },
  { key: "arte", emoji: "🎨", es: "Arte" },
  { key: "viajes", emoji: "✈️", es: "Viajes" },
  { key: "talento", emoji: "🌟", es: "Talento" },
  { key: "tecnologia", emoji: "💻", es: "Tecnología" },
  { key: "moda", emoji: "👗", es: "Moda" },
  { key: "motivacion", emoji: "🔥", es: "Motivación" },
  { key: "retos", emoji: "⚡", es: "Retos" },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];

// ============================================================================
// AUTENTICACION / EMAIL (Paso 6)
// ============================================================================

/**
 * Semaforo de Argon2id (medido en el VPS: 1 vCPU AMD EPYC, ~178 ms/hash a p=1, sin swap). En 1
 * nucleo el threadpool de libuv ya limita a ~4 hashes en vuelo, asi que la MEMORIA ya esta
 * acotada (~270 MB). Estos valores acotan LA ESPERA, no la memoria: mas de 4 plazas no aporta;
 * esperar mas de ~2 s por un login es peor que un 503 claro. Ver src/server/auth/password.ts.
 */
export const ARGON2_MAX_CONCURRENT = 4;
export const ARGON2_MAX_WAIT_MS = 2000;

/** Edad minima para registrarse. Se valida EN SERVIDOR. */
export const MIN_AGE_YEARS = 16;

/** Caducidad del token de verificacion de email. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Caducidad del enlace de DESBLOQUEO de cuenta por correo (Opcion 3). ACOPLADA con la cadencia del
 * correo (`RATE_LIMITS.UNLOCK_EMAIL_PER_ACCOUNT`, 1/hora): la caducidad (2 h) DEBE ser mayor que la
 * cadencia (1 h) CON MARGEN, para que SIEMPRE haya un enlace valido esperando al dueño. Si fueran
 * iguales o al reves, habria huecos sin ningun enlace vigente (el correo lo dispara el ATACANTE con
 * su trafico, no el dueño) y el dueño se quedaria fuera — el fallo mismo que el diseño evita. NO
 * toques una sin la otra.
 */
export const LOGIN_UNLOCK_TTL_MS = 2 * 60 * 60 * 1000; // 2 h (ver acoplamiento arriba)

/**
 * Caducidad del enlace de RESTABLECER contrasena ("olvide mi contrasena"). CORTA A PROPOSITO: un
 * enlace de reset filtrado da control TOTAL de la cuenta (fija una contrasena nueva y revoca las
 * demas sesiones), muy por encima del de desbloqueo (LOGIN_UNLOCK, 2 h, que solo libera un cubo de
 * rate-limit). A diferencia de aquel, NO hay acoplamiento con ninguna cadencia: aqui el correo lo
 * dispara el DUENO desde /recuperar (no un atacante con su trafico), asi que no hace falta "que
 * siempre haya un enlace vivo esperando". 30 min basta de sobra para abrir el correo y elegir una
 * contrasena, y minimiza la ventana en la que un enlace filtrado sigue siendo util.
 */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 min

/**
 * GRACIA antes de que un reto borrado por el admin desaparezca del todo. Durante este plazo el reto ya
 * NO se ve en publico, pero sigue en el panel con su cuenta atras y se puede RESTAURAR: es la red
 * contra el borrado por error y contra las consecuencias de destruir algo que habia que conservar. El
 * admin puede FORZAR el borrado inmediato si sabe lo que hace.
 */
export const RETO_GRACIA_BORRADO_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
/** Cadencia del barrido que consuma los borrados vencidos. No es urgente: una vez por hora sobra. */
export const RETO_BORRADO_CADENCIA_MS = 60 * 60 * 1000; // 1 h

/**
 * Caducidad de sesion. DOS plazos, y hacen falta los dos:
 *
 *  - ABSOLUTO (`SESSION_TTL_MS`): desde que se inicia sesion, pase lo que pase. Acota cuanto vale un
 *    token robado aunque el ladron lo use a diario.
 *  - INACTIVIDAD (`SESSION_IDLE_MS`): desde el ultimo uso. Es el que faltaba, y es el que cubre el
 *    caso real: una sesion abierta en un ordenador ajeno o en un movil perdido seguia valiendo un mes
 *    aunque NADIE la tocara. Con el, se cierra sola.
 *
 * Y el plazo del ADMIN es mucho mas corto: su sesion abre el panel entero (moderar, retirar, crear
 * retos). Un mes de sesion de administrador es un riesgo de otra categoria que un mes de sesion de
 * espectador. La opcion de TTL por rol ya existia en `crearSesion`; hasta ahora no se usaba.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias (USER)
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias sin usarla (USER)
export const SESSION_TTL_ELEVADO_MS = 24 * 60 * 60 * 1000; // 24 h (ADMIN / MODERATOR)
export const SESSION_IDLE_ELEVADO_MS = 2 * 60 * 60 * 1000; // 2 h sin usarla (ADMIN / MODERATOR)

/**
 * Cada cuanto, COMO MUCHO, se reescribe `lastSeenAt`. Sin este freno, cada peticion —y una sola
 * pantalla dispara varias— haria un UPDATE sobre la fila de sesion: multiplicaria las escrituras y
 * pondria todas las peticiones de un usuario a competir por la misma fila. Con 5 min, el coste es
 * despreciable y la precision de la inactividad sigue siendo de minutos, que es lo que importa.
 */
export const SESION_REFRESCO_MIN_MS = 5 * 60 * 1000; // 5 min

/** Plazos que le tocan a un rol. Fuente UNICA: ni la creacion ni la validacion los eligen por su cuenta. */
export function plazosSesion(rol: string): { ttlMs: number; idleMs: number } {
  return rol === "ADMIN" || rol === "MODERATOR"
    ? { ttlMs: SESSION_TTL_ELEVADO_MS, idleMs: SESSION_IDLE_ELEVADO_MS }
    : { ttlMs: SESSION_TTL_MS, idleMs: SESSION_IDLE_MS };
}

/**
 * TTL de sesion POR ROL. El radio de dano de un token robado escala con el rol: un
 * ADMIN aprueba retiradas de dinero -> ventana minima. Al cambiar el rol de un
 * usuario se revocan sus sesiones (account.changeRole), asi que la nueva sesion coge
 * el TTL correcto.
 */
export const SESSION_TTL_BY_ROLE = {
  USER: 30 * 24 * 60 * 60 * 1000, // 30 dias
  MODERATOR: 24 * 60 * 60 * 1000, // 24 h
  ADMIN: 8 * 60 * 60 * 1000, // 8 h (≈ jornada)
} as const;

/** Tope de sesiones concurrentes por usuario (se borra la mas antigua al superarlo). */
export const SESSION_MAX_PER_USER = 10;

/** Nombre de la cookie de sesion. */
export const SESSION_COOKIE = "df_session";

/** Bytes de aleatoriedad del token de sesion (256 bits). */
export const SESSION_TOKEN_BYTES = 32;

/**
 * Maximo de correos que la cola envia por ejecucion. El SMTP de hosting compartido
 * suele limitar envios por hora; la cola respeta este ritmo, no vacia el lote de
 * golpe. Ajustable segun el limite real de Hostinger.
 */
export const EMAIL_MAX_PER_QUEUE_RUN = 20;

/**
 * Limites de rate limiting (ventana fija). Se aplican en login, registro y reenvio
 * de verificacion, POR IP y POR direccion, como defensa antifraude/antiabuso.
 */
// ============================================================================
// PURGAS Y AVISOS DEL WORKER (mantenimiento cableado en el bucle del worker)
// ============================================================================

/**
 * RateLimit: se borran las ventanas ya CERRADAS con holgura (windowStart < now - esto). Se
 * conserva todo lo mas reciente para NO tocar ni la ventana EN CURSO ni la inmediatamente
 * anterior: una peticion en vuelo podria estar incrementandola, y borrarla RESETEARIA el
 * limite. 2 h > la ventana mas larga que usamos (1 h: registro/reenvio), asi cubre "en curso
 * + anterior" con margen.
 */
export const RATE_LIMIT_PURGE_RETENER_MS = 2 * 60 * 60 * 1000; // 2 h

/** Jobs DONE: dias que se conservan antes de purgarlos. */
export const JOB_DONE_RETENTION_DAYS = 7;

/**
 * Jobs FAILED: dias que se conservan antes de purgarlos. Largo A PROPOSITO: un FAILED es la
 * señal de que algo fue mal (a quien afecto, por que) y se conserva para diagnostico. NUNCA
 * borrado silencioso antes de plazo.
 */
export const JOB_FAILED_RETENTION_DAYS = 90;

/**
 * RETENCION de la IP HASHEADA de un voto (`Vote.ipHash`). Pasado este plazo se pone a NULL.
 *
 * FUENTE UNICA del plazo: el esquema lo documenta ("retencion de 90 dias") y el barrido lo lee de
 * aqui. Antes el numero solo existia en un comentario y no habia nada que lo aplicara: una promesa
 * escrita que el codigo no cumplia.
 *
 * SE BORRA LA IP, NO EL VOTO: la fila sobrevive —es el voto de alguien, cuenta para el reto— y lo
 * unico que caduca es el dato PERSONAL. El ipHash sirve para detectar fraude reciente ("un video con
 * >30% de votos desde IPs similares"); pasados 90 dias ese analisis ya no se hace y guardarlo solo
 * seria acumular datos personales sin proposito.
 */
export const VOTO_IPHASH_RETENCION_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias

/**
 * GATE DE "VISTO" — segundos de REPRODUCCION antes de que el reproductor marque la participacion
 * como vista. FUENTE UNICA: la usan el reproductor (que cuenta) y la documentacion del endpoint.
 *
 * PEQUENO A PROPOSITO. Es FRICCION, no una garantia: el servidor no puede comprobar que el video se
 * haya reproducido de verdad —la marca la pide el cliente y es SPOOFEABLE—. Sirve para que votar
 * exija al menos abrir el video, no para impedir el fraude; contra eso esta el pago manual. Subirlo
 * castigaria al usuario honrado sin estorbar a quien falsifica la llamada.
 */
export const VISTO_SEGUNDOS_MINIMOS = 3;

/**
 * Cuanto vive la marca de "visto". GENEROSO: el flujo natural es ver y votar seguido, pero alguien
 * puede ver varios videos y volver a votar despues, o abrir el modal, distraerse y volver. Media hora
 * cubre eso de sobra sin que la marca sea eterna.
 */
export const VISTO_TTL_SEC = 30 * 60; // 30 min

/**
 * Copy del rechazo cuando se vota sin haber visto el video. Se fija AQUI porque lo emite el servidor
 * (convencion de la API: `error.message` ya trae copy humano) y lo consumira la ruta de voto.
 */
export const MSG_VOTO_SIN_VER = "Reproduce este vídeo para poder votarlo.";

/**
 * Vídeo de fondo en bucle de la HOME, servido por la CDN de assets de Bunny.
 *
 * Es una CONSTANTE y no una variable de entorno a proposito: el asset es PUBLICO (sin Token Auth), asi
 * que no hay nada que ocultar, y `env.ts` valida de forma perezosa pero el build de produccion corre
 * SIN variables — promoverla a env obligatoria seria meter una URL publica en el camino que tumba el
 * despliegue si falta. Fuente UNICA: nadie la escribe en un JSX.
 */
/**
 * Copy del bloqueo por MODERACION al intentar participar. Dice la verdad —ahora solo se bloquea si un
 * moderador retiro la participacion— y por eso NOMBRA al moderador: antes decia "fue retirada" a secas
 * y se le soltaba tambien a quien simplemente habia borrado su propio video, que no habia hecho nada.
 */
export const MSG_PARTICIPACION_BLOQUEADA =
  "Un moderador retiro tu participacion en este reto, asi que no puedes volver a participar.";

export const VIDEO_FONDO_HOME = "https://dareflash-assets.b-cdn.net/fondo-home.mp4";

/**
 * Copy de los rechazos de la ruta de voto. Aqui, y no dentro de la ruta, por la misma razon que el de
 * arriba: el servidor emite copy humano ya listo (`error.message`), nunca un codigo crudo, y la Pieza 3
 * lo pinta tal cual sin traducir nada.
 *
 * `MSG_NO_DISPONIBLE` es DELIBERADAMENTE COMPARTIDO por "no existe" y "no esta publicada", y por TODAS
 * las rutas que hablan de una participacion (voto y visto). Es un invariante de seguridad, no estilo:
 * dos textos distintos —o dos `code` distintos— convertirian la respuesta en un oraculo con el que
 * enumerar que participaciones existen pero estan ocultas o retiradas. Por eso vive en un solo sitio:
 * separado en dos literales, alguien "mejoraria" uno y abriria el oraculo sin enterarse.
 */
export const MSG_NO_DISPONIBLE = "Vídeo no disponible.";
export const MSG_VOTO_AUTOVOTO = "No puedes votar tu propia participación.";
export const MSG_VOTO_RETO_CERRADO = "Este reto ya no admite votos.";
export const MSG_VOTO_SIN_VOTO = "No tienes ningún voto puesto aquí.";
/** No es un error: es la pregunta que la Pieza 3 le hara al usuario para pedirle consentimiento. */
export const MSG_VOTO_YA_VOTO_OTRA = "Ya has votado otra participación de este reto.";

/**
 * Umbral de AVISO al admin por acumulacion de jobs FAILED. Al CRUZARLO (hacia arriba) el
 * worker envia UN aviso —directo por SMTP, fuera de la cola— y calla hasta que el contador
 * baje del umbral y lo cruce de nuevo. Configurable aqui, no incrustado en el codigo.
 */
export const JOB_FAILED_ALERT_THRESHOLD = 10;

export const RATE_LIMITS = {
  // OJO: 10/15min se queda CORTO con CGNAT movil u oficinas (muchos usuarios tras una
  // misma IP publica). Revisar con trafico real; puede subirse sin tocar la seguridad
  // del limite por cuenta.
  LOGIN_PER_IP: { limit: 10, windowMs: 15 * 60 * 1000 }, // 10 / 15 min por IP
  // Por CUENTA: frena el relleno de credenciales DISTRIBUIDO (muchas IPs, una cuenta),
  // que el limite por IP no ve. Consumo atomico + reset al acertar, asi que un usuario
  // legitimo no acumula; 20 tolera erratas sin facilitar el bloqueo de una cuenta ajena.
  LOGIN_PER_ACCOUNT: { limit: 20, windowMs: 15 * 60 * 1000 }, // 20 fallos / 15 min por cuenta
  REGISTER_PER_IP: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 / hora
  // Tope POR DIRECCION: frena el bombardeo del buzon de una victima con correos de verificacion
  // desde muchas IPs (botnet / IPv6). 3 / hora basta para un alta legitima (+ reintento) sin permitir
  // el bombing; lo calca de FORGOT_PASSWORD_PER_EMAIL.
  REGISTER_PER_EMAIL: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3 / hora por direccion
  RESEND_VERIFICATION_PER_EMAIL: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3 / hora
  RESEND_VERIFICATION_PER_IP: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 / hora
  // Cambio de contrasena (sesion ya autenticada): verifica la contrasena ACTUAL con
  // argon2. Umbral BAJO: un usuario legitimo casi nunca falla su contrasena actual, y
  // asi se corta tanto el adivinado (quien roba una sesion) como la amplificacion de
  // CPU (cada intento es un argon2). Consumo atomico + reset al acertar.
  CHANGE_PASSWORD_PER_USER: { limit: 5, windowMs: 15 * 60 * 1000 }, // 5 fallos / 15 min por usuario
  // Correo de DESBLOQUEO de cuenta (Opcion 3): UN correo por VENTANA de bloqueo por cuenta (1/hora),
  // no uno por intento -> el atacante no puede usarlo para inundar el buzon de la victima. ACOPLADO
  // con LOGIN_UNLOCK_TTL_MS (caducidad 2 h > cadencia 1 h, ver alli). El tope por IP evita que
  // alguien dispare correos de desbloqueo hacia MUCHAS cuentas distintas desde una sola IP.
  UNLOCK_EMAIL_PER_ACCOUNT: { limit: 1, windowMs: 60 * 60 * 1000 }, // 1 / hora por cuenta
  UNLOCK_EMAIL_PER_IP: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 / hora por IP
  // Correo de RESTABLECER contrasena ("olvide mi contrasena"). Mismos numeros que el reenvio de
  // verificacion: los dos MANDAN un correo a una direccion, asi que el abuso a acotar es identico
  // (usar el envio para acosar un buzon o quemar la cuota SMTP). Por DIRECCION frena el bombardeo de
  // una victima; por IP frena disparar resets hacia MUCHAS direcciones desde una sola IP.
  FORGOT_PASSWORD_PER_EMAIL: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3 / hora por direccion
  FORGOT_PASSWORD_PER_IP: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 / hora por IP
  // Crear objeto de video en Bunny (credencial de subida). Cada peticion crea un objeto en Bunny
  // (coste + posible huerfano si se abandona): por USUARIO autenticado, acota la creacion en masa.
  CREATE_VIDEO_PER_USER: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 / hora por usuario
  // Editar el nombre del propio perfil (sesion autenticada). Barato (un UPDATE), pero se acota para
  // que nadie use el guardado como amplificador de escrituras; holgado para no molestar al legitimo.
  UPDATE_PROFILE_PER_USER: { limit: 20, windowMs: 15 * 60 * 1000 }, // 20 / 15 min por usuario
  // Subir avatar: DECODIFICA y RECOMPRIME una imagen (CPU + memoria). Cubo por USUARIO mas estrecho,
  // para que nadie funda el VPS a base de subir imagenes de 5 MB en bucle.
  UPLOAD_AVATAR_PER_USER: { limit: 10, windowMs: 15 * 60 * 1000 }, // 10 / 15 min por usuario
  // Miniatura de video (dueño): decodifica y recomprime una imagen (CPU + memoria) y llama a Bunny.
  // Mismo trato que el avatar; por usuario.
  UPLOAD_THUMBNAIL_PER_USER: { limit: 15, windowMs: 15 * 60 * 1000 }, // 15 / 15 min por usuario
  // Marca de "visto": la dispara el reproductor, asi que un usuario que baja por el feed la llama
  // MUCHAS veces de forma legitima. El cubo es GENEROSO a proposito —no es una accion con efectos,
  // solo una marca efimera—; existe para que nadie martillee el endpoint, no para racionar el uso.
  VISTO_PER_USER: { limit: 200, windowMs: 15 * 60 * 1000 }, // 200 / 15 min por usuario
  // Votar: el modelo es UN voto por reto, asi que el uso legitimo es bajo (votar, quiza mover una o
  // dos veces mientras se decide, quiza quitarlo). Mas ajustado que el de "visto" porque aqui SI hay
  // efectos: mueve contadores. No pretende frenar el fraude —eso es el gate, el no-autovoto y el
  // unique de la BD—, sino que nadie martillee el endpoint.
  VOTO_PER_USER: { limit: 60, windowMs: 15 * 60 * 1000 }, // 60 / 15 min por usuario
  // Crear reto (admin): el procesado de la portada cuesta CPU/memoria -> mismo trato que el avatar.
  CREAR_RETO_PER_USER: { limit: 20, windowMs: 15 * 60 * 1000 }, // 20 / 15 min por usuario
  // Editar reto (admin): puede traer una portada nueva (mismo coste de decodificado/recompresión que
  // crear), así que se acota igual. Cubo por usuario independiente del de crear.
  EDITAR_RETO_PER_USER: { limit: 30, windowMs: 15 * 60 * 1000 }, // 30 / 15 min por usuario
  // Busqueda (publica, sin sesion): acota abuso/scraping por IP. Holgado para un buscador con debounce
  // (varias pulsaciones por consulta); la cache de Redis absorbe ademas las consultas calientes.
  BUSCAR_PER_IP: { limit: 60, windowMs: 60 * 1000 }, // 60 / min por IP
} as const;

// ============================================================================
// ESTADOS/TIPOS que en la BD son String (flexibles, sin migracion por estado
// nuevo) pero tipados y validados con Zod aqui. La capa de servicio valida con
// estos esquemas ANTES de insertar, para que un valor mal escrito (p.ej.
// "PENDNIG" en WalletLedger.status = dinero en un estado inexistente) no entre
// nunca en la base de datos.
// ============================================================================

/** Estado de los movimientos de monedero (dinero). */
export const WalletStatusSchema = z.enum(["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED"]);
export type WalletStatus = z.infer<typeof WalletStatusSchema>;

/** Tipo de movimiento de monedero. */
export const WalletEntryTypeSchema = z.enum(["CREDIT", "DEBIT"]);
export type WalletEntryType = z.infer<typeof WalletEntryTypeSchema>;

/** Ciclo de vida de un reto. */
export const ChallengeStatusSchema = z.enum(["DRAFT", "PUBLISHED", "CLOSED"]);
export type ChallengeStatus = z.infer<typeof ChallengeStatusSchema>;

/** Razon de un movimiento de creditos de Boost. */
export const BoostReasonSchema = z.enum([
  "PURCHASE",
  "VIP_WEEKLY",
  "ACTIVATION",
  "REFUND",
  "ADMIN_ADJUST",
]);
export type BoostReason = z.infer<typeof BoostReasonSchema>;

/** Estado de una denuncia. */
export const ReportStatusSchema = z.enum(["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

/** Tipo de entidad denunciada. COMMENT llega con los comentarios (Fase 1). */
export const ReportTargetTypeSchema = z.enum(["VIDEO", "SUBMISSION", "USER", "COMMENT"]);
export type ReportTargetType = z.infer<typeof ReportTargetTypeSchema>;

/** Estado de un job de la cola. */
export const JobStatusSchema = z.enum(["PENDING", "RUNNING", "DONE", "FAILED"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** Tipos de job previstos. */
export const JobTypeSchema = z.enum([
  "BOOST_EXPIRY",
  "CHALLENGE_CLOSE",
  "RANKING_RESET",
  "SEND_EMAIL",
  "LEDGER_RECONCILE",
  // Aqui habia un "RETENTION_PURGE" que NUNCA existio: ni handler, ni cadencia, ni llamante. Se
  // retira porque la retencion YA es real y NO es un job de cola: es un BARRIDO recurrente del
  // worker, como la poda de Job, la de RateLimit y la de sesiones caducadas (ver `bucleWorker`).
  // Dejar el tipo aqui volveria a sugerir una proteccion inexistente, que es justo lo que fallaba.
  "PAYOUT_PROCESS",
  // Borrado del objeto en Bunny cuando el DUEÑO borra su video. Va por la COLA (no inline) para no
  // dejar el objeto huerfano si Bunny falla: idempotente (404 = ya no existe = exito) y reintentable.
  "BUNNY_DELETE_VIDEO",
]);
export type JobType = z.infer<typeof JobTypeSchema>;

/**
 * Proposito de un VerificationToken. El token de verificacion de alta y el de desbloqueo de
 * cuenta comparten el MISMO mecanismo (un solo uso, hash en BD, caducidad, sin enumeracion) pero
 * NO son intercambiables: el proposito se comprueba DENTRO del WHERE al consumir (ver
 * `src/server/auth/email-token.ts`), asi que un token de un proposito no vale para el otro.
 */
export const VerificationPurposeSchema = z.enum([
  "EMAIL_VERIFY",
  "LOGIN_UNLOCK",
  "PASSWORD_RESET",
  // Confirmar una direccion NUEVA antes de aplicarla. Proposito PROPIO: un token de verificacion de
  // alta no puede servir para cambiar el correo de una cuenta, ni al reves.
  "EMAIL_CHANGE",
]);
export type VerificationPurpose = z.infer<typeof VerificationPurposeSchema>;
