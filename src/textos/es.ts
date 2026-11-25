/**
 * LOS TEXTOS EN CASTELLANO (Fase 11 · P5b1): la FUENTE. Los demás idiomas (P5c) tienen que cumplir su
 * forma (`satisfies Diccionario<typeof es>`): una clave que falta o sobra no compila.
 *
 * Por ESPACIOS, uno por pieza de la interfaz: un componente de cliente recibe solo los espacios que usa
 * (`textosParaCliente`), así que un espacio no debe mezclar lo de dos sitios. Las plantillas llevan sus
 * `{parámetros}`; `{marca}` la pone `t`; un plural es `{ one, other }` con `{n}`. El texto es el que se
 * veía antes, letra a letra: lo fija el render de muestras de la P5b1.
 *
 * UNA FRASE ES UNA CLAVE. Si lleva un formato en medio (unas palabras resaltadas, un enlace, algo que
 * solo oye un lector de pantalla), la marca va DENTRO: «El {resaltado:mayor premio} en juego ahora
 * mismo», y se pinta con `tRico` (src/textos/rico.tsx). Nunca una frase en trozos para meter una
 * etiqueta entre ellos: al traducir, el orden de las palabras cambia y los trozos dejan de encajar.
 * `conMarcasConocidas` hace que una marca fuera del catálogo no compile.
 *
 * SOLO para el servidor (`textos/servidor`). Ningún `"use client"` puede importarlo: lo fija
 * `textos-fuera-del-cliente`, y la marca `__idioma` es la que busca la revisión de la imagen en CI.
 */
import { conMarcasConocidas } from "./plantilla";

