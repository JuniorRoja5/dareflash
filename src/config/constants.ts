/**
 * Constantes centralizadas de configuracion de producto/infraestructura.
 *
 * Las reglas de producto que aun no ha cerrado el propietario van aqui con un
 * comentario `// PENDIENTE`, nunca esparcidas por el codigo.
 */
import { z } from "zod";

import {
  formatearFecha,
  horaDelReinicioDiario,
  type Idioma,
  ZONA_MADRID,
  type ZonaHoraria,
} from "@/lib/formato";

/**
 * Limite POR DEFECTO de conexiones del pool contra MariaDB (se puede sobreescribir con la variable
 * DB_CONNECTION_LIMIT, ver env.ts, para afinar en produccion SIN recompilar la imagen).
 *
 * HISTORIA (importante, no volver a bajarlo "por si acaso"): valia 5 porque el hosting COMPARTIDO de
 * entonces limitaba las conexiones simultaneas. Ese plan ya no existe: hoy produccion tiene su propio
 * MariaDB, cuyo `max_connections` por defecto es 151. La razon de aquel 5 se fue con aquel hosting.
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
 *
 * CONFIRMADA (Sergio, 2026-10-07): USD se mantiene. Dejo de estar PENDIENTE al llegar el cobro de
 * Boost — una moneda sin decidir se puede tolerar mientras no se cobra, no cuando ya se cobra.
 */
export const DEFAULT_CURRENCY = "USD";

// ============================================================================
// RETIRADAS (Fase 7) — sacar el dinero del monedero
// ============================================================================

/**
 * MINIMO PARA PEDIR UN COBRO, en centimos.
 *
 * ┌─ PENDIENTE DE SERGIO: EL NUMERO NO ESTA DECIDIDO ─────────────────────────────────────────────┐
 * │ Arranca en 50 $ como ARRANQUE, no como decision. Un minimo existe por una razon concreta: la  │
 * │ comision de red o de banco es casi fija, asi que por debajo de cierto importe se come una     │
 * │ parte indecente de lo que cobra la persona — pedir 3 $ y recibir 1,50 $ es una mala           │
 * │ experiencia que ademas parece un timo. El numero sale de lo que cueste la via de pago real.   │
 * │ Cambiarlo es UNA linea; lo que no se puede es no tenerlo.                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const RETIRADA_MINIMA_CENTS = 5000;

/** Como quiere cobrar. Union CERRADA: cada valor tiene su formulario y su validacion. */
export const MetodoRetiradaSchema = z.enum(["BANK", "CRYPTO"]);
export type MetodoRetirada = z.infer<typeof MetodoRetiradaSchema>;

/**
 * LAS REDES QUE DAREFLASH ENVIA, y solo esas. No es una preferencia: un envio de cripto es
 * IRREVERSIBLE, y una direccion de una red que no enviamos es dinero perdido sin vuelta atras. Por
 * eso la persona se adapta a esta lista y no al reves, y por eso la lista es cerrada aqui y no un
 * texto libre en un formulario.
 */
export const RedCriptoSchema = z.enum(["TRC20", "ERC20"]);
export type RedCripto = z.infer<typeof RedCriptoSchema>;

/** El catalogo que pinta el desplegable: la red, su nombre humano y las monedas que van por ella. */
export const REDES_CRIPTO = [
  { red: "TRC20", nombre: "TRON (TRC-20)", monedas: "USDC · USDT" },
  { red: "ERC20", nombre: "Ethereum (ERC-20)", monedas: "USDC · USDT" },
] as const;

/**
 * Copy de la retirada. Humano, y sin un solo codigo de error dentro.
 *
 * CON TILDES: esto lo LEE una persona, no es un comentario. Nacieron sin ellas —por el habito de
 * escribir sin acentos en los comentarios de este fichero— y se colaban asi a la pantalla; el resto
 * del copy de aqui (`MSG_BOOST_PAGO_NO_DISPONIBLE`) siempre las llevo.
 */
export const MSG_RETIRADA_SIN_MINIMO =
  "Todavía no llegas al mínimo para pedir un cobro. Sigue participando: el saldo se acumula.";
export const MSG_RETIRADA_SIN_SALDO = "No tienes saldo suficiente para pedir ese importe.";
export const MSG_RETIRADA_NO_DISPONIBLE =
  "Ahora mismo no podemos aceptar datos de cobro. Vuelve a intentarlo en un rato.";

/**
 * TOPE de un ajuste manual de saldo del monedero, en centimos (1.000 $).
 *
 * No es una regla de producto: es un pasamanos. El ajuste existe para corregir y para probar, y un
 * cero de mas tecleado en un campo de dinero es el tipo de error que no avisa — el saldo sube, nada
 * falla, y se entera quien lo cobre. Lo que no cabe en el tope se hace en varios ajustes, cada uno
 * con su motivo, que ademas deja mejor traza que uno enorme.
 */
export const AJUSTE_SALDO_CENTS_MAX = 100_000;

/** El `refType` de un movimiento de monedero escrito por un ADMIN a mano. Ver `monedero-admin`. */
export const REF_WALLET_AJUSTE_ADMIN = "ADMIN";

/**
 * QUE FUE CADA MOVIMIENTO DEL MONEDERO, dicho para su dueño. La clave sale de `refType`, y la frase
 * de aqui: la fila guarda el HECHO y el copy lo traduce, asi que reescribir esta frase reescribe
 * tambien los movimientos antiguos en vez de congelarlos (mismo patron que `nivelMinimo`).
 *
 * EL AJUSTE DEL ADMIN SE LLAMA POR SU NOMBRE. Disfrazarlo de premio seria mentir en el historial de
 * dinero de una persona; y al reves —no enseñarlo— deja un saldo que cambia solo. Lo que NO entra
 * aqui es el MOTIVO que escribio el admin ni QUIEN lo firmo: eso es traza interna y vive en el
 * `AuditLog` (ver la nota del ajuste de puntos, misma disciplina).
 */
export const CONCEPTO_MOVIMIENTO: Record<string, string> = {
  PRIZE: "Premio de un reto",
  WITHDRAWAL: "Cobro solicitado",
  WITHDRAWAL_REFUND: "Cobro devuelto",
  ADMIN: "Ajuste del equipo",
};

/** Lo que se dice de un movimiento cuyo `refType` ya no esta en el catalogo. Honesto, no un hueco. */
export const CONCEPTO_MOVIMIENTO_OTRO = "Movimiento";

/**
 * POR QUE SE RECHAZO UN COBRO. Lista CERRADA, y esa es la decision.
 *
 * ┌─ POR QUE NO ES TEXTO LIBRE ───────────────────────────────────────────────────────────────────┐
 * │ Este motivo lo lee la persona a la que le acabas de rechazar su dinero. Un campo libre acaba, │
 * │ un martes con prisa, en un "datos mal" o un "rechazado" — y eso es lo que lee alguien que      │
 * │ esperaba 50 $. Una lista cerrada garantiza una frase limpia, clara y consistente, y encima    │
 * │ dice QUE HACER. El coste es definir la lista; el que gana es quien recibe el mensaje.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SE GUARDA LA CLAVE, NO LA FRASE (mismo patron que `Challenge.nivelMinimo`): reescribir el texto
 * para que se entienda mejor reescribe tambien los rechazos antiguos, en vez de congelarlos en la
 * redaccion vieja. Y `OTRO` guarda su texto en SU PROPIA columna, nunca con un prefijo dentro de
 * esta: un prefijo es una convencion que el dia que alguien no respete deja un garabato de clave
 * como mensaje.
 */
export const MotivoRechazoSchema = z.enum([
  "RED_INCORRECTA",
  "DATOS_BANCARIOS",
  "CUENTA_NO_VERIFICADA",
  "SOSPECHA_FRAUDE",
  "OTRO",
]);
export type MotivoRechazo = z.infer<typeof MotivoRechazoSchema>;

/** La clave que exige, ademas, un texto escrito a mano. La unica. */
export const MOTIVO_RECHAZO_LIBRE: MotivoRechazo = "OTRO";

/**
 * QUE SE LE DICE A LA PERSONA por cada motivo. Dos frases: la razon y, cuando la hay, QUE HACER —
 * un rechazo que no dice como arreglarlo solo cambia la frustracion de sitio.
 *
 * El texto del admin NO entra aqui: estas son las frases de la lista cerrada. `OTRO` tiene la suya
 * como respaldo, pero cuando hay texto escrito se enseña el texto (ver `fraseDeRechazo`).
 */
export const FRASE_RECHAZO: Record<MotivoRechazo, string> = {
  RED_INCORRECTA:
    "La dirección que nos diste no es de la red indicada. Revísala y guarda el método otra vez antes de volver a pedirlo.",
  DATOS_BANCARIOS:
    "No pudimos completar la transferencia con esos datos bancarios. Comprueba el IBAN y el titular, y guarda el método otra vez.",
  CUENTA_NO_VERIFICADA:
    "Necesitamos verificar tu cuenta antes de enviarte dinero. Escríbenos y te decimos qué hace falta.",
  SOSPECHA_FRAUDE:
    "Hemos parado este cobro mientras revisamos la actividad de la cuenta. Escríbenos y lo vemos contigo.",
  OTRO: "No hemos podido completar este cobro.",
};

/**
 * Lo que se dice de un rechazo cuya clave ya NO existe en la lista (una renombrada sin migrar, o una
 * fila de antes de que esto existiera). FAIL-OPEN a proposito: un hueco en la pantalla de alguien
 * que no cobro es peor que una frase generica, y reventar seria peor todavia.
 */
export const FRASE_RECHAZO_DESCONOCIDO = "No hemos podido completar este cobro.";

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

/**
 * Cuanto dura una aparicion destacada, en MINUTOS.
 *
 * El esquema de `BoostActivation` lo dejaba en "~1h", que es una nota para nosotros y no un numero:
 * mientras no existio la activacion, la pantalla de /boosts NO decia la duracion a proposito (una
 * cifra inventada en una pantalla es una promesa de producto que nadie ha tomado). Al construir la
 * activacion hay que decidirlo, y queda aqui: de aqui sale el `expiresAt` que se escribe Y el texto
 * que se lee. Dos sitios serian prometer una duracion y aplicar otra.
 */
export const BOOST_DURACION_MIN = 60;

/** Razon y referencia del movimiento de ledger al GASTAR un boost. Union en `BoostReasonSchema`. */
export const RAZON_BOOST_ACTIVACION = "ACTIVATION";
export const REF_BOOST_ACTIVACION = "BOOST_ACTIVATION";

/**
 * Cuantos perfiles caben en el espacio destacado de la portada. El 6o y siguientes NO se pintan ahi:
 * se veran en la seccion "Perfiles Boost" (Pieza 4). No es un limite del producto, es el ancho de
 * una fila.
 */
export const BOOST_DESTACADOS_PORTADA = 5;

/**
 * TOPE de perfiles que devuelve la consulta de destacados de una sola vez. Lo usa la seccion
 * completa (/destacados), y es tambien el techo que `destacadosVigentes` aplica a cualquier limite
 * que le pidan.
 *
 * NO ES UNA REGLA DE PRODUCTO, ES UN FRENO: hoy no puede haber tantos destacados a la vez (una
 * aparicion dura BOOST_DURACION_MIN y cada persona ocupa UNA plaza), asi que la seccion entra de
 * sobra en una sola pagina. El dia que este numero empiece a quedarse corto, lo que toca es paginar
 * por KEYSET —como el resto del producto—, no subirlo: una lista sin tope es una consulta que
 * crece sin que nadie lo decida.
 */
export const BOOST_DESTACADOS_TOPE = 100;

/**
 * CUÁNTAS APARICIONES PUEDE HABER VIGENTES A LA VEZ, en todo el producto. Decisión de Sergio
 * (3-nov-2026) sobre la medición del banco de carga.
 *
 * NO ES UN LÍMITE DEL SERVIDOR: a 1.000 vigentes la máquina rinde igual que a 10 (la consulta de
 * destacados cuesta ~3 ms por cada mil, y el techo de la vCPU —unas 50 peticiones por segundo— no
 * se mueve con el número de Boosts). Es un límite de lo que se puede PROMETER: con 5 huecos en
 * portada, por encima de 60 ya no caben 5 minutos para cada uno.
 */
export const BOOST_MAX_SIMULTANEOS = 60;

/**
 * CADA CUÁNTO CAMBIA LA PORTADA, en segundos. La ventana es de reloj (desde la época), no desde el
 * arranque del proceso: dentro de la misma ventana, todos los visitantes ven lo mismo, lo responda
 * el servidor que lo responda y se haya reiniciado o no. Eso es lo que la hace cacheable por
 * ventana.
 */
export const BOOST_ROTACION_SEG = 60;

/**
 * LOS CARRILES DE LA ROTACIÓN, y por qué este número NO se elige: se deduce.
 *
 * Cada aparición entra en un carril y la ventana `w` abre por el carril `w mod CARRILES`. Para que
 * los 60 huecos-minuto de una hora (12 carriles × 5 huecos) alcancen justo para el máximo, los
 * carriles tienen que ser `MAX / HUECOS`. Cambiar el máximo recalcula los carriles y, con ellos,
 * los minutos prometidos — las tres cifras se mueven juntas o la promesa deja de ser cierta.
 * `tests/boost-rotacion` exige que la división sea exacta.
 */
export const BOOST_CARRILES = BOOST_MAX_SIMULTANEOS / BOOST_DESTACADOS_PORTADA;

/**
 * LOS MINUTOS DE PORTADA QUE SE PROMETEN por activación. También deducido: en una hora hay
 * `BOOST_DURACION_MIN` minutos y el carril de cada uno abre una vez cada `BOOST_CARRILES`.
 *
 * Es el número que va en el copy de `/boosts`. Sale de aquí y no se escribe a mano en la pantalla,
 * por lo mismo que la duración: prometer una cifra distinta de la que se aplica es el fallo que
 * esta constante existe para no poder cometer.
 */
export const BOOST_MIN_PORTADA = BOOST_DURACION_MIN / BOOST_CARRILES;

/**
 * Copy del cupo lleno, en dos piezas porque son dos cosas distintas: el titular dice QUÉ pasa y el
 * texto dice QUÉ HACER. `minutos` son los que faltan para que se libere el primer hueco; sin un
 * número, "vuelve más tarde" deja a la persona recargando a ciegas.
 *
 * NO SALE EL 60 NI LA EXPLICACIÓN DEL MÁXIMO. Para quien quiere destacarse ahora, el porqué del
 * cupo es información nuestra, no suya: lo que necesita es cuándo volver y que su Boost sigue ahí.
 * El razonamiento vive en los comentarios del código y en `BoostPlaza`, que es donde sirve.
 */
export const TITULO_BOOST_AGOTADO = "Ahora mismo está todo lleno";
export const msgBoostAgotado = (minutos: number) =>
  `Vuelve en ${minutos} min y habrá hueco para ti. Tu Boost sigue guardado.`;

/**
 * Lo que recibe quien activa, para la pantalla.
 *
 * La DURACIÓN entra ya humanizada (`duracionBoostHumana`, que dice "1 hora" y no "60 minutos")
 * en vez de componerla aquí: ese humanizador vive en `lib` y es el que usan las demás pantallas,
 * y tener dos formas de escribir la misma duración es como acaban diciendo cosas distintas. Los
 * MINUTOS DE PORTADA sí salen de aquí, porque son una cifra que solo conoce esta configuración.
 */
export const msgBoostQueRecibes = (duracion: string) =>
  `Tu perfil destaca durante ${duracion}: siempre en Perfiles Boost y por turnos en la portada, al menos ${BOOST_MIN_PORTADA} minutos.`;

/**
 * PAQUETES DE BOOST a la venta. FUENTE UNICA: de aqui salen el precio Y los creditos, tanto al
 * abrir el pago como al acreditarlo cuando Stripe confirma.
 *
 * ┌─ POR QUE UNA SOLA ESTRUCTURA ────────────────────────────────────────────────────────────────┐
 * │ Ya nos mordio con las categorias: habia DOS listas y la invalida acabo en produccion. Aqui    │
 * │ seria peor — una segunda lista de precios significa cobrar una cifra y acreditar otra.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL CLIENTE SOLO MANDA LA CLAVE. Ni el importe ni el numero de boosts viajan nunca desde el
 * navegador: se resuelven aqui, en servidor, por `packageId`. Asi es IMPOSIBLE colar "el pack de
 * 10 por un dolar", porque el precio no es un dato de entrada.
 *
 * Valores del documento maestro, en CENTIMOS enteros (nunca coma flotante):
 *   1 boost  = $5  → 500¢   (5,00 $/boost)
 *   5 boosts = $15 → 1500¢  (3,00 $/boost)
 *  10 boosts = $20 → 2000¢  (2,00 $/boost)
 */
export const PAQUETES_BOOST = {
  boost_1: { precioCents: 500, boosts: 1 },
  boost_5: { precioCents: 1500, boosts: 5 },
  boost_10: { precioCents: 2000, boosts: 10 },
} as const satisfies Record<string, { precioCents: number; boosts: number }>;

/** Las claves validas, como union. Un `packageId` que no este aqui no llega a Stripe. */
export const PaqueteBoostSchema = z.enum(
  Object.keys(PAQUETES_BOOST) as [keyof typeof PAQUETES_BOOST, ...(keyof typeof PAQUETES_BOOST)[]],
);
export type PaqueteBoost = z.infer<typeof PaqueteBoostSchema>;

