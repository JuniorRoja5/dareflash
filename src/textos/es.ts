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
    /** El título de cada sección que tiene su `error.tsx`. */
    titulo_puntos: "No hemos podido cargar tus puntos",
    titulo_monedero: "No hemos podido cargar tu monedero",
    titulo_empresa: "No hemos podido cargar esta sección",
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
  /**
   * Cómo se dice la duración de un Boost (`duracionBoostHumana`, vía `palabrasDuracion`): la unidad la
   * elige la función; aquí, las palabras. Va en el armazón: la pintan servidor y cliente.
   */
  duracion: {
    minutos: { one: "{n} minuto", other: "{n} minutos" },
    horas: { one: "{n} hora", other: "{n} horas" },
    horasMinutos: "{horas} h {minutos} min",
    enCrudo: "{valor} minutos",
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

  // ── Títulos de pestaña (P5b2a): solo los pide el servidor (`generateMetadata`) ─────────────────────
  titulos: {
    /** La descripción del sitio (`<meta name="description">`, layout raíz). */
    descripcionSitio: "{marca} — retos en vídeo corto con premios reales.",
    entrar: "Iniciar sesión",
    recuperar: "Recuperar contraseña",
    restablecer: "Restablecer contraseña",
    verificar: "Verificar tu cuenta",
    cambiarEmail: "Confirmar tu nuevo correo",
    perfil: "Perfil",
    editarPerfil: "Editar perfil",
    notificaciones: "Notificaciones",
    buscar: "Buscar",
    destacados: "Perfiles Boost",
    ranking: "Ranking",
    crear: "Crear",
    puntos: "Mis puntos",
    referidos: "Mis referidos",
    monedero: "Mi monedero",
    vip: "VIP Mythic",
    boosts: "Mis Boosts",
    empezar: "Empezar",
    altaEmpresa: "Registrar mi empresa",
  },

  // ── Acceso (P5b2a): entrar, crear cuenta, recuperar, restablecer, verificar, reactivar, correo ─────
  /** Lo que comparten los formularios de acceso: los campos y el ojo de la contraseña. */
  formAcceso: {
    correo: "Correo",
    /** La etiqueta del campo. (No se llama `contrasena`: el escáner de secretos lee clave + literal.) */
    etiquetaClave: "Contraseña",
    placeholderCorreo: "tu@correo.com",
    minimo10: "Mínimo 10 caracteres",
    mostrarContrasena: "Mostrar contraseña",
    ocultarContrasena: "Ocultar contraseña",
    iniciarSesion: "Iniciar sesión",
  },
  /**
   * La tarjeta de /entrar, con el cambio entre entrar y crear cuenta. «¿Nuevo por aquí?» y «Crear
   * cuenta» son DOS piezas, no una frase partida: una pregunta y, al lado, un BOTÓN con su propio
   * nombre (el mismo que el del panel de escritorio).
   */
  acceso: {
    introEntrar: "Entra para votar, comentar y subir tus retos.",
    nuevoPorAqui: "¿Nuevo por aquí?",
    crearCuenta: "Crear cuenta",
    introRegistro: "Únete y compite por premios de verdad. Es gratis.",
    yaTienesCuenta: "¿Ya tienes cuenta?",
    panelEntrar: "Inicia sesión y sigue compitiendo por premios de verdad.",
    panelRegistro: "Únete y compite por premios de verdad. Creas tu cuenta en segundos.",
  },
  login: {
    errorConexion: "No se pudo iniciar sesión. Reintenta.",
    demasiados: "Demasiados intentos. Espera un momento.",
    reenviado: "Si corresponde, te hemos reenviado el correo de verificación.",
    reenvioSinConexion: "No se pudo conectar. Reinténtalo más tarde.",
    verificaAntes: "Verifica tu correo antes de entrar.",
    reenviar: "Reenviar el correo de verificación",
    entrando: "Entrando…",
    olvidada: "He olvidado mi contraseña",
  },
  registro: {
    errorConexion: "No se pudo crear la cuenta. Reintenta.",
    pistaCorta: "Usa al menos 10 caracteres.",
    pistaLarga: "Mejor si es larga y no contiene palabras o secuencias obvias.",
    nacimiento: "Fecha de nacimiento",
    /** UNA frase con el enlace dentro (antes, trozo + enlace + «.»). */
    consentimiento:
      "Confirmo que soy mayor de edad y acepto los términos y la {enlace:política de privacidad}.",
    creando: "Creando…",
    teEnviaremos: "Te enviaremos un correo para verificar tu cuenta.",
  },
  recuperar: {
    titulo: "Recuperar contraseña",
    intro: "Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.",
    yaTeAcuerdas: "¿Ya te acuerdas? {enlace:Iniciar sesión}",
    demasiados: "Demasiados intentos. Espera un momento antes de volver a probar.",
    noSePudo: "No se pudo enviar el enlace. Revisa el correo y reinténtalo.",
    sinConexion: "No se pudo conectar. Inténtalo de nuevo más tarde.",
    revisaCorreo: "Revisa tu correo.",
    hecho:
      "Si esa cuenta existe, te hemos enviado un enlace para restablecer la contraseña. Revisa tu correo. El enlace caduca en 30 minutos.",
    enviando: "Enviando…",
    enviar: "Enviar enlace",
  },
  restablecer: {
    titulo: "Nueva contraseña",
    hecho: "Contraseña actualizada. Ya puedes iniciar sesión con la nueva.",
    ocupado: "El servicio está ocupado. Reinténtalo en unos segundos.",
    validacion: "Elige una contraseña de al menos 10 caracteres, larga y poco predecible.",
    caducado: "El enlace para restablecer la contraseña es inválido o ha caducado.",
    sinConexion: "No se pudo conectar. Inténtalo de nuevo más tarde.",
    faltaToken: "Falta el token en el enlace. Abre el enlace completo del correo de recuperación.",
    pedirNuevo: "Pedir un enlace nuevo",
    listo: "Listo.",
    yaUsado:
      "Si ya has cambiado tu contraseña, este enlace deja de funcionar: inicia sesión con la nueva. Si ha caducado, pide otro.",
    elige: "Elige una contraseña nueva para tu cuenta.",
    nuevaContrasena: "Nueva contraseña",
    guardando: "Guardando…",
    guardar: "Guardar contraseña",
    cargando: "Cargando…",
  },
  /**
   * /unlock. Los textos van TAL CUAL se veían, también sin tildes («sesion», «invalido»): la P5b2 no
   * cambia ni una letra del castellano. Corregirlos es un cambio visible y se hace aparte.
   */
  desbloquear: {
    titulo: "Reactivar tu cuenta",
    hecho: "Cuenta reactivada. Ya puedes intentar iniciar sesion de nuevo.",
    error: "El enlace de desbloqueo es invalido o ha caducado.",
    sinConexion: "No se pudo conectar. Intentalo de nuevo mas tarde.",
    faltaToken: "Falta el token en el enlace. Abre el enlace completo del correo de desbloqueo.",
    frenada: "Tu cuenta se freno temporalmente por demasiados intentos. Pulsa para reactivarla.",
    reactivando: "Reactivando...",
    reactivar: "Reactivar mi cuenta",
    vuelveAIntentar: "Vuelve a intentar iniciar sesion.",
    volverInicio: "Volver al inicio",
    yaUsado:
      "Si ya has reactivado tu cuenta, este enlace deja de funcionar: vuelve a intentar iniciar sesion. Si el enlace ha caducado y sigues bloqueado, al intentarlo de nuevo te enviaremos uno nuevo.",
    cargando: "Cargando...",
  },
  /** /verify. Igual que /unlock: los textos sin tilde van tal cual se veían. */
  verificar: {
    titulo: "Verificar tu cuenta",
    cargando: "Cargando…",
    hecho: "Cuenta verificada. Ya puedes iniciar sesion.",
    error: "El enlace de verificacion es invalido o ha caducado.",
    sinConexion: "No se pudo conectar. Intentalo de nuevo mas tarde.",
    faltaToken: "Falta el token en el enlace. Abre el enlace completo del correo de verificación.",
    pulsa: "Pulsa el botón para confirmar tu dirección de correo.",
    verificando: "Verificando…",
    verificar: "Verificar mi cuenta",
    yaUsado:
      "Si ya has verificado tu cuenta, este enlace deja de funcionar: puedes iniciar sesión directamente.",
    reenviado: "Si corresponde, te hemos reenviado el correo de verificación.",
    demasiados: "Demasiados intentos. Intenta más tarde.",
    reenvioSinConexion: "No se pudo conectar. Inténtalo de nuevo más tarde.",
    reenviarEtiqueta: "Reenviar el correo de verificación",
    enviando: "Enviando…",
    reenviar: "Reenviar",
  },
  cambioEmail: {
    titulo: "Confirmar tu correo",
    hecho: "Correo actualizado. Vuelve a iniciar sesión con tu nueva dirección.",
    noValido: "Este enlace ya no es válido.",
    sinConexion: "No hemos podido conectar. Inténtalo de nuevo.",
    faltaToken:
      "Falta el token en el enlace. Ábrelo completo desde el correo que te hemos enviado.",
    pulsa:
      "Pulsa para confirmar que esta dirección es tuya. Al hacerlo se cerrarán tus sesiones abiertas.",
    confirmando: "Confirmando…",
    confirmar: "Confirmar mi correo",
  },

  // ── Notificaciones, buscar, destacados, ranking y crear (P5b2a) ──────────────────────────────────
  notificaciones: {
    titulo: "Notificaciones",
    vacioAntiguos: "No hay avisos más antiguos.",
    vacio: "Aún no tienes avisos. Sube un vídeo o participa en un reto y aquí verás lo que pase.",
    volverRecientes: "Volver a las más recientes",
    explorarRetos: "Explorar retos",
    avisoNuevo: "{oculto:Nuevo: }{texto}",
    paginasAria: "Páginas de avisos",
    verAntiguas: "Ver más antiguas",
  },
  buscar: {
    titulo: "Buscar",
    sinConexion: "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.",
    tiposAria: "Tipo de búsqueda",
    tab_usuarios: "Usuarios",
    tab_retos: "Retos",
    tab_categorias: "Categorías",
    placeholder_usuarios: "Buscar personas…",
    placeholder_retos: "Buscar retos…",
    etiqueta: "Buscar",
    minimo: "Escribe al menos 2 caracteres para buscar.",
    buscando: "Buscando…",
    sinResultados: "Sin resultados para «{termino}».",
    cargando: "Cargando…",
    cargarMas: "Cargar más",
  },
  /** /destacados, la vitrina de Boost (servidor). */
  destacados: {
    /** El corte de línea es del titular: va DENTRO (`{salto:}`), y al traducir cae donde toque. */
    titular: "Bajo los focos{salto:}ahora mismo",
    intro:
      "Quien enciende un Boost sube al escenario durante {duracion}. No se gana ganando retos: se gana apareciendo. El último en activar entra arriba.",
    destacar: "Destacar mi perfil",
    destacarDetalle: "Consigue visibilidad ahora",
    vacioTitulo: "Ahora mismo no hay ningún perfil destacado.",
    vacioTexto:
      "Cuando alguien gaste un Boost, aparecerá aquí y en la portada. Puedes ser el primero.",
    noEsRanking:
      "Esto no es el ranking: aquí se aparece por haber gastado un Boost, no por ganar retos. {enlace:Ver el ranking del mes}.",
  },
  /** /ranking: el conmutador, la lista y el podio (islas de CLIENTE). */
  ranking: {
    titulo: "Clasificación",
    /** Etiquetas FIJAS del conmutador: el título del reto va en su cabecera, no en el botón. */
    vista_mensual: "Este mes",
    vista_reto: "Último reto",
    vistaAria: "Vista de la clasificación",
    cabeceraReto: "Clasificación de «{titulo}»",
    vacioTitulo: "Aún no ha ganado nadie este mes",
    vacioDetalle:
      "La clasificación se llena cuando cierra el primer reto. Participa y sé el primero en ganar.",
    listaAria: "Clasificación (del {n}º en adelante)",
    unidadVictoria: { one: "victoria", other: "victorias" },
    unidadVoto: { one: "voto", other: "votos" },
    cargando: "Cargando…",
    verMas: "Ver más",
    sinParticipaciones: "Ese reto cerró sin participaciones publicadas.",
  },
  /** /crear (servidor). */
  crear: {
    titulo: "Subir tu vídeo",
    intro:
      "Comparte tu vídeo (máx. 90 segundos). Se procesa y aparece en tu perfil cuando esté listo.",
  },
  /**
   * La ventana de subir un vídeo (`ModalSubida`, isla de CLIENTE: /crear y la ficha de un reto). Los
   * mensajes de cada ESTADO de la subida («Subiendo tu vídeo…», «en cola»…) siguen en `copySubida`
   * (lib/estado-subida), que comparte con los avisos del servidor: van a la P5b3.
   */
  subida: {
    lanzar: "Subir un vídeo",
    tituloParticipar: "Participar con tu vídeo",
    tituloSubir: "Subir tu vídeo",
    cerrar: "Cerrar",
    demasiadoGrande:
      "El vídeo supera el límite de {gb} GB. Elige uno más corto o de menor calidad.",
    /** Tal cual estaba (sin tildes): la P5b2 no cambia ni una letra. */
    duracionExcedida: "Tu video reto supera los 90 segundos. Ajustalo y empieza el reto de nuevo",
    miniaturaTipo: "La miniatura debe ser una imagen JPG, PNG o WebP.",
    miniaturaGrande: "La miniatura es demasiado grande. Prueba con una imagen más ligera.",
    miniaturaFallo: "No se pudo aplicar la miniatura; se usará una automática.",
    tituloVacio: "El título no puede estar vacío. Escribe de qué va tu vídeo.",
    sinVideo: "Elige o graba un vídeo primero.",
    sinSesion: "Inicia sesión para publicar tu vídeo.",
    noSePudo: "No se pudo preparar la subida. Inténtalo de nuevo.",
    duracionMaxima: "Duración máxima: 90 segundos",
    /** Las entradas de vídeo de cada dispositivo (`entradasVideo`), y cuando ya hay uno elegido. */
    entrada_grabar: "Grabar",
    entrada_galeria: "Galería",
    entrada_elegir: "Elegir vídeo",
    entradaOtro_grabar: "Grabar otro",
    entradaOtro_galeria: "Galería otro",
    entradaOtro_elegir: "Elegir vídeo otro",
    titulo: "Título",
    tituloPlaceholder: "Ej.: Mi mejor salto en caja",
    categoria: "Categoría",
    miniatura: "Miniatura {resaltado:(opcional)}",
    previaMiniatura: "Vista previa de la miniatura",
    cambiarImagen: "Cambiar imagen",
    elegirImagen: "Elegir imagen",
    /** El estado (de `copySubida`) con el porcentaje: «Subiendo tu vídeo… 45 %». */
    conProgreso: "{estado} {porcentaje} %",
    reintentar: "Reintentar",
    publicar: "Publicar",
  },

  // ── Puntos y referidos (P5b2a, servidor) ─────────────────────────────────────────────────────────
  puntos: {
    /** El H1 es la cifra; esto es lo que oye un lector de pantalla delante (UNA frase, P5b2a). */
    tusPuntosOculto: "{oculto:Tus puntos: }{puntos}",
    tusPuntos: "Tus puntos",
    racha: { one: "Racha de {n} día", other: "Racha de {n} días" },
    empiezaRacha: "Empieza tu racha hoy",
    maximo: "Nivel máximo. No hay nada por encima de {nivel}.",
    progresoAria: "Progreso hacia {nivel}",
    /** UNA frase con sus dos cifras resaltadas dentro (antes, cinco trozos). */
    progreso: {
      one: "{resaltado:{porcentaje}%} · faltan {resaltado:{n}} punto para {nivel}",
      other: "{resaltado:{porcentaje}%} · faltan {resaltado:{n}} puntos para {nivel}",
    },
    metricaTotales: "Puntos totales",
    metricaNivel: "Nivel actual",
    piePartida: "El punto de partida",
    pieDesde: "Desde {n} puntos",
    metricaProgreso: "Progreso al siguiente",
    pieMaximo: "Ya estás en el nivel más alto",
    pieFaltan: "Faltan {n} para {nivel}",
    escalera: "Los cinco niveles",
    desdePrimerDia: "Desde el primer día",
    estasAqui: "Estás aquí",
    comoGanar: "Cómo ganar puntos",
    fase: "Fase {n}",
    proximamente: "Próximamente",
    historial: "Tu historial de puntos",
    historialVacio:
      "Todavía no tienes movimientos. Gana un reto o invita a alguien y aparecerán aquí.",
    col_fecha: "Fecha",
    col_concepto: "Concepto",
    col_detalle: "Detalle",
    col_puntos: "Puntos",
    /** Cada acción del catálogo (`ACCIONES_PUNTOS`), por su razón. La cifra sale de la config. */
    accion_WIN_CHALLENGE: "Ganar un reto",
    accion_TOP20: "Entrar en el top 20 de un reto",
    accion_VIDEOS_PUBLICADOS: "Publicar {n} vídeos",
    accion_INVITE_FRIEND: "Invitar a alguien que verifica su correo",
    accion_REGISTERED_WITH_REFERRAL: "Registrarte con la invitación de alguien",
    accion_RACHA_7_DIAS: "Racha de {n} días seguidos",
    accion_VIDEO_50_LIKES: "Recibir {n} likes en un vídeo",
  },
  /**
   * El motivo de cada movimiento en el historial PROPIO (segunda persona). Qué frase toca lo decide
   * `claveRazonPropia` (lib/razones-puntos). El AJUSTE del equipo se dice por su signo —el usuario no
   * tiene por qué deducir del número qué le ha pasado— y NO dice por qué (el porqué es la nota interna
   * del ajuste, escrita para el equipo) ni repite la cifra (va en su columna). `propia_ADMIN_AJUSTE` es
   * la frase neutra, para cuando no se sabe el importe. El panel habla en tercera persona y no pasa
   * por aquí.
   */
  razonesPuntos: {
    propia_WIN_CHALLENGE: "Ganaste un reto",
    propia_TOP20: "Entraste en el top 20",
    propia_VIDEOS_PUBLICADOS: "Publicaste vídeos suficientes para un hito",
    propia_INVITE_FRIEND: "Invitaste a alguien que verificó su correo",
    propia_REGISTERED_WITH_REFERRAL: "Te registraste con una invitación",
    propia_RACHA_7_DIAS: "Mantuviste una racha de 7 días",
    propia_VIDEO_50_LIKES: "Tu vídeo llegó a 50 likes",
    propia_ADMIN_AJUSTE: "Ajuste del equipo",
    propia_ajusteSuma: "El equipo te añadió puntos",
    propia_ajusteResta: "El equipo te retiró puntos",
  },
  referidos: {
    titulo: "Invita y gana puntos",
    /** UNA frase con la recompensa resaltada dentro (en un `<strong>`: lo elige el código). */
    recompensa: {
      one: "Ganas {resaltado:{n} punto} cuando tu invitado verifica su correo. Tu invitado gana otros tantos.",
      other:
        "Ganas {resaltado:{n} puntos} cuando tu invitado verifica su correo. Tu invitado gana otros tantos.",
    },
    tuEnlace: "Tu enlace",
    tuCodigo: "Tu código",
    sinEnlace: "No hemos podido cargar tu enlace. Recarga la página.",
    qr: "Código QR con tu enlace de invitación",
    escanear: "O que lo escaneen desde tu pantalla",
    metricaInvitados: "Invitados",
    metricaPuntos: "Puntos ganados",
    piePuntos: "Por invitaciones que ya verificaron",
    metricaPendientes: "Pendientes de verificar",
    piePendientes: "Todavía no te han dado puntos",
    historial: "A quién has invitado",
    vacio: "Todavía no se ha registrado nadie con tu enlace. Compártelo y aparecerán aquí.",
    vacioMasAdelante: "No queda nadie más por aquí.",
    seUnio: "Se unió el {fecha}",
    ganados: "+{n} ganados",
    pendiente: "Pendiente de verificar",
    formas: "Invitar es una de las formas de ganar puntos. {enlace:Ver todas y tu nivel}.",
  },

  // ── El monedero (P5b2a) ──────────────────────────────────────────────────────────────────────────
  /** Lo que pinta el SERVIDOR: el saldo, la información de los cobros y los movimientos. */
  monedero: {
    tuMonedero: "Tu monedero",
    /** Lo que oye un lector de pantalla delante del importe (un componente, no texto: va aparte). */
    saldoOculto: "Saldo disponible:",
    intro:
      "Lo que ganas en los retos se acumula aquí. Cuando llegues al mínimo, puedes pedir que te lo enviemos al banco.",
    puedesCobrar: "Puedes cobrar desde {importe}",
    faltanMinimo: "Te faltan {importe} para el mínimo",
    enCurso: "{importe} en curso",
    cobrados: "{importe} cobrados",
    sinGanar: "Todavía no has ganado nada. Gana un reto y el premio aparecerá aquí.",
    infoAria: "Información sobre los cobros",
    infoResumen: "Cómo funciona el cobro y las comisiones",
    comoFunciona: "Cómo funciona",
    comoFuncionaTexto:
      "Al pedir un cobro, ese importe sale de tu saldo al momento, el equipo lo revisa y te lo envía por el método que elijas. Puede tardar unos días. Si lo rechazamos, el dinero vuelve entero a tu monedero.",
    comisiones: "Comisiones",
    comisionesTexto:
      "Las comisiones del banco corren por tu cuenta, no por la de {marca}. Recibirás el importe solicitado menos esas comisiones: si pides {pides}, pueden llegarte, por ejemplo, {llegan}.",
    solicitudes: "Tus solicitudes",
    movimientos: "Últimos movimientos",
    movimientosVacio: "Todavía no hay movimientos. Aquí verás cada entrada y salida de tu saldo.",
    col_fecha: "Fecha",
    col_concepto: "Concepto",
    col_importe: "Importe",
    /**
     * QUÉ FUE CADA MOVIMIENTO, dicho para su dueño, por su `refType` (antes `CONCEPTO_MOVIMIENTO`, en la
     * config): la fila guarda el HECHO y esto lo traduce, así que reescribir una frase reescribe también
     * los movimientos antiguos. El AJUSTE del admin se llama por su nombre —disfrazarlo de premio sería
     * mentir en el historial de dinero de alguien— y aquí no entra ni su motivo ni quién lo firmó (eso
     * es traza interna, en el `AuditLog`).
     */
    concepto_PRIZE: "Premio de un reto",
    concepto_WITHDRAWAL: "Cobro solicitado",
    concepto_WITHDRAWAL_REFUND: "Cobro devuelto",
    concepto_ADMIN: "Ajuste del equipo",
    /** Un `refType` que ya no está en el catálogo: honesto, no un hueco. */
    conceptoOtro: "Movimiento",
  },
  /**
   * Las islas de CLIENTE del monedero: las solicitudes, los métodos y el formulario de pedir. Los
   * ESTADOS y el nombre de un método son el MISMO vocabulario que el panel (`ETIQUETA_ESTADO` y
   * `nombreDeMetodo`, en lib/retirada, que el panel lee en castellano): un test exige que digan lo
   * mismo, porque quien escribe a soporte cita la palabra que ve. El recorrido nombra EVENTOS («Pedida»)
   * y el chip ESTADOS («Pendiente»): no son la misma palabra.
   */
  cobros: {
    estado_PENDING: "Pendiente",
    estado_APPROVED: "Aceptada",
    estado_PROCESSING: "En proceso",
    estado_PAID: "Pagada",
    estado_REJECTED: "Rechazada",
    evento_PENDING: "Pedida",
    evento_APPROVED: "Aceptada",
    evento_PROCESSING: "En proceso",
    evento_PAID: "Pagada",
    evento_REJECTED: "Rechazada",
    metodo_BANK: "Cuenta bancaria",
    metodoGenerico: "Método de cobro",
    destino: "{metodo} ····{pista}",
    col_fecha: "Fecha",
    col_metodo: "Método",
    col_importe: "Importe",
    col_estado: "Estado",
    pedidaEl: "Pedida el",
    rechazadaEl: "Rechazada el",
    ultimaActualizacion: "Última actualización",
    devuelto: "{importe} {resaltado:· devuelto a tu saldo}",
    /** El motivo llega YA en la frase del servidor (`fraseDeRechazo`); aquí solo se resalta. */
    conMotivo: "{resaltado:{motivo}} El importe volvió entero a tu monedero.",
    sinMotivo:
      "No hemos podido completar este cobro y el importe volvió entero a tu monedero. Si no sabes por qué se rechazó, escríbenos.",
    errorMas: "No hemos podido cargar más. Inténtalo otra vez.",
    vacio: "Todavía no has pedido ningún cobro.",
    cargando: "Cargando…",
    verMas: "Ver más",
    dondeCobrar: "Dónde cobrar",
    nMetodos: { one: "{n} método", other: "{n} métodos" },
    /** «Reemplazar», no «editar»: los datos no vuelven del servidor, así que no hay nada que editar. */
    reemplazar: "Reemplazar",
    borrar: "Borrar",
    anadir: "+ Añadir método de cobro",
    cifradosConSaldo: "Se guardan cifrados; el equipo solo los ve al procesar un cobro tuyo.",
    cifradosSinSaldo:
      "Déjalos listos aunque todavía no tengas saldo: cuando ganes, cobras sin fricción. Se guardan cifrados; el equipo solo los ve al procesar un cobro tuyo.",
    formAria_reemplazar: "Reemplazar método de cobro",
    formAria_anadir: "Añadir método de cobro",
    tituloReemplazar: "Reemplazar este método",
    tituloNuevo: "Nuevo método de cobro",
    cancelar: "Cancelar",
    reemplazoAviso:
      "Escríbelo entero otra vez: guardamos los datos cifrados y no vuelven a salir del servidor, ni siquiera para rellenar este formulario. Al guardar, reemplaza al anterior — y no cambia a dónde va un cobro que ya hayas pedido.",
    iban: "IBAN",
    ibanPlaceholder: "ES00 0000 0000 0000 0000 0000",
    titular: "Nombre del titular",
    errorGuardar: "No hemos podido guardar ese método.",
    errorBorrar: "No hemos podido borrar ese método.",
    guardando: "Guardando…",
    reemplazarMetodo: "Reemplazar método",
    guardarMetodo: "Guardar método",
    pedirTitulo: "Pedir un cobro",
    importe: "Importe",
    minimoDisponible: "Mínimo {minimo} · disponible {disponible}",
    aDonde: "A dónde",
    errorPedir: "No hemos podido registrar tu solicitud.",
    hecho: "Solicitud registrada. El importe ya ha salido de tu saldo y el equipo la revisará.",
    enviando: "Enviando…",
    pedir: "Pedir cobro",
  },

  // ── VIP y Boost (P5b2a) ──────────────────────────────────────────────────────────────────────────
  /** Lo que pinta el SERVIDOR en /vip. */
  vip: {
    titulo: "VIP Mythic",
    intro:
      "La membresía premium de {marca}. Tu nombre y tu perfil destacan en toda la plataforma, y cada semana recibes un Boost para ponerte en el espacio destacado.",
    alMes: "al mes",
    cancelaCuando: "Cancela cuando quieras · acceso hasta fin de periodo",
    incluye: "Lo que incluye",
    /**
     * LO QUE INCLUYE, por la clave de `BENEFICIOS_VIP` (config): esa lista SOLO puede nombrar lo que
     * existe; aquí está cómo se dice cada cosa. El «valor 5$» del documento maestro no se escribe.
     */
    beneficio_boostSemanal: "1 Boost gratis por semana",
    beneficio_colorNombre: "Nombre destacado con el color que elijas",
    beneficio_insignia: "Insignia Mythic en tu perfil, el feed y los comentarios",
    beneficio_perfilAnimado: "Perfil animado con borde neón",
    beneficio_toque: "Puedes dar un toque a otros perfiles",
    eresVip: "Eres VIP Mythic",
    terminaConFecha: "Tu suscripción no se renovará. Mantienes el VIP hasta el {fecha}.",
    terminaSinFecha: "Tu suscripción no se renovará. Mantienes el VIP hasta el fin del periodo.",
    renuevaConFecha: "Activa. Se renueva el {fecha}.",
    renuevaSinFecha: "Activa.",
  },
  /** Las islas de CLIENTE de /vip: suscribirse, darse de baja y la vuelta de Stripe. */
  vipCliente: {
    hazte: "Hazte VIP Mythic",
    abriendo: "Abriendo el pago…",
    sinConexion: "No hemos podido conectar. Inténtalo otra vez.",
    pagoSeguro: "Pago seguro con Stripe. Renovación mensual; cancelas cuando quieras.",
    cancelarSuscripcion: "Cancelar suscripción",
    avisoBaja:
      "Seguirás siendo VIP Mythic hasta que acabe el periodo que ya has pagado. No hay reembolso ni prorrateo.",
    dandoDeBaja: "Dando de baja…",
    siBaja: "Sí, dar de baja",
    seguir: "Seguir siendo VIP",
    actualizando: "Actualizando…",
    actualizar: "Actualizar",
    sinCompletar: "No has completado el pago. No se te ha cobrado nada.",
    cerrando: "Cerrando…",
    cerrar: "Cerrar",
    pagoRecibido: "Pago recibido.",
    confirmando: "Tu suscripción se confirma en unos segundos. Si no la ves aquí, actualiza.",
  },
  /** Lo que pinta el SERVIDOR en /boosts. */
  boosts: {
    tusBoosts: "Tus Boosts",
    tusBoostsOculto: "{oculto:Tus Boosts: }{saldo}",
    /** UNA frase con «tu perfil» resaltado (en un `<strong>`) y la duración dentro. */
    queHace:
      "Un Boost pone {resaltado:tu perfil} en el espacio destacado {duracion}, donde lo ve quien entra. No caducan: se quedan en tu saldo hasta que los uses.",
    usadasHoy: "Has destacado {usadas} de {limite} veces hoy",
    maximoDia: "Máximo {n} al día",
    destacadoAhora: "· Destacado ahora mismo",
    espacioDestacado: "El espacio destacado",
    metricaDisponibles: "Boosts disponibles",
    pieCompra: "Compra uno para destacar",
    pieNoCaducan: "No caducan",
    metricaQuedan: "Te quedan hoy",
    pieDe: "De {n} apariciones al día",
    metricaComprados: "Comprados en total",
    pieDesde: "Desde que tienes la cuenta",
    pieNinguno: "Todavía ninguno",
    movimientos: "Tus movimientos de Boosts",
    historialVacio: "Todavía no tienes movimientos. Cuando compres Boosts, aparecerán aquí.",
    comoFunciona: "Cómo funciona",
    paso1Titulo: "Compras Boosts",
    paso1Texto: "Se acreditan en tu saldo cuando el pago se confirma. No caducan nunca.",
    paso2Titulo: "Gastas uno para destacar",
    paso2Texto:
      "Cada Boost pone tu perfil en el espacio destacado {duracion}. Como máximo {n} veces al día.",
    paso3Titulo: "Te ve quien entra",
    paso3Texto:
      "Sales en la portada, donde más gente pasa, y el último en activar aparece primero. No está escondido en una sección.",
    /**
     * Cuándo se reinicia el contador: con la hora de quien mira, o «cada día» si no sabemos su zona.
     * DOS frases enteras (antes, una frase con «a las 01:00» / «cada día» empalmado en medio).
     */
    reinicioConHora:
      "El contador de {n} al día se reinicia a las {hora}. Los Boosts sin gastar no caducan.",
    reinicioSinHora:
      "El contador de {n} al día se reinicia cada día. Los Boosts sin gastar no caducan.",
  },
  /** El motivo de cada movimiento de Boosts en el historial PROPIO (como `razonesPuntos`). */
  razonesBoost: {
    propia_PURCHASE: "Compraste Boosts",
    propia_VIP_WEEKLY: "Boost de tu VIP semanal",
    propia_ACTIVATION: "Destacaste tu perfil",
    propia_REFUND: "Devolución de una compra",
    propia_ADMIN_ADJUST: "Ajuste del equipo",
    propia_ajusteSuma: "El equipo te añadió Boosts",
    propia_ajusteResta: "El equipo te retiró Boosts",
  },
  /** Las islas de CLIENTE de /boosts: activar, comprar y la vuelta de la compra. */
  boostCliente: {
    listo: "Listo: tu perfil está destacado {duracion}.",
    repetida: "Ya estaba hecho: no se ha gastado otro Boost.",
    errorActivar: "No se ha podido destacar tu perfil.",
    sinConexionActivar: "No hemos podido conectar. Reinténtalo: si ya se activó, no se repetirá.",
    destacando: "Destacando…",
    destacar: "Destacar mi perfil ahora",
    /** El titular dice QUÉ pasa; el texto (lo manda también la ruta) dice QUÉ hacer. */
    agotadoTitulo: "Ahora mismo está todo lleno",
    yaDestacado:
      "Ya estás destacado ahora mismo. Si activas otro, se gasta un Boost, vuelves al primer puesto y alargas tu presencia. Sigues ocupando un solo sitio.",
    queRecibes:
      "Tu perfil destaca durante {duracion}: siempre en Perfiles Boost y por turnos en la portada, al menos {minutos} minutos.",
    comprarBoosts: "Comprar Boosts",
    mejorPrecio: "Mejor precio",
    unidades: { one: "{n}{resaltado:Boost}", other: "{n}{resaltado:Boosts}" },
    porBoost: "por Boost",
    ahorras: "· ahorras un {porcentaje}%",
    abriendo: "Abriendo el pago…",
    comprar: "Comprar",
    sinConexion: "No hemos podido conectar. Inténtalo otra vez.",
    sinCompletar: "No has completado el pago. No se te ha cobrado nada.",
    cerrando: "Cerrando…",
    cerrar: "Cerrar",
    pagoRecibido: "Pago recibido.",
    aparecen: "Tus Boosts aparecen en el saldo en unos segundos. Si no los ves, actualiza.",
    actualizando: "Actualizando…",
    actualizar: "Actualizar",
  },

  // ── Empresas: el camino de entrada (P5b2b) ───────────────────────────────────────────────────────
  /**
   * Lo que se le dice a un NEGOCIO fuera de su portal: el botón de /entrar y de la portada, el camino
   * de /empezar y el aviso de Socios Fundadores. Las CIFRAS (créditos, días, la fecha) salen de la
   * config; aquí, cómo se dicen. El panel y los servicios siguen con su castellano en la config
   * (`fraseRegaloPublico`, `fraseCreditoPublica`, `ETIQUETA_TIPO_*`): un test exige que digan
   * exactamente lo mismo.
   */
  negocio: {
    cta: "¿Tienes un negocio? Regístralo aquí",
    caminoTitulo: "Soy un negocio",
    caminoCuerpo:
      "Patrocina retos y anúnciate donde está tu gente. Una cuenta de empresa lo ve todo, pero no participa: ni sube vídeos ni vota.",
    caminoCta: "Registrar mi empresa",
    /** UNA frase entera (antes, cuatro trozos empalmados en la config). */
    socioFundador:
      "Socios Fundadores: las empresas que verifiquemos antes del {fecha} se llevan {creditos} créditos de publicidad de regalo: hasta {diasLocal} {alcanceLocal} si tienes un local, o {diasFuera} {alcanceFuera} si vendes online o eres una marca.",
    dias: { one: "{n} día", other: "{n} días" },
    regaloEn_CIUDAD: "anunciándote en tu ciudad",
    regaloEn_ESTADO: "anunciándote en tu región",
    regaloEn_PAIS: "anunciándote en un país",
    regaloEn_GLOBAL: "anunciándote en todo el mundo",
    /** Cuánto cuesta un día de campaña, con las cifras de `CREDITOS_POR_DIA`. */
    creditoDia: {
      one: "Un día de campaña cuesta {n} crédito en una ciudad y {global} en todo el mundo, y se descuenta cada día que se muestra.",
      other:
        "Un día de campaña cuesta {n} créditos en una ciudad y {global} en todo el mundo, y se descuenta cada día que se muestra.",
    },
    /** Las etiquetas de los tipos (`ETIQUETA_TIPO_*`, que el panel sigue leyendo en castellano). */
    tipoCuenta_EMPRESA: "Empresa",
    tipoCuenta_MARCA_PERSONAL: "Marca personal",
    tipoNegocio_FISICO: "Negocio físico",
    tipoNegocio_ONLINE: "Negocio online",
    tipoNegocio_MARCA_O_DIGITAL: "Marca o producto digital",
  },
  /** /empezar: los dos caminos (servidor). */
  empezar: {
    titulo: "¿Cómo quieres usar {marca}?",
    subtitulo: "Dos cuentas distintas, y no se pueden mezclar: elige con cuál entras.",
    participante: "Participante",
    negocio: "Negocio",
    participarTitulo: "Quiero participar",
    participarCuerpo: "Sube tus vídeos, compite en los retos y gana premios de verdad.",
    participarCta: "Crear mi cuenta",
  },
  /** El formulario del alta de empresa (isla de CLIENTE; los tipos, del espacio `negocio`). */
  altaFormulario: {
    falta_nombre: "el nombre",
    falta_contacto: "la persona de contacto",
    falta_webRedes: "la web o las redes",
    falta_correo: "el correo",
    falta_clave: "la contraseña",
    falta_acepta: "aceptar la política de privacidad",
    errorRegistrar: "No hemos podido registrar la empresa.",
    sinConexion: "No hemos podido conectar. Reinténtalo.",
    recibido: "Recibido.",
    bloqueNegocio: "Tu negocio",
    nombre: "Nombre comercial",
    nombrePlaceholder: "Como te conoce la gente",
    quienFirma: "¿Quién firma la cuenta?",
    claseNegocio: "¿Qué clase de negocio es?",
    bloqueUbicacion: "Ubicación",
    pais: "País",
    ciudad: "Ciudad (opcional)",
    ciudadPlaceholder: "Dónde estáis",
    direccion: "Dirección (opcional)",
    direccionPlaceholder: "Calle y número",
    direccionAyuda: "Solo para comprobar quién eres: no se publica.",
    bloqueContacto: "Contacto",
    persona: "Persona de contacto",
    personaPlaceholder: "Con quién hablamos",
    web: "Web",
    webPlaceholder: "https://…",
    redes: "Redes",
    redesPlaceholder: "@tunegocio, un enlace…",
    bloqueFiscal: "Datos fiscales (opcional)",
    fiscalDescripcion:
      "La identificación fiscal solo la vemos nosotros al verificarte: no sale en ningún listado ni en ningún correo.",
    fiscal: "Identificación fiscal",
    fiscalPlaceholder: "NIF, CIF, RUT, RFC…",
    fiscalPais: "País que la emite",
    sinIndicar: "Sin indicar",
    bloqueAcceso: "Acceso",
    correo: "Correo",
    etiquetaClave: "Contraseña",
    /** UNA frase con el enlace dentro. */
    acepto: "Acepto la {enlace:política de privacidad} y los términos.",
    /** En móvil, lo primero que falta y cuántos más; con ancho, la lista entera. */
    faltaUno: "Falta: {campo}.",
    faltaYMas: "Falta: {campo} y {n} más.",
    faltaLista: "Falta: {lista}.",
    enviando: "Enviando…",
    crear: "Crear cuenta de empresa",
  },
  /** /empezar/empresa: la página (servidor). */
  altaEmpresa: {
    titulo: "Registra tu empresa",
    intro:
      "Las revisamos a mano, una por una. Cuéntanos quién eres y te escribimos en cuanto esté.",
    queTeLlevas: "Qué te llevas",
    llevaRetos: "Patrocina retos con tu marca: tú pones el reto y el premio.",
    llevaCreditos: "Créditos de publicidad: {frase}",
    llevaNoParticipas: "Lo ves todo, pero no participas: ni subes vídeos ni votas.",
    despues: "Después de enviar",
    paso1: "Te enviamos un correo para confirmar tu dirección.",
    paso2: "Revisamos tu empresa a mano, una por una.",
    paso3: "Te escribimos en cuanto la decidamos. Si no podemos verificarla, te decimos por qué.",
  },

  // ── Perfil (P5b2a): el propio y el público comparten la vista ────────────────────────────────────
  /** Lo que pinta el SERVIDOR en la tarjeta del perfil (`PerfilVista`). */
  perfil: {
    /** Lo que trae el plan, como ETIQUETAS (no controles). El «×1» es una cifra y va aparte. */
    perk_boost: "Boost semanal",
    perk_toque: "Toque a otros perfiles",
    perk_animado: "Perfil animado",
    /** La palabra bajo el emblema VIP: el nombre del plan. */
    mythic: "Mythic",
    racha: { one: "{n} día seguido", other: "{n} días seguidos" },
    instagram: "Instagram",
    youtube: "YouTube",
    retosGanados: "Retos ganados",
    puntos: "Puntos",
    videos: "Vídeos",
    misVideos: "Mis vídeos",
    destacar: "Destacar mi perfil (Boost)",
    editar: "Editar perfil",
    puntosNivel: "Mis puntos y nivel",
    monedero: "Mi monedero",
    referidos: "Ir a mis referidos",
    notificaciones: "Notificaciones",
  },
  /** La rejilla de vídeos del perfil, su celda y el diálogo de borrar (islas de CLIENTE). */
  perfilVideos: {
    vacioPropio: "Todavía no has publicado ningún vídeo. Cuando publiques uno, aparecerá aquí.",
    vacioAjeno: "Este perfil aún no tiene vídeos publicados.",
    cargando: "Cargando…",
    verMas: "Ver más vídeos",
    /** El estado de cada vídeo, solo en el perfil propio (el usuario nunca ve PENDING/FAILED…). */
    estado_procesando: "Procesando",
    estado_publicado: "Publicado",
    "estado_demasiado-largo": "No publicado: supera los 90 segundos",
    "estado_no-disponible": "Este vídeo ya no está disponible",
    estado_error: "No se pudo procesar",
    reproducirTitulo: "Reproducir «{titulo}»",
    reproducir: "Reproducir vídeo",
    /** Con título y sin él: dos frases enteras, no «Borrar» + un nombre pegado. */
    borrarConTitulo: "Borrar «{titulo}»",
    borrarSinTitulo: "Borrar este vídeo",
    preguntaConTitulo: "¿Borrar «{titulo}»?",
    preguntaSinTitulo: "¿Borrar este vídeo?",
    irreversible: "Esta acción no se puede deshacer: el vídeo se elimina para siempre.",
    sesionCaducada: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
    errorBorrar: "No hemos podido borrar el vídeo. Reinténtalo.",
    sinSesion: "Inicia sesión para borrar el vídeo.",
    sinConexion: "No hemos podido conectar. Inténtalo de nuevo.",
    cancelar: "Cancelar",
    borrando: "Borrando…",
    borrar: "Borrar",
  },
  /** /perfil/editar: la página y el formulario del perfil y la foto. */
  editarPerfil: {
    sinSesionTitulo: "Edita tu perfil",
    sinSesionTexto:
      "Inicia sesión para cambiar tu nombre y tu foto. Solo tú puedes editar tu perfil.",
    titulo: "Editar perfil",
    volver: "Volver al perfil",
    errorNombre:
      "Escribe un nombre de entre 2 y 40 letras o números. Sin símbolos raros ni emojis.",
    errorUsuario:
      "El nombre de usuario debe tener 3-30 caracteres: minúsculas, números, punto o guion bajo.",
    sesionCaducadaGuardar: "Tu sesión ha caducado. Vuelve a iniciar sesión para guardar.",
    usuarioOcupado: "Ese nombre de usuario ya está en uso.",
    demasiadasVeces: "Has guardado muchas veces seguidas. Espera un momento.",
    errorGuardar: "No hemos podido guardar el nombre. Inténtalo de nuevo.",
    sinSesionGuardar: "Inicia sesión para guardar los cambios.",
    sinConexion: "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.",
    fotoTipo: "Elige una imagen JPG, PNG o WebP.",
    fotoGrande: "La imagen es demasiado grande. El máximo son 5 MB.",
    fotoPrimero: "Elige primero una imagen.",
    fotoHecha: "Foto actualizada.",
    sesionCaducada: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
    fotoDemasiadas: "Has subido muchas imágenes seguidas. Espera un momento.",
    fotoError: "No hemos podido subir la imagen. Prueba con otra.",
    foto: "Foto",
    fotoPrevia: "Vista previa de tu nueva foto",
    fotoActual: "Tu foto actual",
    elegirImagen: "Elegir imagen",
    formatosFoto: "JPG, PNG o WebP · máx. 5 MB",
    subiendo: "Subiendo…",
    guardarFoto: "Guardar foto",
    seccionPerfil: "Perfil",
    nombreVisible: "Nombre visible",
    nombrePlaceholder: "Ej.: Ana Gómez",
    nombreUsuario: "Nombre de usuario",
    usuarioPlaceholder: "tu_usuario",
    biografia: "Biografía",
    bioPlaceholder: "Cuenta algo sobre ti",
    web: "Sitio web",
    webPlaceholder: "https://tu-web.com",
    instagram: "Instagram",
    instagramPlaceholder: "tu_usuario (sin @)",
    youtube: "YouTube",
    youtubePlaceholder: "@tucanal",
    guardando: "Guardando…",
    guardar: "Guardar perfil",
    guardado: "Perfil guardado.",
  },
  /** El cambio de correo de /perfil/editar. */
  cambioCorreo: {
    titulo: "Tu correo",
    /** UNA frase con la dirección resaltada dentro. */
    pendiente: "Pendiente de confirmar: {resaltado:{correo}}",
    enlaceEnviado:
      "Te hemos enviado un enlace a esa dirección. Hasta que la confirmes, tu cuenta sigue con la de arriba.",
    cancelar: "Cancelar el cambio",
    nueva: "Nueva dirección",
    tuContrasena: "Tu contraseña",
    explicacion:
      "Pedimos tu contraseña porque con el correo se entra en tu cuenta y se recupera. Te enviaremos un enlace a la dirección nueva: el cambio solo se aplica al confirmarlo, y entonces se cerrarán tus sesiones.",
    errorPedir: "No se pudo pedir el cambio. Inténtalo de nuevo.",
    sinConexion: "No hemos podido conectar. Inténtalo de nuevo.",
    hecho: "Te hemos enviado un enlace de confirmación. Ábrelo desde tu nueva dirección.",
    enviando: "Enviando…",
    cambiar: "Cambiar mi correo",
  },
  /** El cambio de contraseña de /perfil/editar. */
  cambioClave: {
    titulo: "Contraseña",
    noCoinciden: "La nueva contraseña y su confirmación no coinciden.",
    corta: "La nueva contraseña debe tener al menos 10 caracteres.",
    demasiados: "Demasiados intentos. Espera un momento.",
    ocupado: "El servicio está ocupado. Reinténtalo en unos segundos.",
    revisa: "No se pudo cambiar la contraseña. Revisa los datos.",
    reintenta: "No se pudo cambiar la contraseña. Reintenta.",
    sesionCaducada: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
    sinConexion: "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.",
    actual: "Contraseña actual",
    nueva: "Nueva contraseña",
    repite: "Repite la nueva contraseña",
    cambiando: "Cambiando…",
    cambiar: "Cambiar contraseña",
    hecho: "Contraseña cambiada.",
  },
} as const);