export const es = conMarcasConocidas({
  __idioma: "es",

  // ── Armazón ──────────────────────────────────────────────────────────────────────────────────────
  buscador: {
    placeholder: "Buscar retos, personas…",
    etiqueta: "Buscar",
    sugerencias: "Sugerencias",
    verTodos: "Ver todos los resultados de «{termino}»",
  },
  campana: {
    titulo: "Notificaciones",
    etiquetaConNuevas: "Notificaciones ({badge} sin leer)",
    cargando: "Cargando…",
    error: "No hemos podido cargar tus avisos. Vuelve a abrir la campana para reintentarlo.",
    vacio: "Aún no tienes avisos. Sube un vídeo o participa en un reto y aquí verás lo que pase.",
    avisoNuevo: "{oculto:Nuevo: }{texto}",
    verTodas: "Ver todas",
  },
  cuenta: {
    tuCuenta: "Tu cuenta",
    acceder: "Acceder",
    menu: "Cuenta",
    opcion_perfil: "Ver mi perfil",
    opcion_empresa: "Mi empresa",
    opcion_cuenta: "Cuenta",
    opcion_logout: "Cerrar sesión",
    opcion_entrar: "Entrar",
    cerrando: "Cerrando sesión…",
    cerrarSesion: "Cerrar sesión",
    /** El nombre de la barra cuando la cuenta no tiene ni nombre ni handle (no debería pasar). */
    nombreSinNombre: "Tú",
  },
  /** El CTA principal (`ctaPrincipal` dice cuál). «Crear reto» es solo del admin: ver `cta-principal`. */
  cta: {
    crearReto: "Crear reto",
    subirVideo: "Subir vídeo",
    miEmpresa: "Mi empresa",
  },
  tema: {
    cambiarAClaro: "Cambiar a tema claro",
    cambiarAOscuro: "Cambiar a tema oscuro",
    claro: "Tema claro",
    oscuro: "Tema oscuro",
  },
  // ── Primitivas de CLIENTE que pinta el feed y los retos (van en el proveedor del armazón) ────────
  voto: {
    texto_cerrado: "Votación cerrada",
    texto_invitado: "Votar",
    "texto_sin-ver": "Votar",
    texto_votar: "Votar",
    texto_votado: "Votado",
    "texto_no-votable": "Tu participación",
    aria_cerrado: "La votación de este reto está cerrada",
    aria_invitado: "Inicia sesión para votar",
    aria_votar: "Votar esta participación",
    aria_votado: "Quitar mi voto de esta participación",
    "aria_no-votable": "No puedes votar tu propia participación",
    votos: "{cuenta} votos",
    etiquetaVotos: "votos",
    votoRegistrado: "· voto registrado",
    moverAria: "Mover tu voto",
    moverPregunta: "¿Mover tu voto aquí?",
    moverMiVoto: "Mover mi voto",
    cancelar: "Cancelar",
  },
  like: {
    meGusta: "Me gusta ({cuenta})",
    quitarMeGusta: "Quitar me gusta ({cuenta})",
  },
  denunciar: {
    denunciar: "Denunciar",
    cerrar: "Cerrar",
    cancelar: "Cancelar",
    iniciaSesion: "Inicia sesión para denunciar.",
    iniciarSesion: "Iniciar sesión",
    pregunta: "¿Qué pasa con esto?",
    loRevisara: "Lo revisará una persona. No se avisa a quien lo publicó.",
    errorEnvio: "No se pudo enviar la denuncia.",
    sinConexion: "No hemos podido conectar. Inténtalo de nuevo.",
    /** Los motivos (`MOTIVOS_DENUNCIA`, por su clave). El panel sigue leyendo el catálogo. */
    motivo_SPAM: "Spam o engaño",
    motivo_SEXUAL: "Contenido sexual",
    motivo_VIOLENCIA: "Violencia o contenido gráfico",
    motivo_ACOSO: "Acoso o incitación al odio",
    motivo_MENORES: "Pone en riesgo a un menor",
    motivo_DERECHOS: "Usa contenido que no es suyo",
    motivo_OTRO: "Otro motivo",
  },
  compartir: {
    compartir: "Compartir",
    copiado: "Copiado",
    fallo: "No se pudo",
  },
  reproductor: {
    video: "Vídeo",
    noDisponible: "Este vídeo ya no está disponible",
    retirado: "Puede que su autor lo haya retirado.",
    noCarga: "No se pudo cargar el vídeo. Reintenta.",
    reintentar: "Reintentar",
    reanudar: "Reanudar el vídeo",
    pausar: "Pausar el vídeo",
  },
  modal: {
    reproduccion: "Reproducción del vídeo",
    cerrar: "Cerrar",
    cargando: "Cargando…",
    noDisponible: "Este vídeo no está disponible.",
    noCarga: "No se pudo cargar el vídeo. Reintenta.",
    reintentar: "Reintentar",
  },
  anuncio: {
    imagenNoCarga: "La imagen no se ha podido cargar.",
    pestanaNueva: "Se abre en una pestaña nueva.",
  },
  /**
   * Las MARCAS que salen junto a un nombre en cualquier pantalla (y en el panel): la de VIP, la de
   * Boost y el emblema de nivel. Son hojas de cliente que leen este espacio del proveedor, porque las
   * pintan tanto componentes de servidor como de cliente (un avatar sale en los dos).
   * «VIP Mythic» es el nombre del plan; los nombres de nivel (Rookie, Pro…) son nombres propios del
   * producto y no viven aquí.
   */
  marcas: {
    vip: "VIP Mythic",
    vipCorta: "VIP",
    boost: "Boost",
    nivel: "Nivel {nombre}",
  },
  /**
   * La cuenta atrás de un reto. Con un día o más se lee en días y horas abreviados: una abreviatura no
   * tiene plural, así que es UNA plantilla (y no dos plurales) con el orden dentro, para el idioma que
   * lo diga al revés. Por debajo de un día es un reloj (`02:41:09`) y no lleva palabras.
   */
  cuentaAtras: {
    diasHoras: "{dias} d {horas} h",
  },
  /** La pantalla de error de una sección (`ErrorPantalla`, en los `error.tsx`). */
  errorPantalla: {
    texto:
      "Ha fallado algo de nuestro lado, no de lo que has hecho. Vuelve a intentarlo en un momento; si sigue igual, escríbenos.",
    reintentar: "Reintentar",
  },
  /** Un campo de solo lectura con su botón de copiar (`CampoCopiable`). */
  copiar: {
    copiar: "Copiar",
    copiado: "Copiado",
    fallo: "No hemos podido copiarlo. Selecciónalo y cópialo a mano.",
  },
  /** El botón de dar un toque en el perfil de otra persona (`DarToque`). */
  toque: {
    dar: "Dar un toque",
    enviando: "Enviando…",
    error: "No se pudo dar el toque.",
    sinConexion: "No hemos podido conectar. Inténtalo de nuevo.",
  },
  /** El «Cargando…» de las pantallas de carga (una hoja de cliente: `TextoCargando`). */
  carga: {
    cargando: "Cargando…",
  },
  /** Los pasos de una lista paginada (`PasosKeyset`, de servidor). */
  paginacion: {
    aria: "Paginación",
    anterior: "Anterior",
    siguiente: "Siguiente",
  },

  // ── El feed ─────────────────────────────────────────────────────────────────────────────────────
  feed: {
    titulo: "Feed",
    vacioTitulo: "Aún no hay vídeos",
    vacioTexto: "Cuando se publiquen los primeros vídeos, aparecerán aquí. Vuelve en un rato.",
    videoNoDisponible: "Ese vídeo ya no está disponible.",
    cargando: "Cargando…",
    reto: "Reto: {titulo}",
    sonido: "Toca para activar el sonido",
    cifraMeGusta: "me gusta",
    cifraVotos: "votos",
    verComentarios: "Ver comentarios",
    comentar: "Comentar",
    activarSonido: "Activar sonido",
    silenciar: "Silenciar",
    resumen: "{votos} votos · {comentarios} comentarios",
    cerrarComentarios: "Cerrar comentarios",
    comentarios: "Comentarios",
    nComentarios: "{cuenta} comentarios",
    cerrar: "Cerrar",
    videoAnterior: "Vídeo anterior",
    videoSiguiente: "Vídeo siguiente",
    cerrarAviso: "Cerrar aviso",
  },
  comentarios: {
    yaNoEsta: "Ese comentario ya no está.",
    cargando: "Cargando comentarios…",
    error: "No se pudieron cargar los comentarios.",
    vacio: "Aún no hay comentarios.",
    /** La misma frase, con la invitación: UNA clave, no «vacío» + « Sé el primero» pegados. */
    vacioInvita: "Aún no hay comentarios. Sé el primero.",
    borrarPregunta: "¿Borrar tu comentario?",
    siBorrar: "Sí, borrar",
    no: "No",
    borrar: "Borrar",
    cargandoMas: "Cargando…",
    verMas: "Ver más comentarios",
    escribe: "Escribe un comentario",
    placeholder: "Comentar…",
    publicando: "Publicando…",
    publicar: "Publicar",
    iniciaSesion: "Inicia sesión para comentar",
    errorPublicar: "No se pudo publicar el comentario.",
    errorBorrar: "No se pudo borrar el comentario.",
    sinConexion: "No hemos podido conectar. Inténtalo de nuevo.",
  },
  // ── Retos: la lista (/retos) y la tarjeta ─────────────────────────────────────────────────────────
  retos: {
    titulo: "Retos",
    retosActivos: "Retos activos",
  },
  /** Las pestañas, el filtro y la paginación de /retos: una isla de CLIENTE (`feed-retos`). */
  retosLista: {
    estado: "Estado de los retos",
    activos: "Activos",
    proximamente: "Próximamente ({n})",
    cerrados: "Cerrados",
    filtrar: "Filtrar por categoría",
    todos: "Todos",
    vacioActivos: "Todavía no hay retos activos en esta categoría.",
    vacioProximos: "No hay ningún reto programado ahora mismo.",
    vacioCerrados: "Aún no hay retos cerrados.",
    cargando: "Cargando…",
    verMasCerrados: "Ver más retos cerrados",
  },
  /**
   * La tarjeta de un reto y sus chapas. La tarjeta se pinta en el servidor (portada) y en el cliente
   * (/retos), así que no pide sus textos: los recibe por prop como DATOS (`textosParaCliente`).
   */
  tarjetaReto: {
    verReto: "Ver reto",
    participar: "Participar",
    /** La chapa de un reto exclusivo. Va al lado de la marca «VIP», que ya dice el plan. */
    exclusivo: "EXCLUSIVO",
    /**
     * Un reto que aún no ha abierto. «PRÓXIMAMENTE» y no «PROGRAMADO»: lo segundo es la palabra del PANEL
     * (`estadoRetoAdmin`), una decisión del admin. Al público le importa que todavía no puede entrar, y
     * «próximamente» además promete, que es lo que se quiere en un producto de concurso.
     */
    proximamente: "PRÓXIMAMENTE",
    /** Delante del nombre de la marca, en la tarjeta y en la ficha de un reto patrocinado. */
    patrocinadoPor: "Patrocinado por",
  },
  /** La ficha de un reto (`/retos/{codigo}-{slug}`): lo que pinta el servidor. */
  reto: {
    miEstadoProcesando: "Tu vídeo se está procesando; aparecerá cuando esté listo.",
    miEstadoFallida: "Tu vídeo no se pudo procesar. Pulsa Reemplazar para volver a intentarlo.",
    ganadores: "Ganadores",
    nGanadores: { one: "{n} ganador", other: "{n} ganadores" },
    descripcion: "Descripción",
    reglas: "Reglas",
    participaciones: "Participaciones",
  },
  /** El botón de participar de la ficha (isla de CLIENTE). */
  participar: {
    retoCerrado: "Reto cerrado",
    /** Un reto que aún no ha abierto: dice por qué no se puede, no «cerrado». */
    aunNoHaAbierto: "Aún no ha abierto",
    nivelInsuficiente: "Nivel insuficiente",
    /** El de un reto exclusivo cuando quien mira no es VIP. Lleva a /vip, que es donde se arregla. */
    hazteVip: "Hazte VIP para participar",
    reemplazar: "Reemplazar mi vídeo",
    participar: "Participar",
  },
  /** La rejilla de participaciones de la ficha y el feed del reto que abre (isla de CLIENTE). */
  participaciones: {
    vacio: "Aún no hay participaciones en este reto.",
    vacioInvita: "Aún no hay participaciones en este reto. Sé el primero.",
    cargando: "Cargando…",
    verMas: "Ver más participaciones",
    errorMas: "No se pudieron cargar más. Inténtalo de nuevo.",
    videosDelReto: "Vídeos del reto",
    volverAlReto: "Volver al reto",
    reproducirTitulo: "Reproducir «{titulo}»",
    reproducirDe: "Reproducir el vídeo de {autor}",
    tu: "Tú",
    /** La palabra junto al recuento de una celda (el número lo pinta `RecuentoVotos`). */
    unidadVoto: { one: "voto", other: "votos" },
  },
  /** La cuenta atrás de un reto que aún no ha abierto (`Marcador`, de servidor). */
  marcador: {
    abreEn: "Abre en",
  },

  // ── Portada (/inicio) ────────────────────────────────────────────────────────────────────────────
  inicio: {
    titulo: "Inicio",
    h1: "Reta al mundo. Gana de verdad.",
    introEmpresa:
      "Estás viendo {marca} como empresa: aquí los retos se miran, no se participa. Desde tu portal propones retos y lanzas tu publicidad.",
    intro:
      "Sube tu reto, la comunidad vota y los mejores se llevan premios de verdad. Aquí gana lo que haces, no a quién conoces.",
    explorarRetos: "Explorar retos",
    retosAbiertos: "Retos abiertos",
    verTodos: "Ver todos →",
    topDelMes: "Top del mes",
    verTodo: "Ver todo",
    topVacio: "Todavía no ha ganado nadie este mes. Sé el primero.",
    unidadVictoria: { one: "victoria", other: "victorias" },
    tienesNegocio: "¿Tienes un negocio?",
    registrarEmpresa: "Registrar mi empresa",
    // El destacado del hero
    heroVacioTitulo: "Ahora mismo no hay retos abiertos",
    heroVacioTexto:
      "Los próximos abren pronto. Mientras, puedes ver los que están por llegar y quién ganó los últimos.",
    verLosRetos: "Ver los retos",
    ariaDestacado: "Reto destacado: {titulo}",
    chapaDestacado: "Reto destacado",
    sinParticipantes: "Todavía nadie ha participado: puedes ser el primero",
    participantes: { one: "{n} participante", other: "{n} participantes" },
    votos: { one: "{n} voto", other: "{n} votos" },
    elegido: "Elegido por el {resaltado:equipo de {marca}}",
    mayorPremio: "El {resaltado:mayor premio} en juego ahora mismo",
    // Cómo funciona
    comoFunciona: "Cómo funciona",
    pasoTitulo: "{oculto:Paso {n}: }{titulo}",
    paso1Titulo: "Elige un reto",
    paso1Texto: "Cada reto tiene su premio y su fecha de cierre. Entra en el que mejor se te dé.",
    paso2Titulo: "Sube tu vídeo",
    paso2Texto: "Grábalo y súbelo antes de que cierre. Un vídeo por reto.",
    paso3Titulo: "La comunidad vota",
    paso3Texto: "Los votos deciden quién gana, y quien gana se lleva el premio.",
    // Perfiles destacados (Boost)
    destacadosTitulo: "Descúbrelos hoy",
    destacadosSubtitulo: "Creadores a los que seguir la pista ahora mismo",
    destacaTuPerfil: "Destaca tu perfil →",
    destacadosVacio: "Ahora mismo no hay ningún perfil destacado.",
    destacadosVacioInvita: "Ahora mismo no hay ningún perfil destacado. Puedes ser el primero.",
    // El cierre
    cierrePortalTitulo: "Lleva tu marca a los retos",
    cierreTitulo: "Tu próximo vídeo puede ganar",
    cierrePortalTexto:
      "Desde tu portal propones retos con premio y lanzas tu publicidad donde está tu gente.",
    cierreTexto:
      "Elige un reto abierto, sube tu vídeo antes del cierre y deja que vote la comunidad.",
    // Categorías
    categoriasTitulo: "Categorías",
    verTodosLosRetos: "Ver todos los retos →",
    abiertos: { one: "{n}{oculto: abierto}", other: "{n}{oculto: abiertos}" },
    // Rejilla de retos
    rejillaVacioConDestacado:
      "Ahora mismo no hay más retos abiertos que el destacado. {enlace:Ver los próximos}",
    rejillaVacio: "Ahora mismo no hay retos abiertos. {enlace:Ver los próximos}",
    // Próximos y ganadores
    proximosTitulo: "Próximos retos",
    ganadoresTitulo: "Últimos ganadores",
    gano: "ganó {enlace:{reto}}",
  },
  /** Las cifras del hero: es una isla de CLIENTE (el recuento animado), así que va en su espacio. */
  inicioCifras: {
    vacio: "Ahora mismo no hay retos abiertos. {enlace:Mira los que vienen}.",
    cifra_premios: "en premios ahora",
    cifra_retos: { one: "reto abierto", other: "retos abiertos" },
    cifra_categorias: "categorías",
  },

  /**
   * Los nombres de las categorías del catálogo (`CATEGORIES`, en `constants`), por su clave. El panel
   * —que no se traduce— sigue leyendo `CATEGORIES.es`; un test ata que digan lo mismo en castellano.
   */
  categorias: {
    cat_humor: "Humor",
    cat_fitness: "Fitness",
    cat_musica: "Música",
    cat_baile: "Baile",
    cat_gaming: "Gaming",
    cat_lifestyle: "Lifestyle",
    cat_street: "Street",
    cat_arte: "Arte",
    cat_viajes: "Viajes",
    cat_talento: "Talento",
    cat_tecnologia: "Tecnología",
    cat_moda: "Moda",
    cat_motivacion: "Motivación",
    cat_retos: "Retos",
  },
  pie: {
    privacidad: "Privacidad",
    terminos: "Términos (pronto)",
    paraEmpresas: "Para empresas",
  },
  nav: {
    principal: "Principal",
    mas: "Más",
    destinoConAvisos: "{destino}{oculto: ({badge} avisos sin leer)}",
    destino_inicio: "Inicio",
    destino_feed: "Feed",
    destino_retos: "Retos",
    /** El hueco central de la barra de móvil: su texto real lo pone el CTA (`cta.*`). */
    destino_crear: "Subir vídeo",
    destino_ranking: "Ranking",
    destino_destacados: "Boost",
    destino_perfil: "Perfil",
    destino_puntos: "Puntos",
    destino_referidos: "Referidos",
    destino_vip: "Hazte VIP Mythic",
    destino_cuenta: "Cuenta",
  },
} as const);