/** Razon del movimiento de creditos al COMPRAR. Coincide con `BoostReasonSchema`. */
export const RAZON_BOOST_COMPRA = "PURCHASE";
/** `refType` de la fila de ledger: a que apunta el movimiento. */
export const REF_BOOST_STRIPE = "STRIPE_PAYMENT";

/** Copy de la compra. Cero codigos ni jerga de Stripe en pantalla: eso va al log. */
export const MSG_BOOST_PAGO_NO_DISPONIBLE = "Los pagos no están disponibles ahora mismo.";
export const MSG_BOOST_PAQUETE_NO_VALIDO = "Ese paquete no existe.";
export const MSG_BOOST_SIN_VERIFICAR = "Verifica tu correo para poder comprar.";

/**
 * Razon del movimiento cuando el EQUIPO ajusta creditos de boost a mano. Coincide con
 * `BoostReasonSchema` y es la que `razones-boost` dice por su signo.
 */
export const RAZON_BOOST_AJUSTE_ADMIN = "ADMIN_ADJUST";

// ============================================================================
// VIP MYTHIC (Fase 8) — la suscripcion
// ============================================================================

/** La clave del plan. Union de uno: el dia que haya otro, entra aqui y nada mas. */
export const PlanVipSchema = z.enum(["VIP_MYTHIC"]);
export type PlanVip = z.infer<typeof PlanVipSchema>;
export const PLAN_VIP = "VIP_MYTHIC";

/** 10 $/mes, en centimos enteros como todo el dinero del producto (documento maestro, §5). */
export const VIP_PRECIO_CENTS = 1000;

/**
 * EN QUE ESTADO ESTA UNA SUSCRIPCION. Las tres, y ninguna mas:
 *
 *  · ACTIVA    — se renueva sola al final del periodo.
 *  · CANCELADA — NO se renueva, pero el acceso sigue hasta `periodoFin`. Cancelar no es cortar:
 *                esta pagado hasta esa fecha y se respeta (sin prorrateo y sin reembolso).
 *  · CORTADA   — el acceso se retira YA, pase lo que pase con la fecha. Es para una devolucion de
 *                cargo o un fraude, no para una cancelacion normal.
 *
 * El acceso NO se lee de aqui: se CALCULA (ver `lib/vip`). Este campo dice que va a pasar al
 * terminar el periodo, no si hoy eres VIP.
 */
export const EstadoSuscripcionSchema = z.enum(["ACTIVA", "CANCELADA", "CORTADA"]);
export type EstadoSuscripcion = z.infer<typeof EstadoSuscripcionSchema>;

/**
 * El UNICO estado que QUITA el acceso por si mismo. Se declara en positivo y en un solo sitio para
 * que `esVipActivo` lo derive en vez de enumerar: añadir un estado nuevo obliga a decidir aqui si
 * corta o no, en vez de heredar un "pasa" por omision.
 */
export const ESTADOS_SIN_ACCESO_VIP: readonly EstadoSuscripcion[] = ["CORTADA"];

/**
 * LOS COLORES DE NOMBRE QUE PUEDE ELEGIR UN VIP: la CLAVE que se guarda -> el TOKEN que la pinta.
 *
 * Lista CERRADA, y por dos razones distintas:
 *
 *  1. DE PRODUCTO: un color libre deja elegir el gris del fondo (nombre invisible) o el rojo de
 *     alarma (parece un aviso del sistema). El set se elige midiendo contraste en los DOS temas.
 *  2. DE SEGURIDAD: lo que llega del cliente es una CLAVE de esta lista, no un color. El valor que
 *     acaba en el CSS sale del catalogo, asi que no hay nada del usuario que pueda entrar en una
 *     hoja de estilos. El guard de `lib/color-nombre` es la segunda capa, no la unica.
 *
 * ┌─ EL VALOR ES UN TOKEN Y NO UN HEX, Y NO ES PREFERENCIA ──────────────────────────────────────┐
 * │ Un hex aqui seria UN valor para los DOS temas, y un nombre se pinta sobre el fondo DE SU     │
 * │ tema: el mas claro del set, sobre el blanco del tema claro, no se lee. Cada opcion necesita  │
 * │ su valor en cada tema, y eso solo lo sabe hacer `globals.css`, que es donde vive la paleta   │
 * │ y el unico sitio del repositorio donde un color se escribe a mano (ver                        │
 * │ `tests/marca-hex-duplicados`: "cero hex fuera de los tokens").                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SON CUATRO Y NO CINCO: EL DORADO NO ES COLOR DE NOMBRE ────────────────────────────────────┐
 * │ La maqueta traia un quinto, dorado. Se midio sobre la pantalla y en el tema OSCURO —el       │
 * │ principal— el nombre dorado queda a dE 6,4 de `--df-rank`: en el podio se lee como el oro   │
 * │ del PUESTO, justo al lado del "1" y de la medalla. Un color que el usuario elige no puede   │
 * │ parecer una posicion que se gana.                                                            │
 * │                                                                                              │
 * │ El oro VIP no desaparece: sigue en el SELLO y en la GEMA (`--vip-gold`), que no chocan con   │
 * │ el podio porque se separan por FORMA —estrella con gema contra medalla redonda—. Lo que sale │
 * │ es el oro como color de TEXTO, que es donde solo podia separarse por color y no podia.       │
 * │                                                                                              │
 * │ Una clave retirada se trata como "sin color": `colorDeNombre` devuelve `null` y el nombre se │
 * │ pinta normal. Quien tuviera "oro" guardado no rompe nada ni necesita migracion.              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * PROVISIONAL: PENDIENTE del visto bueno de Sergio — cambiar el SET es esta lista (y su pareja de
 * valores en los dos bloques de `globals.css`); cambiar un TONO es solo el CSS, sin tocar nada de
 * aqui ni migrar lo que la gente ya eligio.
 */
export const COLORES_NOMBRE_VIP = {
  verde: "--vip-nombre-verde",
  lima: "--vip-nombre-lima",
  diamante: "--vip-nombre-diamante",
  fuego: "--vip-nombre-fuego",
} as const satisfies Record<string, string>;

export const ColorNombreSchema = z.enum(
  Object.keys(COLORES_NOMBRE_VIP) as [
    keyof typeof COLORES_NOMBRE_VIP,
    ...(keyof typeof COLORES_NOMBRE_VIP)[],
  ],
);
export type ColorNombre = z.infer<typeof ColorNombreSchema>;

/**
 * UN NOMBRE DE TOKEN CSS, Y NADA MAS QUE ESO. `--` seguido de minusculas, digitos o guiones, de
 * principio (`^`) a fin (`$`), sin espacios ni nada detras.
 *
 * ┌─ POR QUE ESTE PATRON ES TAN ESTRICTO ────────────────────────────────────────────────────────┐
 * │ Lo que valida acaba dentro de una declaracion CSS. Si se colara algo como                    │
 * │ `e8f620;}</style><script>…`, lo que entra en la pagina ya no es un color: es el cierre de la │
 * │ regla, el cierre de la etiqueta y lo que venga detras. Por eso no vale "quitar los           │
 * │ caracteres raros" —un filtro de limpieza siempre deja pasar la forma que no se penso—: vale  │
 * │ ACEPTAR solo la forma completa, y rechazar TODO lo demas. Y `$` y no `\b`: con `\b`,          │
 * │ "--vip-nombre-oro</style>" casaria.                                                           │
 * │                                                                                               │
 * │ VALIDA UN TOKEN Y NO UN HEX porque lo que llega al CSS es un token (ver                      │
 * │ `COLORES_NOMBRE_VIP`). Y de paso es mas estrecho: un color escrito a mano, aunque fuera un   │
 * │ hex perfectamente valido, tampoco pasa — porque no es uno de los nuestros.                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const TOKEN_CSS = /^--[a-z][a-z0-9-]*$/;

/** Copy de la suscripcion. Cero codigos ni jerga de Stripe en pantalla: eso va al log. */
export const MSG_VIP_PAGO_NO_DISPONIBLE = "Las suscripciones no están disponibles ahora mismo.";
export const MSG_VIP_SIN_VERIFICAR = "Verifica tu correo para poder suscribirte.";
export const MSG_VIP_YA_ACTIVO = "Ya tienes VIP Mythic activo.";
export const MSG_VIP_NO_ERES = "No tienes ninguna suscripción activa que cancelar.";
export const MSG_VIP_CANCELADA_OK =
  "Hemos pedido la baja. Sigues siendo VIP hasta que acabe el periodo que ya pagaste.";
export const MSG_VIP_YA_CANCELADA = "Tu suscripción ya estaba cancelada.";

/**
 * LO QUE INCLUYE EL PLAN, para la pagina /vip.
 *
 * ┌─ SOLO LO QUE EXISTE, Y NI SIQUIERA COMO "PROXIMAMENTE" ─────────────────────────────────────┐
 * │ Esta lista es una PROMESA a quien va a pagar diez dolares al mes. Un "mensajes ilimitados"  │
 * │ o un "sin anuncios" que todavia no existen no son una proyeccion optimista: son algo que la │
 * │ persona cree estar comprando y no recibe. Y ponerlos con una etiqueta de "pronto" es peor,  │
 * │ porque convierte la lista de beneficios en una lista de intenciones.                        │
 * │                                                                                              │
 * │ Cada linea de aqui apunta a algo que YA esta construido y desplegado, y la pieza que lo     │
 * │ construyo va anotada al lado. Cuando exista uno nuevo, se añade aqui y sale en la pagina.   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const BENEFICIOS_VIP: readonly string[] = [
  // P5: el reparto semanal. El "valor 5$" del documento maestro NO se escribe: es copy de venta
  // y aqui pondria un importe al lado de algo que no mueve dinero.
  "1 Boost gratis por semana",
  // P2: el color del nombre, del catalogo cerrado.
  "Nombre destacado con el color que elijas",
  // P2: la marca en las nueve superficies.
  "Insignia Mythic en tu perfil, el feed y los comentarios",
  // P3: borde animado, bloom y barrido.
  "Perfil animado con borde neón",
  // P4: dar un toque.
  "Puedes dar un toque a otros perfiles",
];

/**
 * TOQUES AL DIA POR PERSONA (Fase 8 · P4). Es el tope del EMISOR, y es la segunda capa del
 * anti-acoso: la primera es la clave unica del aviso, que ya impide tocar DOS VECES A LA MISMA
 * PERSONA el mismo dia. Esta acota la otra forma de abusar —tocar a trescientas personas
 * distintas—, que la clave no ve porque cada pareja es un hecho distinto.
 *
 * 20 es un numero de partida: holgado para quien usa la funcion como se espera (saludar a unos
 * cuantos perfiles) y estrecho para quien la quiera usar como megafono. Lo afina Sergio, y es
 * esta linea.
 */
export const TOQUE_MAX_DIA = 20;

/**
 * EL REGALO SEMANAL DEL VIP (Fase 8 · P5): cuantos boosts recibe cada semana.
 *
 * Es el beneficio #2 del maestro y NO es un detalle suelto: es el mecanismo que sustituye al
 * "auto-destacar" que se descarto —destacar sigue siendo algo que se gasta, no un privilegio
 * permanente—, asi que cambiar este numero cambia esa decision de producto.
 */
export const VIP_BOOST_SEMANAL = 1;

/** Razon y referencia del movimiento de ledger del regalo semanal. Coincide con `BoostReasonSchema`. */
export const RAZON_BOOST_VIP_SEMANAL = "VIP_WEEKLY";
export const REF_BOOST_VIP = "VIP_SUBSCRIPTION";

/**
 * Cada cuanto MIRA el worker si toca repartir el regalo semanal. No es "cada cuanto se reparte"
 * —eso lo decide la SEMANA ISO, y la clave de idempotencia lo garantiza—: es cada cuanto se
 * comprueba. Una hora basta de sobra para un reparto semanal, y hace que un worker que estuvo
 * caido el lunes reparta solo al volver, sin que nadie pierda su boost.
 */
export const VIP_BOOST_SEMANAL_CADENCIA_MS = 60 * 60 * 1000;

/** Copy del toque. Ninguno de estos casos es un error del sistema: son respuestas. */
export const MSG_TOQUE_SOLO_VIP = "Dar un toque es de VIP Mythic. Hazte VIP para usarlo.";
export const MSG_TOQUE_SIN_VERIFICAR = "Verifica tu correo para poder dar un toque.";
export const MSG_TOQUE_A_TI_MISMO = "No puedes darte un toque a ti mismo.";
export const MSG_TOQUE_REPETIDO = "Ya le has dado un toque hoy.";
/** Mismo criterio que el limite de Boost: la hora de verdad, no un "vuelve mañana" que miente. */
export function msgToqueLimiteDiario(reinicio: string): string {
  return `Ya has dado ${TOQUE_MAX_DIA} toques hoy. ${reinicio}`;
}
export const MSG_TOQUE_ENVIADO = "Toque enviado.";

/**
 * Tope de UN ajuste de creditos de boost, en cualquier sentido.
 *
 * NO ES UNA REGLA DE PRODUCTO, ES UN FRENO AL DEDO, igual que `AJUSTE_DELTA_MAX` en los puntos: un
 * cero de mas tecleado por error no puede regalar un monton de apariciones destacadas. Si de verdad
 * hiciera falta mas, son dos ajustes, con su motivo cada uno.
 *
 * DIEZ, Y NO CIEN. Nacio en 100 y Sergio lo bajo: un regalo de verdad son 1-10 boosts, y 100 son mas
 * de 200 $ a precio de catalogo — o sea que el "freno" dejaba pasar justo el dedazo que tenia que
 * frenar. Comparado con el de puntos (5.000) parece minusculo, y esa es la diferencia: un punto no
 * se compra con dinero y un boost si.
 *
 * El test que lo fija clava el 10 con VALORES CONCRETOS (10 pasa, 11 no) en vez de leer esta
 * constante: un test que la lee sigue verde el dia que alguien la cambie, o sea que no la vigila.
 */
export const AJUSTE_BOOST_DELTA_MAX = 10;

/** Copy de la ACTIVACION. Lo que el usuario puede hacer algo con, nunca el codigo del rechazo. */
export const MSG_BOOST_SIN_SALDO = "No te quedan Boosts. Compra uno para destacar tu perfil.";
/**
 * EL LIMITE NO DICE "vuelve mañana", y no es un descuido: el contador se reinicia a medianoche UTC
 * (ver RESET_TIMEZONE), que para alguien en UTC+10 no es "mañana" sino esta misma tarde. Decir la
 * hora de verdad es menos redondo y no miente. Desde la Fase 11, esa hora en SU zona: ver
 * `fraseReinicioDiario`.
 */
export function msgBoostLimiteDiario(reinicio: string): string {
  return `Ya has destacado tu perfil ${BOOST_DAILY_LIMIT} veces hoy. ${reinicio}`;
}

/**
 * CUÁNDO SE REINICIAN LOS CONTADORES DIARIOS (Boost, toques), dicho en la hora de quien mira (Fase 11):
 * «El contador se reinicia a las 01:00.» El DÍA se sigue calculando en UTC (`RESET_TIMEZONE`): esto
 * cambia cómo se DICE, nunca cuándo se reinicia. A un usuario no se le dice «UTC», y sin su zona no se
 * inventa una hora: se dice que es cada día.
 */
export function fraseReinicioDiario(ahora: Date, idioma: Idioma, zona: ZonaHoraria | null): string {
  return `El contador se reinicia ${cuandoSeReinicia(ahora, idioma, zona)}.`;
}

/** Solo el CUÁNDO: «a las 01:00», o «cada día» si no sabemos su zona. Para frases con otra forma. */
export function cuandoSeReinicia(ahora: Date, idioma: Idioma, zona: ZonaHoraria | null): string {
  return zona ? `a las ${horaDelReinicioDiario(ahora, idioma, zona)}` : "cada día";
}
export const MSG_BOOST_ACTIVAR_SIN_VERIFICAR = "Verifica tu correo para poder destacar tu perfil.";

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
 * RECONCILIACION DE CONTADORES (`Submission.voteCount`, `Video.commentCount`, `Video.likeCount`).
 * Recuenta cada cache desde su tabla fuente y escribe el valor ABSOLUTO cuando no cuadra. Mismo
 * patron incremental que las reconciliaciones de Bunny: cursor rotatorio en SystemState, lote fijo
 * por ciclo, round-robin de cobertura completa.
 *
 * CADENCIA MAS ALTA QUE LAS DE BUNNY (1 h, no 6) porque aqui NO hay llamada de red por fila: es una
 * transaccion corta contra indices locales. Y el LOTE es mas pequeño (200, no 500) porque cada fila
 * abre su propia transaccion con un `FOR UPDATE`: lo que se acota no es la red, son los cerrojos.
 */
export const RECON_CONTADORES_CADENCIA_MS = 60 * 60 * 1000; // 1 h
export const RECON_CONTADORES_LOTE_POR_CICLO = 200; // filas por tabla y barrido

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
 * ledgers separados que no se convierten entre si). Valores del documento maestro.
 *
 * INVITE_FRIEND valio +50 durante un tiempo por una decision del propietario que SUPERSEDE la
 * suya: vuelve al +10 del documento maestro (decision cerrada al construir referidos). Se cobra
 * DOS veces por invitacion —el que invita y el invitado—, asi que el coste real por alta es 20.
 */
export const POINTS = {
  WIN_CHALLENGE: 300,
  /**
   * Lo cobran LAS DOS filas de referidos —quien invita y quien se registra con la invitacion—, a
   * proposito: el valor de la invitacion es el mismo por los dos lados. Un segundo importe para la
   * mitad de abajo seria otro numero que mantener sin que nadie haya pedido que difieran.
   */
  INVITE_FRIEND: 50,
  TOP20: 100,
  /** Cada vez que se completa un HITO de VIDEOS_POR_HITO videos PUBLICADOS (acumulado de por vida). */
  VIDEOS_PUBLICADOS_HITO: 100,
  /** Racha de 7 dias seguidos. La otorga `racha.ts`. */
  RACHA_7_DIAS: 50,
  /** 50 likes en un video. Lo otorga `likes.ts`. */
  VIDEO_50_LIKES: 10,
} as const;

/**
 * Cuantos videos PUBLICADOS componen un hito. La regla se decidio ACUMULADA DE POR VIDA, y las dos
 * alternativas se descartaron por motivos concretos: "por reto" es imposible (el esquema impone 1
 * participacion por usuario y reto, asi que nunca habria 3), y "por semana" es fragil (obliga a fijar
 * un corte semanal, a decidir que pasa con los videos de la semana anterior y a un barrido que
 * recompute; un hito acumulado no tiene bordes que discutir).
 */
export const VIDEOS_POR_HITO = 3;

/** Razon del movimiento de puntos del hito (union de razones del PointsLedger). */
export const RAZON_HITO_VIDEOS = "VIDEOS_PUBLICADOS";

/**
 * LIKES QUE HACEN HITO en un video: a los 50, su dueno cobra `POINTS.VIDEO_50_LIKES`.
 *
 * ES UN HITO, NO UN SALDO, y por eso se otorga UNA VEZ por video y no se desotorga: si el contador
 * baja de 50 y vuelve a subir, no se vuelve a pagar (la clave de idempotencia ya esta usada).
 * Misma disciplina que `hito-videos`: la clave es funcion del ESTADO, no del evento que la disparo.
 */
export const LIKES_PARA_HITO = 50;
/** Razon del movimiento. COINCIDE con la fila de `ACCIONES_PUNTOS`, que es lo que la activa. */
export const RAZON_HITO_LIKES = "VIDEO_50_LIKES";

/**
 * DIAS SEGUIDOS QUE HACEN RACHA: a los 7, `POINTS.RACHA_7_DIAS`.
 *
 * QUE CUENTA COMO DIA ACTIVO: una accion que IMPORTA —publicar, votar, comentar o dar like—, no
 * entrar a secas. Abrir la app se farmea solo y vaciaria el sentido de la racha. La lista vive en
 * `ACCIONES_RACHA` y un test exige que cada servicio de esa lista marque el dia.
 *
 * SE PAGA UNA VEZ POR RACHA, no una vez en la vida ni cada siete dias: treinta dias seguidos
 * cobran UNA vez; perderla y reconstruirla vuelve a cobrar (ver `lib/racha`).
 */
export const RACHA_DIAS_PREMIO = 7;
/** Razon del movimiento. COINCIDE con la fila de `ACCIONES_PUNTOS`, que es lo que la activa. */
export const RAZON_RACHA = "RACHA_7_DIAS";

/**
 * LOS SERVICIOS CUYA ACCION CUENTA PARA LA RACHA. No es documentacion: `tests/racha-cobertura`
 * exige que cada uno de estos ficheros llame a `marcarDiaActivo`.
 *
 * Anadir una quinta accion que cuente es anadirla aqui y cablearla; olvidarse de lo segundo se
 * pone ROJO. Es la misma disciplina que `route-csrf` con `mutatingRoute`: un punto unico, y que
 * saltarselo no pueda pasar en silencio.
 */
export const ACCIONES_RACHA: ReadonlyArray<{ servicio: string; que: string }> = [
  { servicio: "votes.ts", que: "votar una participacion" },
  { servicio: "comentarios.ts", que: "publicar un comentario" },
  { servicio: "likes.ts", que: "dar me gusta a un video" },
  { servicio: "video-confirmacion.ts", que: "publicar un video" },
];

/** Copy de los likes. El boton no dice numeros: el numero lo pone el contador. */
export const MSG_LIKE_PROPIO = "No puedes dar me gusta a tu propio vídeo.";
export const MSG_LIKE_NO_DISPONIBLE = "Este vídeo ya no está disponible.";

/**
 * REFERIDOS. Una invitacion paga a los DOS lados con el MISMO importe (`POINTS.INVITE_FRIEND`), pero
 * con razones DISTINTAS, y eso es a proposito: las dos filas tienen `refType: "USER"` y se apuntan
 * mutuamente, asi que por (razon, tipo, id) serian indistinguibles y el historial no podria decir
 * quien invito a quien. Con dos razones, cada fila se explica sola —"Invito a @fulano" / "Se registro
 * con el enlace de @mengano"— sin tener que ir a mirar la relacion.
 *
 * `INVITE_FRIEND` (la del que invita) ya existia como clave de `POINTS`; se reutiliza como razon.
 */
export const RAZON_INVITO_AMIGO = "INVITE_FRIEND";
export const RAZON_REGISTRO_CON_REFERIDO = "REGISTERED_WITH_REFERRAL";

/**
 * CATALOGO DE ACCIONES QUE DAN PUNTOS, para la tabla de "como ganar puntos".
 *
 * `activa` dice si HOY se otorga de verdad. Es un dato de CONFIG y no una lista escrita en el JSX
 * por dos motivos: la pantalla no puede saberlo sola, y el dia que se cablee una accion basta con
 * girar este booleano para que la fila cambie de estado sin tocar el componente.
 *
 * Y para que ese booleano no pueda MENTIR, `tests/acciones-puntos.test.ts` lo contrasta contra el
 * codigo: si una razon se otorga en `server/services` y aqui figura como proxima —o al reves— se
 * pone rojo. La config manda sobre la pantalla; el codigo manda sobre la config.
 *
 * HOY NO HAY NINGUNA FILA "PROXIMAMENTE", y es una decision, no un descuido: las dos que quedaban
 * (registro desde un video y 100 vistas externas) se RETIRARON porque no se van a hacer. Enseñar
 * indefinidamente lo que no va a llegar no es un mapa, es una promesa caducada — y el aviso de que
 * un "proximamente" sobrevive a su fase ya nos costo una revision.
 *
 * EL MECANISMO SE QUEDA (`activa`, `fase`, `nota`, y su rama en `tabla-puntos.tsx`) porque la
 * siguiente accion que se decida vuelve a necesitarlo: se añade su fila con `activa: false` y la
 * pantalla la pinta atenuada sin tocar el componente. Lo que NO se queda es una fila inventada para
 * mantener el mecanismo "en uso".
 *
 * Los importes salen SIEMPRE de `POINTS`: un numero escrito aqui a mano seria un segundo catalogo.
 */
export interface AccionPuntos {
  /** `reason` de la fila del PointsLedger. Es la clave que ata la fila a lo que de verdad la paga. */
  razon: string;
  etiqueta: string;
  puntos: number;
  /** ¿Se otorga HOY? Lo vigila el test contra `server/services`. */
  activa: boolean;
  /**
   * EN QUE FASE se cableara, cuando esta decidido. La fila lo enseña ("Fase 6") en vez del generico
   * "Proximamente", que no dice nada. Solo tiene sentido en las NO activas, y el test lo exige asi:
   * una activa con fase seria una promesa de algo que ya esta.
   *
   * SIN VALOR MIENTRAS NO SE DECIDA. Poner una fase a ojo aqui es inventarse una fecha: el usuario
   * la leeria como un compromiso y no lo es. Cuando el propietario asigne las fases, se rellenan.
   */
  fase?: number;
  /** Por que todavia no, cuando hay un motivo que merece decirse. */
  nota?: string;
}

export const ACCIONES_PUNTOS: readonly AccionPuntos[] = [
  { razon: "WIN_CHALLENGE", etiqueta: "Ganar un reto", puntos: POINTS.WIN_CHALLENGE, activa: true },
  {
    razon: "TOP20",
    etiqueta: "Entrar en el top 20 de un reto",
    puntos: POINTS.TOP20,
    activa: true,
  },
  {
    razon: RAZON_HITO_VIDEOS,
    etiqueta: `Publicar ${VIDEOS_POR_HITO} vídeos`,
    puntos: POINTS.VIDEOS_PUBLICADOS_HITO,
    activa: true,
  },
  {
    razon: RAZON_INVITO_AMIGO,
    etiqueta: "Invitar a alguien que verifica su correo",
    puntos: POINTS.INVITE_FRIEND,
    activa: true,
  },
  {
    razon: RAZON_REGISTRO_CON_REFERIDO,
    etiqueta: "Registrarte con la invitación de alguien",
    puntos: POINTS.INVITE_FRIEND,
    activa: true,
  },
  {
    razon: RAZON_RACHA,
    etiqueta: `Racha de ${RACHA_DIAS_PREMIO} días seguidos`,
    puntos: POINTS.RACHA_7_DIAS,
    // ACTIVA desde que la racha existe. Como en los likes, no se gira a mano: el test de
    // `acciones-puntos` contrasta esta config contra lo que de verdad otorga `server/services`.
    activa: true,
  },
  {
    razon: RAZON_HITO_LIKES,
    etiqueta: `Recibir ${LIKES_PARA_HITO} likes en un vídeo`,
    puntos: POINTS.VIDEO_50_LIKES,
    // ACTIVA desde que existen los likes. No se gira a mano: el test de `acciones-puntos` contrasta
    // esta config contra lo que de verdad otorga `server/services`, asi que dejarla en `false`
    // teniendo el otorgamiento cableado se pone rojo — y al reves tambien.
    activa: true,
  },
];

/** Copy de referidos. El codigo NO se ensena como "codigo": se ensena el ENLACE, que es lo que se comparte. */
export const MSG_REFERIDO_NO_VALIDO = "Ese enlace de invitación no es válido.";
/** Parametro del enlace de invitacion: `https://…/entrar?ref=CODIGO`. Fuente unica. */
export const PARAM_REFERIDO = "ref";

/**
 * AJUSTE MANUAL de puntos desde el panel (DareUp): razon de su fila de ledger. Va con refType "ADMIN",
 * refId = el admin que lo hizo y una nota obligatoria (el por que). Ver `dareup-admin.ts`.
 */
export const RAZON_AJUSTE_ADMIN = "ADMIN_AJUSTE";
/** Largo de la nota del ajuste: lo bastante para que diga algo; el tope es la columna (VarChar 500). */
export const AJUSTE_NOTA_MIN = 5;
export const AJUSTE_NOTA_MAX = 500;
/**
 * Tope de UN ajuste, en cualquier sentido. Un cero de mas tecleado por error no puede llevar a nadie
 * de Rookie a Legend de golpe; si de verdad hiciera falta mas, son dos ajustes, con su motivo cada uno.
 */
export const AJUSTE_DELTA_MAX = 5_000;
/**
 * Movimientos por pagina en el historial de puntos, por KEYSET. Lo comparten las DOS pantallas que lo
 * listan —el inspector del panel y el historial propio de /puntos— porque son la misma tabla leida
 * igual: un segundo tamano de pagina no aportaria nada y seria una perilla mas que puede discrepar.
 */
export const DAREUP_HISTORIAL_PAGINA = 20;

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
 * EDAD MINIMA PARA USAR DAREFLASH. 18, global: no se varia por pais a proposito — una tabla de
 * mayorias de edad por jurisdiccion obliga a saber DONDE esta cada persona, y eso es un dato que no
 * tenemos ni queremos pedir para esto. Un unico numero, el mas alto de los habituales.
 *
 * ┌─ ES LA PUERTA DE **USAR**, Y ES **DECLARADA** ────────────────────────────────────────────────┐
 * │ La persona escribe su fecha y marca una casilla. Nadie ha visto un documento, asi que esto no │
 * │ es verificacion de edad y no autoriza a COBRAR nada.                                          │
 * │                                                                                               │
 * │ La verificacion de verdad —documento, identidad, contra listas— la hace STRIPE CONNECT cuando │
 * │ alguien va a reclamar un premio, en otro momento y con otras consecuencias. Son dos puertas   │
 * │ distintas: que esta este pasada no dice NADA sobre aquella, y ningun codigo puede tratar      │
 * │ `fechaNacimiento` como permiso para mover dinero.                                             │
 * │                                                                                               │
 * │ Ni el codigo ni el copy pueden sugerir que la edad este "verificada": lo esta "declarada".    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SUSTITUYE A `MIN_AGE_YEARS`, que valia 16 y vivia aqui mismo. No se dejan las dos: dos umbrales
 * para la misma puerta es la forma mas facil de mover uno y olvidarse del otro. Subir a 18 NO echa
 * a nadie que ya este dentro — la puerta es el ALTA, y las cuentas existentes no se revisan.
 */
export const EDAD_MIN_USO = 18;

/**
 * Lo que se le dice a quien declara ser menor. Humano y sin reganar: no ha hecho nada malo.
 * NO lleva el numero dentro ("mayor de edad", no "18 anos") a proposito: seria una segunda copia
 * de `EDAD_MIN_USO` esperando a quedarse desfasada el dia que el umbral se mueva.
 */
export const MSG_EDAD_MINIMA = "Tienes que ser mayor de edad para registrarte.";
/** Fecha con mala forma, inexistente, futura o imposible. */
export const MSG_FECHA_NACIMIENTO_NO_VALIDA = "Revisa tu fecha de nacimiento.";
/** La casilla es obligatoria: sin ella no hay alta. */
export const MSG_TERMINOS_SIN_ACEPTAR = "Tienes que aceptar los términos para registrarte.";

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
 * Maximo de correos que la cola envia por ejecucion. Un SMTP compartido suele
 * limitar envios por hora; la cola respeta este ritmo, no vacia el lote de
 * golpe. Ajustable segun el limite real del proveedor de correo.
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

/**
 * Copy del reto EXCLUSIVO para quien no es VIP (Fase 8 · P7). Dice QUE PASA y QUE FALTA, en humano:
 * el `409 SOLO_VIP` es para el log, no para la pantalla. Y no promete nada mas —ni descuentos ni
 * "proximamente"—: lo unico cierto es que este reto es de Mythic.
 */
export const MSG_RETO_SOLO_VIP = "Este reto es exclusivo de VIP Mythic.";

/** El CTA del reto exclusivo cuando quien mira no es VIP. Lleva a /vip, que es donde se arregla. */
export const CTA_RETO_SOLO_VIP = "Hazte VIP para participar";

/** La chapa de la tarjeta de un reto exclusivo. Va al lado de la marca "VIP", que ya dice el plan. */
export const ETIQUETA_RETO_SOLO_VIP = "EXCLUSIVO";

/**
 * UN RETO QUE TODAVIA NO HA ABIERTO (`startsAt` futuro). La chapa de su tarjeta y el titulo de su
 * seccion en /retos.
 *
 * "PROXIMAMENTE" y no "PROGRAMADO": lo segundo es la palabra del PANEL (`estadoRetoAdmin`), que
 * describe una decision del admin. Al publico no le interesa que alguien lo programara, sino que
 * todavia no puede entrar — y "proximamente" ademas promete, que es lo que se quiere en un
 * producto de concurso.
 */
export const ETIQUETA_RETO_PROXIMAMENTE = "PRÓXIMAMENTE";

/** El CTA del detalle de un reto que aun no ha abierto: dice por que no se puede, no "cerrado". */
export const CTA_RETO_PROXIMAMENTE = "Aún no ha abierto";

// ============================================================================
// RETOS PATROCINADOS (Fase 9 · P1)
// ============================================================================

/**
 * COMISION POR DEFECTO que se le factura a una marca, en puntos basicos (2500 = 25%).
 *
 * ES SOLO EL VALOR INICIAL DEL FORMULARIO. El porcentaje que cuenta es el GUARDADO EN EL RETO
 * (`Challenge.comisionBps`): es parte del trato que se cerro con esa marca ese mes. Cambiar esta
 * constante cambia lo que propone el formulario de un reto NUEVO y no toca ni un reto existente —
 * si lo tocara, un reto cerrado hace meses pasaria a "haber cobrado" otra cosa que la factura ya
 * emitida. Hay diente que lo fija.
 */
export const COMISION_SPONSOR_BPS_DEFECTO = 2500;

/** Lo que se lee en la tarjeta y en la ficha de un reto patrocinado, delante del nombre de la marca. */
export const ETIQUETA_PATROCINADO = "Patrocinado por";

/** Nombre de marca: es un nombre comercial escrito a mano, no una clave. Tope sobrio. */
export const SPONSOR_NOMBRE_MAX = 60;

/**
 * Lado maximo del LOGO de la marca, en px. Mas pequeño que una portada a proposito: el logo se
 * pinta a ~24 px en una tarjeta y a ~40 en la ficha, asi que 512 ya es el doble de lo que hace
 * falta en una pantalla de retina. El tope de BYTES es el mismo de la portada (el pipeline es el
 * mismo y el limite de bytes protege la MEMORIA al decodificar, que no depende de para que sea).
 */
export const SPONSOR_LOGO_MAX_LADO = 512;

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

/**
 * AVISO DE CAPACIDAD: cuando la maquina se acerca a su techo, antes de que se note.
 *
 * ┌─ DE DONDE SALEN LOS UMBRALES ────────────────────────────────────────────────────────────────┐
 * │ Del banco de carga, con los limites de produccion (1 nucleo compartido, sin swap), personas   │
 * │ con pausas de 3-8 s, rampa y Caddy delante. Las MISMAS unidades que mide el aviso: porcentaje │
 * │ de UN nucleo.                                                                                 │
 * │                                                                                               │
 * │ LA EQUIVALENCIA EN PERSONAS CAMBIA CON CADA OPTIMIZACION, y por eso vive AQUI y no en el      │
 * │ correo: una cifra en el correo envejece sin que nadie la revise. Dos medidas, las dos con su  │
 * │ fecha y el SHA con el que se midieron:                                                        │
 * │                                                                                               │
 * │   4-nov-2026, `659875b` (antes de arreglar el feed)                                           │
 * │     150 personas -> 49 %   <- PREPARATE (50 %)                                                │
 * │     200 personas -> 64 %       limite razonable                                               │
 * │     250 personas -> 87 %   <- AMPLIA YA (70 %)                                                │
 * │     300 personas -> 98 %       inservible                                                     │
 * │                                                                                               │
 * │   4-nov-2026, `10cea40` (feed arreglado + cupo de 60 Boosts)                                  │
 * │     200 personas -> 47 %       /inicio 29 ms de mediana, 156 ms el p95                        │
 * │     300 personas -> 67 %       limite razonable (p95 484 ms)                                  │
 * │     400 personas -> 96 %       inservible (742 ms de mediana)                                 │
 * │                                                                                               │
 * │ Los PORCENTAJES no se tocan: con la medicion nueva, 50 % son ~215 personas y 70 % son ~310, y │
 * │ los dos siguen avisando antes del acantilado (que ahora esta entre 300 y 400). Lo que cambia  │
 * │ al optimizar es cuanta gente cabe bajo el mismo porcentaje, no cuando conviene avisar.        │
 * │                                                                                               │
 * │ En PRODUCCION avisara con menos gente que esas cifras, porque el banco no medía TLS: el mismo │
 * │ trafico real cuesta mas CPU. El sesgo empuja al lado seguro, que es el que queremos.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const CPU_AVISO_PREPARATE_PCT = 50;
export const CPU_AVISO_AMPLIA_PCT = 70;

/**
 * La VENTANA del aviso: 20 muestras cada 30 s = 10 minutos, y se compara la MEDIANA.
 *
 * Diez minutos y mediana, no un instante: el cron de puntuaciones, una migracion o un barrido
 * pueden poner el nucleo al tope un par de minutos, y eso no es quedarse sin maquina. Con veinte
 * muestras, un pico de tres minutos son seis y la mediana ni se mueve.
 *
 * Lo que SI puede disparar el aviso es un despliegue (`npm ci` + `next build` tardaron 319 y 461
 * segundos con la CPU al tope). Se acepta convivir con ese falso positivo: el correo llega con las
 * veinte muestras, que lo explican solas, y la histeresis impide que se repita.
 */
export const CPU_MUESTRA_CADA_MS = 30_000;
export const CPU_MUESTRAS_VENTANA = 20;

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
  // Clic en una campaña (`/ir/{id}`, P10). Por IP CIFRADA (leída solo de X-Real-IP). NO frena a nadie:
  // por encima del tope se le redirige igual, solo que el clic ya no CUENTA. Lo que se acota es que una
  // sola IP infle las cifras de una empresa a base de recargar el enlace.
  CLIC_PUBLICIDAD_PER_IP: { limit: 30, windowMs: 10 * 60 * 1000 }, // 30 / 10 min por IP
  // Marcar avisos como leídos: lo dispara abrir la campana o la página de avisos. Barato (un UPDATE
  // acotado a las filas del propio usuario), pero es una escritura: tope por usuario.
  NOTIF_LEER_PER_USER: { limit: 120, windowMs: 15 * 60 * 1000 }, // 120 / 15 min por usuario
  // Votar: el modelo es UN voto por reto, asi que el uso legitimo es bajo (votar, quiza mover una o
  // dos veces mientras se decide, quiza quitarlo). Mas ajustado que el de "visto" porque aqui SI hay
  // efectos: mueve contadores. No pretende frenar el fraude —eso es el gate, el no-autovoto y el
  // unique de la BD—, sino que nadie martillee el endpoint.
  VOTO_PER_USER: { limit: 60, windowMs: 15 * 60 * 1000 }, // 60 / 15 min por usuario
  // Abrir un pago de Boost. MUY ajustado: cada intento crea una sesion en Stripe, asi que un bucle
  // aqui es ruido en la cuenta de pagos, no solo en la nuestra. Nadie compra seis veces en un
  // cuarto de hora de buena fe.
  BOOST_CHECKOUT_PER_USER: { limit: 6, windowMs: 15 * 60 * 1000 }, // 6 / 15 min por usuario
  // Abrir el pago de créditos de publicidad (P11), por EMPRESA: el mismo margen que Boost.
  CREDITOS_CHECKOUT_PER_EMPRESA: { limit: 6, windowMs: 15 * 60 * 1000 }, // 6 / 15 min por empresa
  // Like (y quitarlo, MISMO cubo):es la accion mas barata del producto y la que mas se repite al
  // bajar por el feed, asi que el cubo es generoso. Lo que acota no es el fraude —el hito lo
  // protegen el UNIQUE y el no-autolike— sino que nadie martillee el endpoint.
  LIKE_PER_USER: { limit: 120, windowMs: 15 * 60 * 1000 }, // 120 / 15 min por usuario
  // Comentar (y borrar los propios, mismo cubo):texto público, así que el tope frena el spam sin
  // estorbar a quien conversa. 30 en 15 min es uno cada 30 s sostenido.
  COMENTAR_PER_USER: { limit: 30, windowMs: 15 * 60 * 1000 }, // 30 / 15 min por usuario
  // DAR UN TOQUE. La ventana es de 24 h y no de 15 min, y eso lo hace distinto de todos los de
  // arriba: aqui el cubo NO es "que nadie martillee el endpoint" —para eso sobraria 60/15min—,
  // es el TOPE DE PRODUCTO contra el acoso, el que impide usar la funcion como megafono hacia
  // trescientas personas. Por eso su numero sale de `TOQUE_MAX_DIA`, que es donde se afina, y no
  // de aqui: el limite es una decision de producto que resulta que se aplica con esta herramienta.
  //
  // La OTRA capa —no tocar dos veces a la MISMA persona el mismo dia— no es este cubo: es la clave
  // unica del aviso, y tiene que serlo, porque un cubo por emisor no sabe a quien esta tocando.
  TOQUE_PER_USER: { limit: TOQUE_MAX_DIA, windowMs: 24 * 60 * 60 * 1000 },
  // Denunciar: no frena el abuso —eso lo hace el UNIQUE por denunciante y objeto—, sino que nadie
  // recorra el feed denunciándolo entero. Holgado: denunciar de verdad varias cosas seguidas es
  // legítimo y no puede costarle un rechazo a quien está limpiando su feed.
  DENUNCIAR_PER_USER: { limit: 30, windowMs: 15 * 60 * 1000 }, // 30 / 15 min por usuario
  // Crear reto (admin): el procesado de la portada cuesta CPU/memoria -> mismo trato que el avatar.
  CREAR_RETO_PER_USER: { limit: 20, windowMs: 15 * 60 * 1000 }, // 20 / 15 min por usuario
  // Proponer un reto (empresa, Fase 9 · P3): procesa un logo como crear, y además el tope de
  // propuestas pendientes ya frena la cola. Esto frena el martilleo del formulario.
  PROPONER_RETO_PER_USER: { limit: 10, windowMs: 15 * 60 * 1000 }, // 10 / 15 min por usuario
  // Crear una campaña de publicidad (empresa, Fase 9 · P6): procesa una imagen, como proponer.
  CREAR_PUBLICIDAD_PER_USER: { limit: 20, windowMs: 15 * 60 * 1000 }, // 20 / 15 min por usuario
  // Activar, pausar, reanudar, terminar o borrar una campaña: cada una abre una transacción que ocupa
  // o libera calendario. Holgado para el uso normal; frena el martilleo de un botón.
  ACCION_PUBLICIDAD_PER_USER: { limit: 60, windowMs: 15 * 60 * 1000 }, // 60 / 15 min por usuario
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
export const WalletStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  // Entre "aprobada" y "pagada": el admin ya ha lanzado la transferencia y esta en vuelo. Existe
  // porque sin el no hay forma de distinguir "aun no la he mandado" de "mandada, esperando" — y esa
  // es justo la pregunta que se hace quien reclama que no le ha llegado.
  "PROCESSING",
  "PAID",
  "REJECTED",
  "COMPLETED",
]);
export type WalletStatus = z.infer<typeof WalletStatusSchema>;

/** Tipo de movimiento de monedero. */
export const WalletEntryTypeSchema = z.enum(["CREDIT", "DEBIT"]);
export type WalletEntryType = z.infer<typeof WalletEntryTypeSchema>;

/** Ciclo de vida de un reto. */
export const ChallengeStatusSchema = z.enum(["DRAFT", "PUBLISHED", "CLOSED"]);
export type ChallengeStatus = z.infer<typeof ChallengeStatusSchema>;

/**
 * POR QUE cerro un reto (columna `Challenge.motivoCierre`). Existe porque "cerro sin ganador" NO se
 * deduce de que no haya `ChallengeResult`: hay cuatro formas de acabar sin ganador y significan cosas
 * distintas. La semantica de cada valor vive junto a la decision, en `src/lib/cierre-reto.ts`.
 */
export const MotivoCierreSchema = z.enum(["CON_GANADORES", "SIN_MINIMO", "EMPATE_PENDIENTE"]);
export type MotivoCierre = z.infer<typeof MotivoCierreSchema>;

/**
 * Tipos de NOTIFICACION (Fase 4 · Pieza 6). Unión CERRADA: cada tipo cuelga del sitio donde ocurre su
 * hecho, y no hay ninguno sin emisor: un tipo que nadie emite sería una promesa que el sistema no
 * cumple. COMENTARIO llegó con los comentarios (Fase 2): lo emite `publicarComentario`, en la misma
 * transacción que el comentario.
 */
export const TipoNotificacionSchema = z.enum([
  "VIDEO_LISTO",
  "VIDEO_FALLIDO",
  "VOTO_RECIBIDO",
  "GANASTE_RETO",
  "TOP20",
  "SUBISTE_NIVEL",
  // Anuncio del admin (panel). El texto NO va en el aviso: vive en `Announcement` y se une por refId.
  "ANUNCIO",
  // Alguien comentó tu vídeo. Uno por COMENTARIO (clave refId = el comentario).
  "COMENTARIO",
  // AL EQUIPO, no al usuario: el umbral de denuncias ha escondido algo y hay que mirarlo. Es el
  // unico aviso que va en esta direccion —el resto son "te ha pasado esto a ti"— y por eso lleva
  // su propio tipo en vez de colarse como un ANUNCIO: un anuncio lo escribe una persona.
  "CONTENIDO_AUTO_OCULTO",
  // Alguien VIP te ha dado un toque (Fase 8 · P4). Es el unico aviso que nace de que otra persona
  // decida mandartelo, sin nada de por medio —ni un video, ni un voto, ni un reto—, y por eso su
  // clave lleva el DIA dentro: ver `avisoToque`.
  "TOQUE",
]);
export type TipoNotificacion = z.infer<typeof TipoNotificacionSchema>;

/** A qué apunta un aviso: la mitad de su clave de unicidad (userId, tipo, refType, refId). */
export const RefNotificacionSchema = z.enum([
  "VIDEO",
  "VOTO",
  "CHALLENGE",
  "NIVEL",
  "ANUNCIO",
  "COMMENT",
  // El toque no apunta a ningun objeto: apunta a QUIEN lo manda (mas el dia, ver `avisoToque`).
  "USER",
]);
export type RefNotificacion = z.infer<typeof RefNotificacionSchema>;

/** Avisos que enseña el desplegable de la campana (decisión de producto). */
export const NOTIF_DESPLEGABLE = 6;
/** Página de /notificaciones: 3 columnas x 6 filas en escritorio, paginada, sin scroll infinito. */
export const NOTIF_PAGINA = 18;
/** Tope del contador de no-leídas: por encima se pinta "99+" y no se cuenta más allá. */
export const NOTIF_NO_LEIDAS_TOPE = 99;
/** Ids que admite de una vez "marcar como leídas" (el desplegable manda 6; la página, 18). */
export const NOTIF_MARCAR_MAX = 50;
/**
 * Cada cuánto repide el navegador el CONTADOR de no-leídas mientras la pestaña está VISIBLE (oculta, no
 * sondea). Un minuto: un aviso tarda como mucho eso en asomar en el badge, y cuesta un COUNT indexado
 * por pestaña y minuto. Además se cuenta al volver a la pestaña, que es cuando más importa.
 */
export const NOTIF_SONDEO_MS = 60_000;
/** Mínimo entre dos recuentos seguidos: `focus` y `visibilitychange` llegan juntos al volver. */
export const NOTIF_SONDEO_MIN_ENTRE_MS = 10_000;

/**
 * Participaciones que enseña la tarjeta "Interacción por participación" del panel: las más votadas,
 * hasta aquí. Es una tarjeta de la rejilla de estadísticas, no la lista: la lista completa (paginada
 * por keyset) es la tabla de participaciones de la misma pantalla.
 */
export const PANEL_INTERACCION_TOPE = 8;

/**
 * ANUNCIOS del panel. Su texto es el ÚNICO texto libre del sistema de avisos: vive en `Announcement`
 * y cada aviso lo une por su refId al leer (no se copia en cada fila).
 */
export const ANUNCIO_TEXTO_MIN = 3;
export const ANUNCIO_TEXTO_MAX = 500;
/** A quién va un anuncio. Hoy solo TODOS (cuentas reales: ni borradas ni baneadas). Crece con la segmentación. */
export const AudienciaAnuncioSchema = z.enum(["TODOS"]);
export type AudienciaAnuncio = z.infer<typeof AudienciaAnuncioSchema>;
/**
 * REPARTO (job FANOUT_ANUNCIO): cuentas por lote (un SELECT por keyset + un INSERT IGNORE del lote) y
 * lotes por ejecución del job. 500 x 20 = 10.000 avisos por ejecución, muy por dentro del timeout de
 * un handler (60 s); si queda audiencia, el job encola su continuación con el cursor.
 */
export const FANOUT_LOTE = 500;
export const FANOUT_LOTES_POR_EJECUCION = 20;
/** Páginas del panel de notificaciones (keyset): anuncios enviados e inspector. */
export const ANUNCIOS_PAGINA = 10;
/**
 * Refresco del PROGRESO de los anuncios que se están REPARTIENDO (panel), con la pestaña a la vista.
 * Más ágil que el del número de avisos (60 s): aquí hay alguien mirando un reparto en marcha, y el
 * sondeo se apaga solo en cuanto ninguno está repartiendo. Al volver a la pestaña, en el acto si han
 * pasado al menos `ANUNCIOS_SONDEO_MIN_ENTRE_MS`.
 */
export const ANUNCIOS_SONDEO_MS = 10_000;
export const ANUNCIOS_SONDEO_MIN_ENTRE_MS = 3_000;

/**
 * COMENTARIOS (Fase 2). El tope de longitud es el de la columna (VarChar 300): lo bastante para decir
 * algo, lo bastante corto para que el panel del feed no se convierta en un foro. Se cuenta en unidades
 * de JS, que es MÁS estricto que MariaDB con los emojis: nada que la caja deje pasar lo rechaza la BD.
 */
export const COMENTARIO_TEXTO_MAX = 300;
/** Comentarios por página en el panel (keyset). */
export const COMENTARIOS_PAGINA = 20;
/** Quién retiró un comentario. AUTOR hoy; MODERACION llega con la Fase 5 (el campo ya lo admite). */
export const RetiradaComentarioSchema = z.enum(["AUTOR", "MODERACION"]);
export type RetiradaComentario = z.infer<typeof RetiradaComentarioSchema>;
export const INSPECTOR_NOTIF_PAGINA = 25;

/**
 * Cada cuanto barre el worker los retos vencidos sin cerrar. Un reto se cierra por el RELOJ, asi que
 * el retraso maximo entre el deadline y el cierre es esta cadencia. Cinco minutos: lo bastante fino
 * para que nadie mire un reto vencido y lo vea abierto un rato largo, y lo bastante grueso para que la
 * consulta —indexada por [status, deadline]— no pese nada aunque no haya nada que cerrar.
 */
export const RETO_CIERRE_CADENCIA_MS = 5 * 60_000;

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

/** Tipo de entidad denunciada. COMMENT: los comentarios ya existen; su moderación es la Fase 5. */
export const ReportTargetTypeSchema = z.enum([
  "VIDEO",
  "SUBMISSION",
  "USER",
  "COMMENT",
  // Fase 9 · P8: una campaña de publicidad (la pieza que se sirve en el feed y la portada).
  "PUBLICIDAD",
]);
export type ReportTargetType = z.infer<typeof ReportTargetTypeSchema>;

/**
 * Lo que HOY se puede denunciar de verdad: un vídeo del feed y un comentario. El tipo de la fila
 * admite más (`SUBMISSION`, `USER`), pero nada los crea ni sabe resolverlos, y aceptar del cliente un
 * tipo que el servidor no comprueba contra un objeto real sería abrir denuncias contra la nada.
 * Cuando se construya la denuncia de un perfil, entra aquí y trae su comprobación.
 */
export const ReportTargetDenunciableSchema = z.enum(["VIDEO", "COMMENT", "PUBLICIDAD"]);
export type ReportTargetDenunciable = z.infer<typeof ReportTargetDenunciableSchema>;

/**
 * LO QUE DECIDE LA COLA DE MODERACIÓN (`/panel/moderacion`, MODERATOR): vídeos y comentarios. La
 * PUBLICIDAD se denuncia igual, pero NO entra aquí: la decide el ADMIN en `/panel/publicidad` (Fase 9 ·
 * P8), porque retirar una campaña manda un correo a una empresa y libera plazas vendidas —una decisión
 * comercial—. Las rutas de la cola validan contra ESTA unión, no contra la de denunciables: si no, un
 * moderador podría retirar una campaña por la puerta de los vídeos.
 */
export const ReportTargetModerableSchema = z.enum(["VIDEO", "COMMENT"]);
export type ReportTargetModerable = z.infer<typeof ReportTargetModerableSchema>;

/**
 * POR QUÉ se denuncia. Tipado, nunca texto libre: el moderador filtra y agrupa por esto, y un campo
 * libre además invitaría a escribir datos personales en una tabla que leerá otra gente.
 * `OTRO` existe para no obligar a mentir cuando no encaja ninguno, y es el último a propósito.
 */
export const ReportReasonSchema = z.enum([
  "SPAM",
  "SEXUAL",
  "VIOLENCIA",
  "ACOSO",
  "MENORES",
  "DERECHOS",
  "OTRO",
]);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

/**
 * El COPY de cada motivo, aquí y no en el diálogo: es lo que lee quien denuncia y lo que verá el
 * moderador, y dos listas acabarían diciendo cosas distintas del mismo motivo. En el ORDEN en que se
 * ofrecen (lo más frecuente arriba; `OTRO` al final).
 */
export const MOTIVOS_DENUNCIA: ReadonlyArray<{ clave: ReportReason; texto: string }> = [
  { clave: "SPAM", texto: "Spam o engaño" },
  { clave: "SEXUAL", texto: "Contenido sexual" },
  { clave: "VIOLENCIA", texto: "Violencia o contenido gráfico" },
  { clave: "ACOSO", texto: "Acoso o incitación al odio" },
  { clave: "MENORES", texto: "Pone en riesgo a un menor" },
  { clave: "DERECHOS", texto: "Usa contenido que no es suyo" },
  { clave: "OTRO", texto: "Otro motivo" },
];

/**
 * Copy de la denuncia. Como el resto de `MSG_*`: lo emite el servidor ya en humano y la UI lo pinta
 * tal cual. `MSG_DENUNCIA_YA` NO es un error: es la respuesta amable a denunciar dos veces lo mismo.
 */
export const MSG_DENUNCIA_GRACIAS = "Gracias por avisar. Lo revisaremos.";
export const MSG_DENUNCIA_YA = "Ya nos habías avisado de esto. Gracias.";
export const MSG_DENUNCIA_PROPIO = "No puedes denunciar tu propio contenido.";
/** Uno solo para "no existe" y "ya no se ve": dos textos serían un oráculo (ver `MSG_NO_DISPONIBLE`). */
export const MSG_DENUNCIA_NO_DISPONIBLE = "Este contenido ya no está disponible.";
/** La misma barrera antifraude que votar o comentar. */
export const MSG_DENUNCIA_SIN_VERIFICAR = "Verifica tu correo para poder denunciar.";

/**
 * GOBIERNO DE CUENTAS — lo que queda escrito en `AuditLog` cuando se toca una cuenta. Unión cerrada
 * porque el panel la va a leer y a traducir: una acción nueva sin su copy saldría como un código.
 * El `targetType` de esas filas es "USER" y el `actorId`, quien la ejecutó.
 */
export const AuditAccionCuentaSchema = z.enum(["ROLE_CHANGE", "BAN", "UNBAN", "EMAIL_VIEW"]);
export type AuditAccionCuenta = z.infer<typeof AuditAccionCuentaSchema>;

/**
 * LISTADO DE CUENTAS (/panel/usuarios). Tamaño de página del keyset: suficiente para hojear sin que
 * una sola carga traiga medio censo.
 */
export const CUENTAS_PAGINA = 25;

/** Copy del listado y de la ficha. En humano, como el resto del panel. */
export const MSG_EMAIL_NO_DISPONIBLE = "Esta cuenta no tiene ninguna dirección registrada.";
/** El correo es del superadmin: moderar es contenido, no datos personales de una cuenta. */
export const MSG_SIN_PERMISO_EMAIL =
  "Solo el administrador puede consultar el correo de una cuenta.";

/**
 * Copy del gobierno de cuentas. En humano aunque hoy no haya pantalla: la respuesta de la API ya lleva
 * el texto que se pintará (convención de `error.message`), y un "FORBIDDEN" no se le enseña a nadie.
 */
export const MSG_CUENTA_NO_ENCONTRADA = "No encontramos esa cuenta.";
export const MSG_ROL_INVALIDO = "Elige un rol válido.";
export const MSG_ROL_NO_PERMITIDO = "No puedes cambiar el rol de esta cuenta.";
export const MSG_SIN_PERMISO_ROLES = "Solo el administrador puede asignar roles.";
export const MSG_SUSPENDER_NO_PERMITIDO = "Solo se puede suspender una cuenta de usuario.";
export const MSG_SIN_PERMISO_MODERAR = "No tienes permiso para moderar cuentas.";

/**
 * Copy de la COLA DE MODERACIÓN. En humano: el moderador lee "Retirado", nunca `RESOLVED`, `REMOVED`
 * ni `DISMISSED`. Lo emite el servidor y la pantalla lo pinta tal cual.
 */
export const MSG_SIN_PERMISO_COLA = "No tienes permiso para moderar contenido.";
export const MSG_MODERACION_RETIRADO = "Retirado. Ya no se ve en ningún sitio.";
export const MSG_MODERACION_DESCARTADO = "Descartado. El contenido se queda como está.";
export const MSG_MODERACION_SIN_CAMBIOS = "No había nada que cambiar.";
export const MSG_MODERACION_NO_ENCONTRADO = "Ese contenido ya no está.";
/** Cuántas filas de la cola se sirven por página en el panel. */
export const COLA_MODERACION_PAGINA = 20;

/**
 * CUANTAS DENUNCIAS ABIERTAS OCULTAN UN CONTENIDO AUTOMATICAMENTE, sin que lo mire nadie.
 *
 * SON TRES PERSONAS DISTINTAS Y VERIFICADAS, no tres clics: el `@@unique` de `Report` impide que
 * una misma cuenta cuente dos veces por el mismo objeto, y la ingesta ya exige correo verificado.
 * Las dos cosas juntas son lo que hace que el umbral no sea un arma entre rivales — sin ellas,
 * dos cuentas desechables coordinadas tumbarian la participacion de un competidor en un reto con
 * premio.
 *
 * ES UNA RED DE SEGURIDAD, NO UN VEREDICTO: oculta PROVISIONALMENTE y siempre queda pendiente de
 * que un moderador confirme o descarte. Y va en UNA DIRECCION — nada lo levanta solo (ver
 * `lib/umbral-ocultado`).
 */
export const DENUNCIAS_PARA_OCULTAR = 3;

/**
 * CUANTO DURA LA INMUNIDAD DE UN CONTENIDO QUE UN MODERADOR YA ABSOLVIO.
 *
 * EL AGUJERO QUE TAPA: tras un descarte, tres denuncias NUEVAS volvian a esconder lo mismo. Como
 * `Report` tiene UNIQUE por (denunciante, objeto), los tres de la primera ronda ya no pueden
 * volver a denunciar — hacen falta tres cuentas NUEVAS y verificadas cada vez—, pero eso es un
 * coste, no una barrera: un grupo decidido re-esconde indefinidamente algo que un humano ya miro.
 *
 * POR QUE CON PLAZO Y NO PARA SIEMPRE: el acoso coordinado es una RAFAGA, no un estado. Un candado
 * permanente cerraria ese vector pero dejaria el objeto sin red de seguridad el resto de su vida —
 * y seis meses despues el contexto puede haber cambiado. El plazo cierra la rafaga y devuelve la
 * red cuando el ataque coordinado ya no es plausible.
 *
 * DURANTE LA INMUNIDAD NO SE DEJA DE DENUNCIAR: las denuncias se registran y el objeto vuelve a la
 * COLA, asi que un humano puede actuar en cualquier momento. Lo unico que no pasa es el ocultado
 * AUTOMATICO. La red que se suspende es la que no tiene juicio; la que si lo tiene sigue puesta.
 */
export const INMUNIDAD_TRAS_DESCARTE_DIAS = 30;
export const INMUNIDAD_TRAS_DESCARTE_MS = INMUNIDAD_TRAS_DESCARTE_DIAS * 24 * 60 * 60 * 1000;

/** Estado de un job de la cola. */
export const JobStatusSchema = z.enum(["PENDING", "RUNNING", "DONE", "FAILED"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** Tipos de job previstos. */
export const JobTypeSchema = z.enum([
  "BOOST_EXPIRY",
  // Aqui habia un "CHALLENGE_CLOSE". Se retira por la MISMA razon que se retiro "RETENTION_PURGE":
  // no tiene handler ni llamante, y dejarlo sugiere un mecanismo que no existe. El cierre de retos NO
  // es un job encolado sino un BARRIDO del worker (ver `cerrarRetosVencidos`), igual que el consumo de
  // borrados: encolar un job al crear el reto obligaria a re-encolarlo si cambia el deadline y a
  // limpiarlo si el reto se borra, mientras que el barrido se limita a mirar el reloj y es
  // auto-reparable — si una vuelta se pierde, la siguiente lo recoge.
  //
  // Y aqui habia un "RANKING_RESET", retirado por el mismo criterio y con un motivo AÑADIDO: con el
  // ranking mensual materializado, el periodo es la CLAVE de la fila (`RankingMensual.periodo`,
  // `YYYY-MM` en UTC). Un mes nuevo son filas nuevas, asi que no hay nada que reiniciar — no es que
  // el job estuviera sin escribir, es que el diseño lo dejo sin sentido. Si algun dia hay premios de
  // ranking mensual, eso es un OTORGAMIENTO (que si necesitaria su job), no un reinicio.
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
  // Reparto de un anuncio del panel: INSERT IGNORE por lotes sobre la UNIQUE de Notification. Escribe
  // en NUESTRA BD y es idempotente de verdad -> REQUEUE. Se reanuda por tramos, con el cursor en el payload.
  "FANOUT_ANUNCIO",
  // Avisa al equipo de que el umbral de denuncias ha escondido algo. VA POR LA COLA y no inline a
  // proposito: son N escrituras (una por moderador) y un fallo suyo NO puede tumbar el ocultado,
  // que es lo que de verdad protege. Escribe en NUESTRA BD con INSERT IGNORE sobre la UNIQUE de
  // Notification -> idempotente de verdad -> REQUEUE.
  "AVISO_AUTO_OCULTO",
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

// ============================================================================
// PORTAL DE EMPRESA (Fase 9 · P1)
// ============================================================================

/**
 * QUIEN FIRMA la cuenta. No cambia permisos —los permisos son del `User` que la posee—: cambia el
 * formulario y, el dia que exista la factura, a nombre de quien se emite.
 */
export const TipoCuentaEmpresaSchema = z.enum(["EMPRESA", "MARCA_PERSONAL"]);
export type TipoCuentaEmpresa = z.infer<typeof TipoCuentaEmpresaSchema>;

/**
 * QUE CLASE DE NEGOCIO es, y con ello QUE PUEDE COMPRAR (ver `ALCANCES_POR_NEGOCIO` y
 * `lib/empresa`). Un negocio FISICO es el unico que compra el espacio LOCAL; una marca personal o un
 * producto digital no tienen "una ciudad", asi que solo pueden comprar Pais o Global.
 */
export const TipoNegocioSchema = z.enum(["FISICO", "ONLINE", "MARCA_O_DIGITAL"]);
export type TipoNegocio = z.infer<typeof TipoNegocioSchema>;

/**
 * ESTADO de la cuenta de empresa. Aqui el estado SI manda (es la decision de una persona, no el
 * vencimiento de un reloj como en `Subscription`). SUSPENDIDA la escribira la moderacion posterior
 * (P8): esta en la union porque el catalogo de estados se decidio entero, no porque P1 la use.
 */
export const EstadoEmpresaSchema = z.enum(["PENDIENTE", "VERIFICADA", "RECHAZADA", "SUSPENDIDA"]);
export type EstadoEmpresa = z.infer<typeof EstadoEmpresaSchema>;

/** Los cuatro alcances que se podran comprar (los consume P6; la REGLA de quien puede, ya en P1). */
export const AlcancePublicidadSchema = z.enum(["CIUDAD", "ESTADO", "PAIS", "GLOBAL"]);
export type AlcancePublicidad = z.infer<typeof AlcancePublicidadSchema>;

/**
 * LOS DOS ESPACIOS del feed, nombrados por lo que significan y no por su numero: "Espacio 2" en un
 * `if` no se lee. Cada hueco del feed alterna espacio, asi que cada uno se lleva la mitad del
 * inventario sea cual sea la demanda del otro — que es lo unico que hace que "dos espacios
 * separados" signifique algo.
 */
export const EspacioPublicidadSchema = z.enum(["LOCAL", "GLOBAL"]);
export type EspacioPublicidad = z.infer<typeof EspacioPublicidadSchema>;

/**
 * QUE ALCANCES PUEDE COMPRAR CADA TIPO DE NEGOCIO. Es un CATALOGO de producto (de ahi que viva
 * aqui); la funcion que lo aplica es `alcancesPermitidos` en `lib/empresa`, pura y con test.
 *
 * Consecuencia que conviene ver ahora y no en produccion: solo el negocio FISICO compra el espacio
 * LOCAL. Con el inventario actual, ese espacio lo va a cubrir el anuncio de la casa una buena
 * temporada, y eso no es un fallo del reparto: es el inventario que hay.
 */
export const ALCANCES_POR_NEGOCIO: Record<TipoNegocio, readonly AlcancePublicidad[]> = {
  FISICO: ["CIUDAD", "ESTADO"],
  ONLINE: ["PAIS", "GLOBAL"],
  MARCA_O_DIGITAL: ["PAIS", "GLOBAL"],
};

/**
 * POR QUE se rechaza una empresa. Lista CERRADA porque ESTE motivo SI se le enseña al dueño: un
 * rechazo sin motivo genera un correo de soporte por cada caso. Lo que no viaja nunca es la NOTA
 * interna (ver `Empresa.notaInterna`), que es para el equipo.
 */
export const MotivoRechazoEmpresaSchema = z.enum([
  "DATOS_INSUFICIENTES",
  "WEB_NO_VALIDA",
  "ACTIVIDAD_NO_PERMITIDA",
  "SOSPECHA_FRAUDE",
  "DUPLICADA",
]);
export type MotivoRechazoEmpresa = z.infer<typeof MotivoRechazoEmpresaSchema>;

/** El copy del motivo, en humano y en segunda persona: es lo que lee quien se ha registrado. */
export const MSG_MOTIVO_RECHAZO_EMPRESA: Record<MotivoRechazoEmpresa, string> = {
  DATOS_INSUFICIENTES: "Nos faltan datos para comprobar que el negocio existe.",
  WEB_NO_VALIDA: "No hemos podido comprobar la web que nos has dado.",
  ACTIVIDAD_NO_PERMITIDA: "Esta actividad no encaja con lo que podemos publicar.",
  SOSPECHA_FRAUDE: "No hemos podido verificar la cuenta.",
  DUPLICADA: "Ya tenemos registrado este negocio.",
};

/**
 * LAS ETIQUETAS, en un solo sitio porque las usan DOS pantallas: el portal (lo que lee la empresa de
 * sí misma) y el panel (lo que lee el equipo). Dos copias habrían divergido en el primer cambio de
 * copy, y entonces el panel y el portal llamarían distinto a lo mismo.
 */
export const ETIQUETA_TIPO_CUENTA: Record<TipoCuentaEmpresa, string> = {
  EMPRESA: "Empresa",
  MARCA_PERSONAL: "Marca personal",
};
export const ETIQUETA_TIPO_NEGOCIO: Record<TipoNegocio, string> = {
  FISICO: "Negocio físico",
  ONLINE: "Negocio online",
  MARCA_O_DIGITAL: "Marca o producto digital",
};
/** Una palabra para el estado (la lista del panel y la píldora del portal). El relato va en `MSG_ESTADO_EMPRESA`. */
export const ETIQUETA_ESTADO_EMPRESA: Record<EstadoEmpresa, string> = {
  PENDIENTE: "Pendiente",
  VERIFICADA: "Verificada",
  RECHAZADA: "Rechazada",
  SUSPENDIDA: "Suspendida",
};

/**
 * Lo que queda escrito en `AuditLog` al tocar una empresa. Su `targetType` es "EMPRESA".
 *
 * `EMPRESA_FISCAL_VIEW` no es un cambio: es el ACTO DE MIRAR la identificación fiscal, como
 * `EMAIL_VIEW` lo es de mirar un correo. Se anota QUE se miró y QUIÉN, nunca el valor — duplicar
 * el dato en la tabla de auditoría multiplicaría el problema que el registro existe para vigilar.
 *
 * `EMPRESA_CREDITOS_AJUSTE` (Fase 9 · P4): el admin movió a mano los créditos de publicidad. El POR
 * QUÉ va en la fila del ledger (`CreditoLedger.nota`); aquí, quién, cuánto y qué movimiento fue.
 */
export const AuditAccionEmpresaSchema = z.enum([
  "EMPRESA_VERIFY",
  "EMPRESA_REJECT",
  "EMPRESA_FISCAL_VIEW",
  "EMPRESA_CREDITOS_AJUSTE",
]);
export type AuditAccionEmpresa = z.infer<typeof AuditAccionEmpresaSchema>;

/**
 * LOS PAISES, en ISO 3166-1 alpha-2. Solo los CODIGOS: el nombre lo pone `Intl.DisplayNames` en el
 * idioma de quien mira (ver `lib/paises`), asi que no hay una lista de 250 nombres que mantener,
 * traducir ni revisar — y el dia que la app hable otro idioma, los paises ya lo hablan.
 *
 * Estan los 249 codigos asignados, sin recortes. Quitar "los que no tienen negocios" obliga a
 * defender cada ausencia y acaba con alguien pidiendo el suyo por soporte.
 */
export const PAISES_ISO = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
] as const;
export type PaisIso = (typeof PAISES_ISO)[number];

/** Limites del formulario de alta. Lo OBLIGATORIO: nombre, país, persona de contacto, y web O redes. */
export const EMPRESA_NOMBRE_MIN = 2;
export const EMPRESA_NOMBRE_MAX = 120;
export const EMPRESA_WEB_MAX = 300;
export const EMPRESA_REDES_MAX = 300;
export const EMPRESA_DIRECCION_MAX = 200;
export const EMPRESA_CIUDAD_MAX = 120;
export const EMPRESA_CONTACTO_MIN = 2;
export const EMPRESA_CONTACTO_MAX = 120;
/** La identificacion fiscal es TEXTO: no hay un formato que valga para un NIF, un RUT y un RFC. */
export const EMPRESA_FISCAL_MAX = 60;
/** MISMO LARGO que la nota del ajuste de puntos: es la misma clase de dato y el mismo gesto. */
export const EMPRESA_NOTA_MAX = 500;

/** Tamaño de pagina de la cola de verificacion del panel (keyset, como el resto). */
export const EMPRESAS_PAGINA = 25;

/**
 * LO QUE DICE LA PANTALLA TRAS UN ALTA — y es VERDAD en los dos casos.
 *
 * La regla: ninguna pantalla afirma algo que el servidor no sabe que es verdad. Antes, tras un alta
 * con un correo que ya tenía cuenta, la pantalla decía que habíamos enviado un enlace de
 * verificación y no habíamos enviado nada (lo encontró Junior en producción). Ahora SIEMPRE sale un
 * mensaje hacia esa dirección —la verificación si es nueva, el aviso «ya tienes cuenta» si no
 * (`services/aviso-cuenta-existente`)— y la frase dice solo eso: que hay un mensaje, no cuál.
 *
 * No dice «registrada» ni «enviado el enlace de verificación»: cualquiera de las dos sería mentira en
 * uno de los dos casos, y distinguirlos en pantalla sería el oráculo de enumeración que el alta
 * evita. La API devuelve el MISMO texto, para que no haya dos versiones de la verdad.
 */
export const MSG_REVISA_CORREO_REGISTRO =
  "Revisa tu correo. Te hemos enviado un mensaje para continuar con tu registro.";
export const MSG_REVISA_CORREO_EMPRESA =
  "Revisa tu correo. Te hemos enviado un mensaje para continuar con el registro de tu empresa.";

/**
 * EL CANDADO: una cuenta de empresa MIRA Y NO PARTICIPA. Lo aplica `mutatingRoute` (una sola
 * puerta, no un `if` por pantalla), así que este texto sale para cualquier intento: subir, votar,
 * comentar, dar like, denunciar, comprar Boost o VIP, cobrar.
 *
 * DICE QUÉ HACER, no solo que no. Quien lee esto suele ser alguien que quería participar y se
 * registró por el camino equivocado: la salida es una cuenta normal, con otro correo.
 */
export const MSG_CUENTA_EMPRESA_NO_PARTICIPA =
  "Esta es una cuenta de empresa: puede mirarlo todo, pero no participar. Si quieres subir vídeos y competir, crea una cuenta normal con otro correo.";

/**
 * La línea CORTA que sustituye a un control de participación cuando una empresa mira una página
 * compartida (Fase 9, P2): en el sitio de la caja de comentar, o del botón "Participar" de un reto.
 * Corta porque va en el hueco de un control, no en un aviso; la larga, de arriba, es la del 403.
 */
export const MSG_EMPRESA_SOLO_MIRA = "Las cuentas de empresa no participan.";

/** Copy del portal y del panel de empresas. En humano, como el resto. */
export const MSG_EMPRESA_SIN_VERIFICAR =
  "Verifica tu correo para entrar al portal. Es la misma barrera que protege todo lo que tiene efectos.";
export const MSG_EMPRESA_DATOS_INVALIDOS =
  "Revisa los datos: faltan el nombre, el país o la persona de contacto, o la web no es una dirección válida.";
/**
 * «Web O redes, al menos uno». Son los dos datos con los que el admin verifica que el negocio
 * existe, y hay negocios —y marcas personales— sin web y con 50.000 seguidores.
 */
export const MSG_EMPRESA_WEB_O_REDES =
  "Déjanos tu web o tus redes: con uno de los dos nos basta para comprobar que existís.";
/**
 * POR QUÉ EL ALTA DE EMPRESA PIDE UN CORREO NUEVO, contado ANTES de intentarlo.
 *
 * Va en el formulario, visible siempre, y NO como respuesta al envío: responder «ese correo ya
 * tiene cuenta» convertiría el alta en un oráculo que confirma qué direcciones existen, que es
 * justo lo que el registro de participante evita costando lo mismo exista la cuenta o no.
 */
export const MSG_EMPRESA_CORREO_NUEVO =
  "Usa un correo que no tenga ya cuenta en DareFlash: una cuenta de empresa no participa, así que no se puede convertir una cuenta de participante en una.";
export const MSG_EMPRESA_NO_ENCONTRADA = "Esa empresa no existe.";
export const MSG_SIN_PERMISO_EMPRESAS = "No tienes permiso para gestionar empresas.";
export const MSG_EMPRESA_MOTIVO_INVALIDO = "Elige un motivo de la lista para rechazar.";

/**
 * EL ESTADO, CONTADO AL DUEÑO. Un estado que el portal no sabe explicar es un estado que genera un
 * correo preguntando. El motivo del rechazo se añade aparte (`MSG_MOTIVO_RECHAZO_EMPRESA`): aqui va
 * lo que significa el estado, no el caso concreto.
 */
export const MSG_ESTADO_EMPRESA: Record<EstadoEmpresa, { titulo: string; cuerpo: string }> = {
  PENDIENTE: {
    titulo: "Estamos revisando tu empresa",
    cuerpo:
      "La revisamos a mano, una por una. Te escribimos en cuanto esté: no hace falta que vuelvas a enviarla.",
  },
  VERIFICADA: {
    titulo: "Tu empresa está verificada",
    cuerpo: "Ya puedes usar el portal. Lo que se puede hacer desde aquí irá creciendo.",
  },
  RECHAZADA: {
    titulo: "No hemos podido verificar tu empresa",
    cuerpo: "Si crees que es un error, escríbenos y lo miramos otra vez.",
  },
  SUSPENDIDA: {
    titulo: "Tu empresa está suspendida",
    cuerpo: "Puedes seguir viendo tus datos, pero no crear nada nuevo. Escríbenos y lo revisamos.",
  },
};

/**
 * EL AVISO AL ADMIN de que hay una empresa esperando. Es de los que SI exigen algo: bloquea a un
 * cliente que ya se ha registrado, asi que sale inmediato y no en el resumen diario.
 *
 * NO LLEVA NI UN DATO FISCAL NI EL EMAIL DE NADIE: nombre comercial, tipo y un enlace al panel, que
 * es donde se mira con una sesion. Un correo automatico no puede ser la rendija por la que sale lo
 * que el panel protege.
 */
export const TITULO_AVISO_EMPRESA_NUEVA = "Hay una empresa esperando verificación";
export function msgAvisoEmpresaNueva(datos: {
  nombre: string;
  tipoNegocio: TipoNegocio;
  urlPanel: string;
}): string {
  // La ETIQUETA y no el valor del enum: el correo lo lee una persona, y «(FISICO)» —lo que salía
  // antes, visto en el buzón de pruebas— es un dato de la base de datos, no una frase.
  return [
    `${datos.nombre} se ha registrado como empresa (${ETIQUETA_TIPO_NEGOCIO[datos.tipoNegocio].toLowerCase()}) y espera verificación.`,
    "",
    `Revísala aquí: ${datos.urlPanel}`,
    "",
    "Mientras no esté verificada, no puede hacer nada en el portal.",
  ].join("\n");
}

// ----------------------------------------------------------------------------
// RETOS PATROCINADOS PROPUESTOS DESDE EL PORTAL (Fase 9 · P3)
// ----------------------------------------------------------------------------

/**
 * La vida de una propuesta. PENDIENTE -> APROBADA | RECHAZADA | CADUCADA, y ahí se queda: una
 * rechazada o caducada se corrige proponiendo otra. Lo que pasa DESPUÉS de aprobar (borrador,
 * publicado) no es un estado de la propuesta sino del reto que nació de ella, y se calcula leyéndolo
 * (`estadoVisibleSolicitud`).
 *
 * CADUCADA: el cierre propuesto pasó sin que se decidiera (ya no se puede aprobar). Se CALCULA desde
 * el momento en que pasa —una PENDIENTE con el cierre vencido ya es caducada para todo el mundo—, y
 * el barrido horario lo CONSOLIDA en la columna y avisa a la empresa. El estado visible no espera al
 * barrido: mismo principio que el resto del producto (se calcula, el job solo consolida).
 */
export const EstadoRetoSolicitudSchema = z.enum(["PENDIENTE", "APROBADA", "RECHAZADA", "CADUCADA"]);
export type EstadoRetoSolicitud = z.infer<typeof EstadoRetoSolicitudSchema>;

/**
 * POR QUÉ se rechaza una propuesta. Lista CERRADA porque ESTE motivo SÍ se le enseña a la empresa,
 * como el de la verificación: un rechazo sin motivo es un correo de soporte por cada caso. La nota
 * interna del equipo no viaja nunca.
 */
export const MotivoRechazoRetoSchema = z.enum([
  "FECHAS_NO_VIABLES",
  "PREMIO_NO_ADECUADO",
  "CONTENIDO_NO_PERMITIDO",
  "DATOS_INSUFICIENTES",
  "DUPLICADA",
]);
export type MotivoRechazoReto = z.infer<typeof MotivoRechazoRetoSchema>;

/** En humano y en segunda persona: lo lee la empresa, en su portal y en el correo. */
export const MSG_MOTIVO_RECHAZO_RETO: Record<MotivoRechazoReto, string> = {
  FECHAS_NO_VIABLES: "Las fechas no nos dan tiempo a prepararlo y difundirlo bien.",
  PREMIO_NO_ADECUADO: "El premio no encaja con lo que suele mover un reto así.",
  CONTENIDO_NO_PERMITIDO: "El reto pide algo que no podemos publicar.",
  DATOS_INSUFICIENTES: "Nos falta información para entender qué tiene que hacer la gente.",
  DUPLICADA: "Ya tenemos una propuesta igual de tu empresa.",
};

/**
 * Lo que la EMPRESA ve de cada propuesta, en una palabra. Va más allá de los tres estados porque
 * "aprobada" no le dice si ya se puede participar: eso lo decide el reto (borrador o publicado).
 */
export type EstadoVisibleSolicitud =
  "EN_REVISION" | "RECHAZADA" | "CADUCADA" | "APROBADA" | "PUBLICADA";
export const ETIQUETA_ESTADO_SOLICITUD: Record<EstadoVisibleSolicitud, string> = {
  EN_REVISION: "En revisión",
  RECHAZADA: "Rechazada",
  CADUCADA: "Caducada",
  APROBADA: "Aprobada",
  PUBLICADA: "Publicada",
};
/** La línea que acompaña a cada estado en el portal. */
export const MSG_ESTADO_SOLICITUD: Record<EstadoVisibleSolicitud, string> = {
  EN_REVISION: "La revisamos a mano y te escribimos en cuanto la decidamos.",
  RECHAZADA: "No la hemos podido aprobar.",
  CADUCADA: "Caducada: la fecha del reto ya pasó. Puedes proponerlo de nuevo con otras fechas.",
  // Lo que promete es la regla de `publicarReto`: un reto de empresa no se publica sin el pago.
  APROBADA:
    "Está aprobada. Te escribiremos para organizar el pago, y la publicaremos en cuanto lo recibamos.",
  PUBLICADA: "Está publicada: la gente ya puede participar.",
};

/**
 * Lo que queda en `AuditLog` al decidir una propuesta (`targetType` "RETO_SOLICITUD") y al marcar
 * recibido el pago de un reto de empresa (`targetType` "CHALLENGE": es del reto, no de la propuesta).
 */
export const AuditAccionRetoSolicitudSchema = z.enum([
  "RETO_SOLICITUD_APROBAR",
  "RETO_SOLICITUD_RECHAZAR",
  "RETO_PAGO_RECIBIDO",
]);
export type AuditAccionRetoSolicitud = z.infer<typeof AuditAccionRetoSolicitudSchema>;

/**
 * CUÁNTAS PROPUESTAS PUEDE TENER UNA EMPRESA ESPERANDO A LA VEZ. Es un freno de cola, no dinero:
 * cada propuesta la revisa una persona, y diez seguidas de la misma empresa bloquean la cola de las
 * demás. Se cuenta, no se ocupa (ver `crearSolicitudReto`): en una carrera de dos envíos simultáneos
 * puede colarse una de más, y eso no le cuesta nada a nadie.
 */
export const RETO_SOLICITUDES_PENDIENTES_MAX = 3;
/** Página de la cola del panel y de la lista del portal. */
export const RETO_SOLICITUDES_PAGINA = 25;

/**
 * El aviso INMEDIATO al admin de que hay una propuesta esperando. Mismo criterio que el de la empresa
 * nueva: nombre comercial, título y enlace al panel. Nada que el panel proteja.
 */
export const TITULO_AVISO_RETO_PROPUESTO = "Hay un reto patrocinado esperando revisión";
export function msgAvisoRetoPropuesto(datos: {
  empresa: string;
  titulo: string;
  urlPanel: string;
}): string {
  return [
    `${datos.empresa} ha propuesto un reto patrocinado: «${datos.titulo}».`,
    "",
    `Revísalo aquí: ${datos.urlPanel}`,
    "",
    "No se publica nada hasta que lo apruebes.",
  ].join("\n");
}

/**
 * CÓMO SE PAGA, contado a la EMPRESA (formulario y portal). Copy firmado por el analista.
 *
 * SIN UNA PALABRA SOBRE CÓMO SE REPARTE EL DINERO DENTRO DE DAREFLASH: a la empresa se le dice lo que
 * paga y que quien gane cobra el premio entero, nunca la comisión ni su porcentaje. El desglose vive
 * solo en el panel. Lo vigila `empresa-sin-comisiones`, que censa todo lo que se le enseña o se le
 * escribe a una empresa.
 *
 * Y PROMETE UNA REGLA QUE EL CÓDIGO CUMPLE: "lo publicaremos en cuanto lo recibamos" es
 * `publicarReto`, que no publica un reto de empresa sin `pagoRecibidoEn`.
 */
export const MSG_PAGO_PATROCINIO =
  "El pago se hace por transferencia, fuera de DareFlash. Cuando aprobemos tu reto, te escribiremos para organizarlo, y lo publicaremos en cuanto lo recibamos. Quien gane cobra el premio entero.";

// ----------------------------------------------------------------------------
// Decisiones de Fase 9 YA CERRADAS que consumen piezas posteriores. Viven aqui
// —la fuente unica de umbrales y catalogos— para que subirlas sea cambiar UN
// numero, y no buscarlas repartidas por el codigo.
// ----------------------------------------------------------------------------

/**
 * MAXIMO DE CAMPAÑAS ACTIVAS POR ZONA Y DIA (lo consume P6, que OCUPA la plaza en vez de contarla).
 *
 * El 3 sale del inventario medido: en una ciudad pequeña (≈50 huecos locales al dia) tres campañas
 * dejan ≈17 personas al dia a cada una; con cinco serian 10 y el anuncio pasa a ser un gesto.
 *
 * SE SUBE CUANDO CREZCA EL TRAFICO, igual que los precios: subirlo diluye a todos proporcionalmente
 * y la estimacion que se enseña antes de pagar lo refleja SOLA, porque se calcula con el mismo
 * codigo que reparte. Es un numero, no un rediseño.
 */
export const PUBLICIDAD_MAX_POR_ZONA = 3;

/**
 * SOCIO FUNDADOR: hasta cuando. Toda empresa VERIFICADA antes de este instante recibe el regalo (lo
 * acredita P4, con su ledger y su `idempotencyKey`). SIN CUPO: es una comparacion de fechas contra
 * `Empresa.verificadaEn`, no una plaza que haya que ocupar.
 *
 * LLEVA LA ZONA ESCRITA (+02:00, CEST) Y NO ES UN DESCUIDO: "fin del dia del 30 de junio" sin zona
 * son dos horas de diferencia, y una empresa verificada a las 23:30 de Madrid tiene que entrar. Con
 * el desplazamiento dentro, el instante es exacto y no depende de la zona del servidor.
 */
export const SOCIO_FUNDADOR_HASTA_ISO = "2027-06-30T23:59:59.999+02:00";
/**
 * Cuantos creditos de publicidad regala. Lo acredita P4. NO son dias: un dia cuesta los creditos de su
 * zona (`CREDITOS_POR_DIA`); en una ciudad, uno. Lo que se promete lo dice `fraseRegaloSocioFundador`.
 */
export const SOCIO_FUNDADOR_CREDITOS = 90;

/**
 * EL AVISO DE SOCIOS FUNDADORES, construido con las dos constantes y no escrito a mano. Si la
 * fecha o la cifra se mueven, el copy se mueve con ellas; escrito a mano, la pantalla seguiria
 * prometiendo lo de antes y nadie lo notaria hasta que alguien lo reclamara.
 */
export function msgSocioFundador(idioma: Idioma): string {
  // El fin de la oferta se fijó en hora de MADRID (ver `SOCIO_FUNDADOR_HASTA_ISO`): la fecha se dice
  // en esa zona a cualquiera, porque es la del contrato, no la de quien lee.
  const hasta = formatearFecha(SOCIO_FUNDADOR_HASTA_ISO, idioma, ZONA_MADRID, "diaMesLargoAno");
  return `Socios Fundadores: las empresas que verifiquemos antes del ${hasta} se llevan ${fraseRegaloPublico()}.`;
}

/**
 * LO QUE SE REGALA, dicho sin prometer de más (P10): «N días de publicidad» solo era cierto en una
 * ciudad (un día global cuesta 15 créditos). Se dice en créditos y cuántos días son DONDE ESE NEGOCIO
 * PUEDE ANUNCIARSE: con `tipoNegocio`, en su alcance más barato; sin él (el aviso público), los dos
 * casos. Lo usan el aviso de Socios Fundadores y el correo de la verificación. Se CALCULA de las
 * constantes, como `fraseQueEsUnCredito`.
 */
export function fraseRegaloSocioFundador(tipoNegocio: TipoNegocio): string {
  // EL TIPO ES OBLIGATORIO, y no es un detalle: con un parámetro opcional, olvidarlo compilaba y
  // devolvía la frase genérica en silencio (el «filtro opcional que se olvida», el que `requireEmpresa`
  // prohíbe para `empresaId`). Quien NO conoce el tipo lo dice llamando a `fraseRegaloPublico()`.
  // Los días se cuentan en el alcance MÁS BARATO que ESE negocio puede comprar: a un negocio online no
  // se le promete «tu ciudad», que no puede comprar (`ALCANCES_POR_NEGOCIO`). Pasó en producción.
  const a = alcanceMasBarato(tipoNegocio);
  return `${REGALO}: hasta ${enDias(diasDeRegalo(a))} ${REGALO_EN_ALCANCE[a]}`;
}

/**
 * EL REGALO DICHO A QUIEN AÚN NO SABEMOS QUÉ NEGOCIO TIENE: el aviso público de Socios Fundadores
 * (`msgSocioFundador`, antes de registrarse). Quien lo lee puede ser cualquiera de los dos, así que se
 * dicen LOS DOS casos: prometer solo «tu ciudad» se lo prometería también a quien vende online.
 * Un censo exige que solo lo usen las superficies anónimas (y el respaldo del correo con un tipo roto).
 */
export function fraseRegaloPublico(): string {
  const local = alcanceMasBarato("FISICO");
  const fuera = alcanceMasBarato("ONLINE");
  return `${REGALO}: hasta ${enDias(diasDeRegalo(local))} ${REGALO_EN_ALCANCE[local]} si tienes un local, o ${enDias(diasDeRegalo(fuera))} ${REGALO_EN_ALCANCE[fuera]} si vendes online o eres una marca`;
}

const REGALO = `${SOCIO_FUNDADOR_CREDITOS} créditos de publicidad de regalo`;
const diasDeRegalo = (a: AlcancePublicidad) =>
  Math.floor(SOCIO_FUNDADOR_CREDITOS / CREDITOS_POR_DIA[a]);
const enDias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/**
 * Cómo se dice «anunciándote ahí» para cada alcance, en la frase del regalo. Un Record CERRADO: un
 * alcance nuevo no compila sin su frase, en vez de colarse con la de otro.
 */
const REGALO_EN_ALCANCE: Record<AlcancePublicidad, string> = {
  CIUDAD: "anunciándote en tu ciudad",
  ESTADO: "anunciándote en tu región",
  PAIS: "anunciándote en un país",
  GLOBAL: "anunciándote en todo el mundo",
};

/** El alcance más barato que puede comprar un tipo de negocio (con el que el regalo da más días). */
function alcanceMasBarato(tipoNegocio: TipoNegocio): AlcancePublicidad {
  return [...ALCANCES_POR_NEGOCIO[tipoNegocio]].sort(
    (a, b) => CREDITOS_POR_DIA[a] - CREDITOS_POR_DIA[b],
  )[0]!;
}

// ----------------------------------------------------------------------------
// CRÉDITOS DE PUBLICIDAD (Fase 9 · P4). En pantalla se llaman SIEMPRE así —«créditos de publicidad»—
// y nunca «puntos»: los puntos son de los participantes y se ganan jugando; esto es de las empresas y
// se gasta en anuncios. Llamarlos igual invitaría a preguntar cuántos puntos son un día de anuncio.
// ----------------------------------------------------------------------------

/**
 * Por qué se mueve un crédito. Unión CERRADA; cada motivo entra con la pieza que lo emite (la compra
 * en P11, el consumo diario en P9), como los tipos de notificación: un motivo que nadie emite sería
 * una promesa que el sistema no cumple.
 */
export const RazonCreditoSchema = z.enum([
  "SOCIO_FUNDADOR",
  "AJUSTE_ADMIN",
  // P9: el cobro de UN día de campaña, al empezar ese día; y su devolución si ese mismo día la pausa
  // el umbral de denuncias o la retira el admin (ese día no se cobra).
  "CONSUMO",
  "DEVOLUCION",
  // P11: la compra de un paquete de créditos con Stripe. Una por sesión de pago.
  "COMPRA",
]);
export type RazonCredito = z.infer<typeof RazonCreditoSchema>;

/**
 * Cómo se lee cada movimiento en el PORTAL de la empresa. Por el MOTIVO y nunca por la nota del
 * ajuste: esa es para el equipo (la misma regla que la nota del ajuste de puntos de un participante).
 */
export const ETIQUETA_MOVIMIENTO_CREDITO: Record<RazonCredito, string> = {
  SOCIO_FUNDADOR: "Regalo de Socio Fundador",
  AJUSTE_ADMIN: "Ajuste del equipo de DareFlash",
  CONSUMO: "Un día de campaña",
  DEVOLUCION: "Devolución de un día de campaña",
  COMPRA: "Compra de créditos",
};

/**
 * LOS PAQUETES DE CRÉDITOS DE PUBLICIDAD (Fase 9 · P11), en USD (`DEFAULT_CURRENCY`). FUENTE ÚNICA para
 * lo que se enseña en el portal, lo que se cobra en el Checkout y lo que se abona en el webhook: el
 * navegador solo manda la CLAVE del paquete, y el importe se resuelve aquí en los dos extremos. Subir
 * un precio es cambiar un número.
 */
export const PAQUETES_CREDITOS = {
  creditos_10: { creditos: 10, precioCents: 500 },
  creditos_30: { creditos: 30, precioCents: 1200 },
  creditos_100: { creditos: 100, precioCents: 3000 },
} as const;
export const PaqueteCreditosSchema = z.enum(
  Object.keys(PAQUETES_CREDITOS) as [
    keyof typeof PAQUETES_CREDITOS,
    ...(keyof typeof PAQUETES_CREDITOS)[],
  ],
);
export type PaqueteCreditos = z.infer<typeof PaqueteCreditosSchema>;
/** El `refType` de una compra en el ledger: el `refId` es el id de la SESIÓN de Checkout. */
export const REF_CREDITOS_STRIPE = "STRIPE_CHECKOUT";

/**
 * SIN CLAVES, LA COMPRA NO PROMETE NADA (como Boost y VIP): los paquetes se ven, el botón no se ofrece
 * y se dice por qué —y de dónde salen hoy los créditos—.
 */
export const MSG_CREDITOS_PAGO_NO_DISPONIBLE =
  "La compra de créditos todavía no está disponible. Mientras tanto, los créditos llegan como regalo de Socio Fundador o del equipo de DareFlash.";
export const MSG_CREDITOS_SIN_VERIFICAR =
  "Podrás comprar créditos en cuanto verifiquemos tu empresa.";
/** Las condiciones, junto al botón de compra: lo que de verdad pasa con lo que se compra. */
export const MSG_CREDITOS_CONDICIONES =
  "Los créditos de publicidad no caducan y no son reembolsables, salvo que la ley lo exija. Pagas con Stripe; puedes añadir tu número fiscal y descargar el recibo desde aquí.";

/**
 * Dónde guarda la BASE el primer día que se cobra (P9). Lo escribe la migración del cobro con el día
 * SIGUIENTE al despliegue: los días mostrados antes de P9 no se cobran nunca (ver `inicioDelCobro`).
 */
export const CLAVE_INICIO_COBRO_PUBLICIDAD = "publicidad.cobro-desde";
/**
 * Cada cuánto busca el worker campañas que salen hoy sin haber pagado el día. El cobro es «al empezar el
 * día»: a las 00:00 UTC el primer barrido cobra todas; los siguientes recogen lo que faltó (un worker
 * caído, un reintento). Mientras una campaña no ha pagado hoy NO se sirve, así que esto es lo que tarda,
 * como mucho, en salir al cambiar el día.
 */
export const PUBLICIDAD_COBRO_CADENCIA_MS = 5 * 60 * 1000;

/**
 * LAS CIFRAS DE UNA CAMPAÑA (P10): vistas y clics, contados en Redis por día (`pub:met:{dia}`, un hash
 * con `v:{id}` y `c:{id}`) y materializados en `PublicidadMetricaDia` por el worker. El hash vive tres
 * días: el de ayer se termina de volcar en las primeras pasadas de hoy.
 */
export const PUBLICIDAD_METRICAS_TTL_S = 3 * 24 * 60 * 60;
/** Cada cuánto vuelca el worker las cifras de Redis a la base: lo que tarda el informe en ponerse al día. */
export const PUBLICIDAD_METRICAS_CADENCIA_MS = 10 * 60 * 1000;
/** Días por página en el informe de la campaña (portal). */
export const PUBLICIDAD_METRICAS_PAGINA = 14;

/**
 * EL RESUMEN DIARIO DEL ADMIN (Fase 9 · P12): a partir de esta hora de Europe/Madrid, una vez por DÍA
 * de Madrid (se compara el día, no un intervalo de 24 h: un reinicio del worker no lo repite). Las 5 y
 * no las 4: a las 4 corre el ANALYZE (`analizar-tablas`), y el plan los quiere separados.
 */
export const HORA_RESUMEN_ADMIN = 5;
/** El último día de Madrid en que se hizo el resumen (enviado o no), en `SystemState`. */
export const CLAVE_RESUMEN_ADMIN = "resumen-admin.ultimo-dia";

/**
 * EL AVISO DE LA CASA (P12, §6.5 del plan): «la casa cubre más del 80 % de los huecos» — o sea, casi
 * nada se está vendiendo. Con histéresis: uno al cruzar, se rearma al bajar. Se mide sobre los huecos
 * de AYER (un día completo), y solo si hubo al menos `HUECOS_MIN_AVISO_CASA`: con cuatro huecos, el 80 %
 * no dice nada.
 */
export const CLAVE_AVISO_CASA = "aviso.publicidad-casa";
export const UMBRAL_AVISO_CASA = 0.8;
export const HUECOS_MIN_AVISO_CASA = 200;

/**
 * EL RETO DESTACADO DE LA PORTADA (Fase 9 · P14): el id del reto que el ADMIN eligió, en UN valor de
 * `SystemState`. Un solo valor y no un booleano por reto: dos destacados a la vez son imposibles por
 * construcción (marcar otro SUSTITUYE). Sin valor —o si el elegido ya no está abierto—, la portada usa
 * el automático (el abierto de mayor premio).
 */
export const CLAVE_RETO_DESTACADO = "portada.reto-destacado";
/** Retos en la rejilla de la portada (además del destacado del hero). */
export const REJILLA_PORTADA_N = 6;
/**
 * «Cierra pronto» en la rejilla: los que cierran en menos de esto van primero (por premio), y después
 * el resto (por premio). Así la rejilla junta las dos razones para entrar ya: mucho premio y poco plazo.
 */
export const REJILLA_CIERRE_PRONTO_MS = 72 * 60 * 60 * 1000;
/**
 * LA CACHÉ DE LA PORTADA (P14): lo que es igual para todos —cifras, destacado, rejilla— se guarda 30 s en
 * el proceso. Medido: sin ella, la portada pasa de 5 a 11 consultas por visita. Marcar o quitar el
 * destacado la vacía al momento.
 */
export const PORTADA_CACHE_MS = 30_000;
/**
 * Retos que ABREN pronto, en el bloque «Próximos retos» de la portada (el que llena la página cuando
 * hay pocos abiertos). Los más cercanos primero.
 */
export const PROXIMOS_PORTADA_N = 3;
/** Ganadores en «Últimos ganadores» de la portada: los ganadores reales (puesto 1) más recientes. */
export const GANADORES_PORTADA_N = 6;
/**
 * Cuántos resultados recientes se leen para llenar `GANADORES_PORTADA_N`: algunos se caen por el
 * camino (la cuenta ya no es visible o el reto se ocultó), así que se lee con margen. Acotado: la
 * tabla de resultados crece con cada cierre.
 */
export const GANADORES_PORTADA_LECTURA = 30;

/**
 * Tope de un ajuste manual (en un sentido o en otro). Holgado —cubre una corrección de un trimestre
 * entero de publicidad— pero existe: un cero de más tecleado no puede regalar diez años de anuncios.
 */
export const AJUSTE_CREDITOS_DELTA_MAX = 1000;
/** Página del historial de créditos (portal y panel). */
export const CREDITOS_PAGINA = 25;

/** La clave del regalo: UNA por empresa, para siempre. La usa también su migración (backfill). */
export function claveRegaloSocioFundador(empresaId: string): string {
  return `socio-fundador:${empresaId}`;
}

// ----------------------------------------------------------------------------
// PUBLICIDAD (Fase 9 · P6): la campaña, su calendario y su precio. El plan: §1, §3.4, §3.5 bis, §4.6.
// En el código se llama «publicidad» o «campaña», NUNCA «anuncio»: «anuncio» ya es el aviso que el
// admin manda a los usuarios (`Announcement`). En pantalla, quien mira lee «Publicidad».
// ----------------------------------------------------------------------------

/**
 * LA INTENCIÓN de la campaña, que es lo que se GUARDA. Lo que se ENSEÑA (programada, activa,
 * finalizada) se calcula con el calendario (`estadoVisiblePublicidad`): un job que no corrió no puede
 * dejar «activa» una campaña que ya terminó.
 *  - BORRADOR: creada, sin calendario. Se puede borrar.
 *  - ACTIVA: quiere salir; ocupa sus días en `ZonaOcupacion`.
 *  - PAUSADA: la empresa la paró; sus días por venir se liberaron.
 *  - TERMINADA: la empresa la acabó antes de tiempo; sus días por venir se liberaron. No vuelve.
 *  - RETIRADA (P8): la retiró un ADMIN, con motivo. Sus días por venir se liberaron. No vuelve.
 * La pausa del UMBRAL de denuncias no es un estado propio: es PAUSADA con `ocultoAutoEn` (ver el
 * modelo), y se enseña como EN_REVISION.
 */
export const EstadoPublicidadSchema = z.enum([
  "BORRADOR",
  "ACTIVA",
  "PAUSADA",
  "TERMINADA",
  "RETIRADA",
]);
export type EstadoPublicidad = z.infer<typeof EstadoPublicidadSchema>;

/**
 * Lo que se le enseña a la empresa. PROGRAMADA, FINALIZADA y EN_REVISION no se guardan nunca: se
 * calculan (las dos primeras con el calendario; la tercera con `ocultoAutoEn`).
 */
export type EstadoVisiblePublicidad =
  | "BORRADOR"
  | "PROGRAMADA"
  | "ACTIVA"
  | "FINALIZADA"
  | "PAUSADA"
  | "EN_REVISION"
  | "TERMINADA"
  | "RETIRADA";

export const ETIQUETA_ESTADO_PUBLICIDAD: Record<EstadoVisiblePublicidad, string> = {
  BORRADOR: "Borrador",
  PROGRAMADA: "Programada",
  ACTIVA: "Activa",
  FINALIZADA: "Finalizada",
  PAUSADA: "Pausada",
  EN_REVISION: "En revisión",
  TERMINADA: "Terminada",
  RETIRADA: "Retirada",
};

/**
 * POR QUÉ SE RETIRA UNA CAMPAÑA (P8). Lista CERRADA porque ESTE motivo SÍ se le cuenta a la empresa
 * (en el portal y en el correo): una retirada sin motivo genera un correo de soporte por cada caso. Lo
 * que no viaja nunca es la NOTA interna ni quién firmó.
 */
export const MotivoRetiradaPublicidadSchema = z.enum([
  "ENGANOSA",
  "CONTENIDO_NO_PERMITIDO",
  "DESTINO_PELIGROSO",
  "INCUMPLE_NORMAS",
  "OTRO",
]);
export type MotivoRetiradaPublicidad = z.infer<typeof MotivoRetiradaPublicidadSchema>;

/** El copy del motivo, en segunda persona: es lo que lee la empresa. */
export const MSG_MOTIVO_RETIRADA_PUBLICIDAD: Record<MotivoRetiradaPublicidad, string> = {
  ENGANOSA: "La campaña promete algo que no se corresponde con lo que ofrece.",
  CONTENIDO_NO_PERMITIDO: "La imagen o el texto incluyen contenido que no podemos mostrar.",
  DESTINO_PELIGROSO: "El enlace lleva a un sitio que no es seguro para quien lo pulse.",
  INCUMPLE_NORMAS: "La campaña no cumple las normas de publicidad de DareFlash.",
  OTRO: "Hemos revisado la campaña y no podemos seguir mostrándola.",
};
/** Lo que el panel ve de cada motivo (etiqueta corta para elegir y filtrar). */
export const ETIQUETA_MOTIVO_RETIRADA_PUBLICIDAD: Record<MotivoRetiradaPublicidad, string> = {
  ENGANOSA: "Engañosa",
  CONTENIDO_NO_PERMITIDO: "Contenido no permitido",
  DESTINO_PELIGROSO: "Enlace peligroso",
  INCUMPLE_NORMAS: "Incumple las normas",
  OTRO: "Otro motivo",
};
/** Página del listado de publicidad del panel. */
export const PUBLICIDAD_PANEL_PAGINA = 25;

/**
 * LA FRASE de cada estado. Desde P7 las campañas activas SE SIRVEN (feed y portada), así que ACTIVA ya
 * puede decir que se está mostrando. Lo que no promete es CUÁNTO: eso es la estimación, y las métricas
 * llegan en P10.
 */
export const MSG_ESTADO_PUBLICIDAD: Record<EstadoVisiblePublicidad, string> = {
  BORRADOR: "Todavía no ocupa ningún día. Actívala o prográmala cuando quieras.",
  PROGRAMADA: "Tiene sus días reservados y empieza a mostrarse en la fecha indicada.",
  ACTIVA: "Se está mostrando en su zona, en el feed y en la portada.",
  FINALIZADA: "Ya pasaron sus días contratados.",
  PAUSADA:
    "Está pausada. Sus días por venir quedaron libres para otras campañas; puedes reanudarla.",
  EN_REVISION:
    "La hemos pausado mientras revisamos unas denuncias. Sus días por venir quedaron libres y no se te descuenta nada. Te escribiremos cuando lo hayamos decidido.",
  TERMINADA: "La terminaste antes de tiempo. Sus días por venir quedaron libres.",
  RETIRADA: "La hemos retirado y ya no se muestra.",
};

/**
 * CRÉDITOS POR DÍA de cada alcance (lo que cuesta un día en esa zona). En UN sitio: subir un precio es
 * cambiar un número. Y lo vendido NO se mueve: al activar o programar, la tarifa se CONGELA en
 * `Publicidad.creditosPorDia` (la misma razón que `comisionBps` por reto). Hay un test que cambia esta
 * tabla y comprueba que una campaña activa y una reserva siguen con su precio (por eso el objeto no se
 * congela con `as const`: ese test lo escribe; el código, nunca).
 */
export const CREDITOS_POR_DIA: Record<AlcancePublicidad, number> = {
  CIUDAD: 1,
  ESTADO: 2,
  PAIS: 5,
  GLOBAL: 15,
};

/**
 * QUÉ ES UN CRÉDITO, dicho junto al saldo (portal y panel). Antes ponía «cada crédito es un día de
 * anuncio», que solo es cierto en una ciudad: desde que se cobra cada día (P9), al lado de un «−15» de
 * una campaña global se leía como un error. Se CALCULA de la tabla: subir un precio no la deja mintiendo.
 */
export function fraseQueEsUnCredito(tipoNegocio: TipoNegocio): string {
  // EL TIPO ES OBLIGATORIO (ver `fraseRegaloSocioFundador`): quien no lo conoce llama a
  // `fraseCreditoPublica()`, y esa elección se lee en el código. SOLO los alcances que ese negocio
  // puede comprar (`ALCANCES_POR_NEGOCIO`), con su tarifa. Antes la cabecera de «Nueva campaña» le
  // hablaba de «una ciudad» a un negocio online, que no puede comprarla.
  const tramos = ALCANCES_POR_NEGOCIO[tipoNegocio].map((a, i) => {
    const n = CREDITOS_POR_DIA[a];
    // La unidad solo en el primero («1 crédito en una ciudad y 2 en una región»).
    return `${n}${i === 0 ? ` ${n === 1 ? "crédito" : "créditos"}` : ""} ${TARIFA_EN_ALCANCE[a]}`;
  });
  const lista =
    tramos.length === 1 ? tramos[0] : `${tramos.slice(0, -1).join(", ")} y ${tramos.at(-1)}`;
  return `Un día de campaña cuesta ${lista}, ${COLETILLA_CREDITO}`;
}

/**
 * LA TARIFA DICHA A QUIEN AÚN NO SABEMOS QUÉ NEGOCIO TIENE (el alta pública de empresa; y el portal
 * cuando el correo aún no está confirmado y no se sabe qué empresa es): la horquilla del catálogo
 * entero, que es verdad para cualquiera.
 */
export function fraseCreditoPublica(): string {
  const { CIUDAD, GLOBAL } = CREDITOS_POR_DIA;
  return `Un día de campaña cuesta ${CIUDAD} ${CIUDAD === 1 ? "crédito" : "créditos"} en una ciudad y ${GLOBAL} en todo el mundo, ${COLETILLA_CREDITO}`;
}

const COLETILLA_CREDITO = "y se descuenta cada día que se muestra.";

/** Cómo se dice dónde, al dar la tarifa de cada alcance. Record CERRADO, como `REGALO_EN_ALCANCE`. */
const TARIFA_EN_ALCANCE: Record<AlcancePublicidad, string> = {
  CIUDAD: "en una ciudad",
  ESTADO: "en una región",
  PAIS: "por país",
  GLOBAL: "en todo el mundo",
};

/**
 * Un negocio ONLINE puede comprar VARIOS países: `CREDITOS_POR_DIA.PAIS` por país y día, con TOPE en
 * el de Global (a partir de `PUBLICIDAD_PAISES_AVISO_GLOBAL` países, Global sale igual o mejor, y la
 * pantalla lo dice). El máximo de países existe para que una campaña no ocupe plaza en medio mundo
 * pagando el precio de Global.
 */
export const PUBLICIDAD_PAISES_MAX = 10;
export const PUBLICIDAD_PAISES_AVISO_GLOBAL = 3;

/** Días que se pueden contratar de una vez. Holgado (un trimestre) pero acotado: cada día es una fila. */
export const PUBLICIDAD_DIAS_MIN = 1;
export const PUBLICIDAD_DIAS_MAX = 90;

/**
 * HORIZONTE DE RESERVA: lo más lejos que puede EMPEZAR una campaña. Sin tope, una reserva —que no
 * cobra hasta su primer día— bloquearía una zona indefinidamente, y gratis.
 */
export const PUBLICIDAD_RESERVA_MAX_DIAS = 60;

/** El nombre (solo para el portal: quien mira no lo ve), el texto y el destino del clic. */
export const PUBLICIDAD_NOMBRE_MAX = 80;
export const PUBLICIDAD_TEXTO_MAX = 125;
export const PUBLICIDAD_DESTINO_MAX = 300;
/** La imagen: por el pipeline de siempre, contenida en este lado (el feed es vertical). */
export const PUBLICIDAD_IMAGEN_MAX_LADO = 1080;
/** Página de la lista de campañas del portal. */
export const PUBLICIDAD_PAGINA = 25;

export const ETIQUETA_ALCANCE_PUBLICIDAD: Record<AlcancePublicidad, string> = {
  CIUDAD: "Una ciudad y alrededores",
  ESTADO: "Una región entera",
  PAIS: "Uno o varios países",
  GLOBAL: "Todo el mundo",
};

/**
 * LA LÍNEA QUE HACE HONESTA LA RESERVA: el saldo se COMPRUEBA al reservar, pero no se RETIENE —retener
 * sería un segundo saldo, y dos saldos acaban discrepando—: se descuenta cada día de campaña (P9). La
 * frase del periodo gratis de P7 a P8 se fue con el cobro (la quitó el test atado al motivo CONSUMO), y
 * su promesa la cumple `inicioDelCobro`: los días que se mostraron gratis no se cobran nunca.
 */
export const MSG_SALDO_NO_RETENIDO =
  "Comprobamos que tienes créditos de publicidad para todos los días, pero no los apartamos: se descuentan cada día de campaña. Si cuando llegue un día no te quedan, la campaña se pausa.";

// ----------------------------------------------------------------------------
// LA ENTREGA DE LA PUBLICIDAD (Fase 9 · P7): huecos, rotación y el anuncio de la casa.
// ----------------------------------------------------------------------------

/**
 * UN HUECO DE PUBLICIDAD CADA N VÍDEOS del feed, alternando espacio (1.º global, 2.º local…). Es el
 * parámetro que más se va a tocar, por eso es una constante y no un número en la consulta del feed.
 */
export const PUBLICIDAD_CADA_N_ITEMS = 8;

/**
 * TOPE DE FRECUENCIA: la misma campaña no sale dos veces en los N huecos siguientes al mismo espectador.
 * Con una sola campaña elegible, el hueco se queda sin ella (mejor que repetir el cartel).
 */
export const PUBLICIDAD_TOPE_FRECUENCIA = 3;
/** Cuánto recuerda Redis lo que alguien acaba de ver (por sesión: perderlo no rompe nada). */
export const PUBLICIDAD_RECIENTES_TTL_S = 30 * 60;
/** El anuncio de la casa en el FEED: como mucho una vez cada tanto por persona (≈ una sesión). */
export const PUBLICIDAD_CASA_FEED_TTL_S = 12 * 60 * 60;
/** Lo que se cachea en cada proceso la lista de campañas de hoy (pausar o suspender tarda esto, como mucho). */
export const PUBLICIDAD_CACHE_HOY_MS = 60_000;

/**
 * LA ETIQUETA DE CADA PIEZA, SIEMPRE A LA VISTA. Una campaña es publicidad de un tercero: «Publicidad».
 * El anuncio de la casa no lo es —lo pone DareFlash para sí mismo—: decir «Publicidad» ahí sería
 * disfrazarlo, así que lleva «De DareFlash».
 */
export const ETIQUETA_PIEZA_CAMPANA = "Publicidad";
export const ETIQUETA_PIEZA_CASA = "De DareFlash";
/**
 * UN TIPO DE NEGOCIO GUARDADO FUERA DEL CATÁLOGO (no debería pasar: el alta lo valida). La MISMA frase
 * en el aviso de «Nueva campaña» y en el rechazo del servicio (`TIPO_NEGOCIO_DESCONOCIDO`): la
 * pantalla y la ruta dicen lo mismo.
 */
export const MSG_TIPO_NEGOCIO_DESCONOCIDO =
  "No podemos ofrecerte campañas hasta revisar el tipo de negocio de tu empresa. Escríbenos contestando a cualquiera de nuestros correos y lo arreglamos.";

/**
 * EL ANUNCIO DE LA CASA: el hueco vacío sirve para llenarse a sí mismo. Invita a anunciarse, nunca vende
 * VIP («quita los anuncios» dentro de un anuncio se lee como presión). A una empresa —que ya está
 * registrada— la lleva a su sección de Publicidad, no al alta.
 */
export const ANUNCIO_CASA: Record<
  EspacioPublicidad,
  { titulo: string; texto: string; cta: string }
> = {
  LOCAL: {
    titulo: "¿Tienes un negocio en tu ciudad?",
    // La cifra sale de la tarifa: si el precio de una ciudad cambia, esta frase cambia con él.
    texto: `Anúnciate aquí y te verá la gente de tu zona. Desde ${CREDITOS_POR_DIA.CIUDAD} ${CREDITOS_POR_DIA.CIUDAD === 1 ? "crédito" : "créditos"} de publicidad al día.`,
    cta: "Anúnciate aquí",
  },
  GLOBAL: {
    titulo: "Llega a gente de todo el país",
    texto: "Tu marca, entre los vídeos de quienes compiten en DareFlash.",
    cta: "Anúnciate aquí",
  },
};
export const ANUNCIO_CASA_DESTINO = {
  invitado: "/empezar/empresa",
  empresa: "/empresa/publicidad",
} as const;

// ----------------------------------------------------------------------------
// LA PANTALLA DE ELECCION (`/empezar`). Dos caminos, y el de participante es el
// principal: se lleva el UNICO acento de accion de la pantalla.
// ----------------------------------------------------------------------------

export const TITULO_EMPEZAR = "¿Cómo quieres usar DareFlash?";
export const SUBTITULO_EMPEZAR =
  "Dos cuentas distintas, y no se pueden mezclar: elige con cuál entras.";

export const CAMINO_PARTICIPANTE = {
  titulo: "Quiero participar",
  cuerpo: "Sube tus vídeos, compite en los retos y gana premios de verdad.",
  cta: "Crear mi cuenta",
  href: "/entrar?registro=1",
} as const;

/**
 * LA PUERTA DEL NEGOCIO, desde donde está la gente: `/entrar` (a la altura del registro, y visible
 * desde la vista inicial, no solo tras pulsar «Crear cuenta») y el bloque de la portada para
 * invitados. Texto y destino en UN sitio —como `ctaPrincipal`—: si cambian, cambian en todas partes.
 *
 * Existe porque `/empezar` estaba ESCONDIDO: solo se llegaba escribiendo la dirección. Una página a
 * la que no lleva ningún camino es una página que no existe para quien no la conoce.
 *
 * Va directa al ALTA (`/empezar/empresa`), no a la pantalla de elección: quien pulsa «tengo un
 * negocio» ya ha elegido.
 */
export const CTA_NEGOCIO = {
  texto: "¿Tienes un negocio? Regístralo aquí",
  href: "/empezar/empresa",
} as const;

/** El enlace del pie de página: discreto, como el resto del pie, pero en TODAS las páginas. */
export const ENLACE_PIE_EMPRESAS = { texto: "Para empresas", href: "/empezar/empresa" } as const;

export const CAMINO_EMPRESA = {
  titulo: "Soy un negocio",
  cuerpo:
    "Patrocina retos y anúnciate donde está tu gente. Una cuenta de empresa lo ve todo, pero no participa: ni sube vídeos ni vota.",
  cta: "Registrar mi empresa",
  href: "/empezar/empresa",
} as const;

// ----------------------------------------------------------------------------
// GEOLOCALIZACIÓN Y AFORO POR ZONA (Fase 9 · P5). El plan: §4 (ubicación) y §5.3 (aforo).
// ----------------------------------------------------------------------------

/**
 * EL RADIO de una campaña de ciudad. Absorbe buena parte del error de la geolocalización por IP (en
 * móvil, la IP de un operador sale a decenas de kilómetros): con 5 km, media segmentación iría al sitio
 * equivocado. Se resuelve AL ACTIVAR (P6), no al servir. Si un día cambia, las campañas activas se
 * recalculan en un job y lo vendido con el radio anterior no se reescribe.
 */
export const RADIO_PUBLICIDAD_KM = 100;

/**
 * Cuántos días puede tener el fichero de IP antes de avisar. El fichero es MENSUAL: con 31 el aviso
 * saltaría cada vez que la publicación se retrasa unos días, y un aviso que salta por nada deja de
 * leerse. 60 = «se perdieron dos ciclos», que sí es un problema.
 */
export const GEOIP_DIAS_CADUCA = 60;

/** Cada cuánto, COMO MUCHO, el lector mira si el fichero de IP cambió (para reabrirlo sin reiniciar). */
export const GEOIP_REVISAR_MS = 60_000;

/**
 * La ciudad del catálogo que se le asigna a unas coordenadas de IP: la MÁS CERCANA del mismo país,
 * siempre que esté a menos de esto. Más lejos, se sabe el país pero no la ciudad.
 */
export const GEOIP_CIUDAD_MAX_KM = 60;

/** Cuánto vive el resultado de una IP de invitado memoizado (Redis o memoria). Corto: la IP cambia. */
export const GEOIP_MEMO_ANONIMO_S = 60 * 60;

/** Sugerencias del autocompletado de ciudades. */
export const CIUDADES_AUTOCOMPLETAR = 10;

/** Los niveles de zona, del más concreto al más amplio. `GLOBAL` tiene una sola zona: «*». */
export const NivelAforoSchema = z.enum(["CIUDAD", "ESTADO", "PAIS", "GLOBAL"]);
export type NivelAforo = z.infer<typeof NivelAforoSchema>;
export const ZONA_GLOBAL = "*";

/**
 * La estimación se calcula con la MEDIANA de los últimos 7 días completos de `AforoZonaDia`: mediana y no
 * media, como en el aviso de capacidad, para que un día raro no mueva la cifra con la que alguien decide.
 */
export const AFORO_MEDIANA_DIAS = 7;

/**
 * DESDE QUÉ DÍA SE CONSIDERA QUE EL AFORO ESTABA MIDIENDO: el primer día UTC COMPLETO después del
 * despliegue de P5 en producción (2026-11-06, a mitad de día). El 6 se deja fuera porque solo se midió
 * una parte: contarlo hundiría la mediana con un día a medias.
 *
 * Un día cuenta como MEDIDO si es de esta fecha en adelante Y tiene fila en la zona GLOBAL (toda visita
 * contada suma en GLOBAL, así que sin esa fila no se midió nada: Redis caído, worker parado). En un día
 * medido, una zona sin fila es una zona sin visitas: cuenta como 0, no se salta. Saltarlo era el fallo
 * que corrigió P6: una ciudad con una visita en siete días medidos salía con mediana 1, y esa cifra es
 * la que ve una empresa antes de pagar.
 */
export const AFORO_MIDE_DESDE_ISO = "2026-11-07";

/** Cada cuánto se materializa el aforo de Redis a `AforoZonaDia` (recuento absoluto: reejecutar converge). */
export const AFORO_MATERIALIZAR_CADENCIA_MS = 60 * 60 * 1000;

/** Cuánto viven en Redis las claves de aforo de un día: lo justo para materializar hoy y ayer y algo más. */
export const AFORO_TTL_S = 3 * 24 * 60 * 60;

/** La clave de `SystemState` del aviso del fichero de IP viejo (con histéresis, como el de capacidad). */
export const CLAVE_AVISO_GEOIP = "geoip:aviso";
