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
    noEncontrada: "Página no encontrada",
    miEmpresa: "Mi empresa",
    creditosEmpresa: "Créditos de publicidad",
    cuentaEmpresa: "Cuenta",
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
    hecho: "Cuenta reactivada. Ya puedes intentar iniciar sesión de nuevo.",
    error: "El enlace de desbloqueo es inválido o ha caducado.",
    sinConexion: "No se pudo conectar. Inténtalo de nuevo más tarde.",
    faltaToken: "Falta el token en el enlace. Abre el enlace completo del correo de desbloqueo.",
    frenada: "Tu cuenta se frenó temporalmente por demasiados intentos. Pulsa para reactivarla.",
    reactivando: "Reactivando...",
    reactivar: "Reactivar mi cuenta",
    vuelveAIntentar: "Vuelve a intentar iniciar sesión.",
    volverInicio: "Volver al inicio",
    yaUsado:
      "Si ya has reactivado tu cuenta, este enlace deja de funcionar: vuelve a intentar iniciar sesión. Si el enlace ha caducado y sigues bloqueado, al intentarlo de nuevo te enviaremos uno nuevo.",
    cargando: "Cargando...",
  },
  /** /verify. Igual que /unlock: los textos sin tilde van tal cual se veían. */
  verificar: {
    titulo: "Verificar tu cuenta",
    cargando: "Cargando…",
    hecho: "Cuenta verificada. Ya puedes iniciar sesión.",
    error: "El enlace de verificación es inválido o ha caducado.",
    sinConexion: "No se pudo conectar. Inténtalo de nuevo más tarde.",
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
    entradaOtro_galeria: "Otro de la galería",
    entradaOtro_elegir: "Elegir otro vídeo",
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
    /**
     * Una página POSTERIOR que se ha quedado sin filas (PU1): no es «todavía no hay», es que por aquí
     * ya no queda nada. «Anterior» sigue debajo, para no dejar a nadie encerrado.
     */
    solicitudesVacioPosterior: "No quedan más solicitudes por aquí.",
    movimientosVacioPosterior: "No quedan más movimientos por aquí.",
    /** El nombre de cada `nav` de páginas: dos en la misma pantalla no pueden llamarse igual. */
    paginasSolicitudes: "Páginas de tus solicitudes",
    paginasMovimientos: "Páginas de tus movimientos",
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
    vacio: "Todavía no has pedido ningún cobro.",
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
    /** Un tipo guardado fuera del catálogo: se dice, no se inventa (`etiquetaTipoNegocio` del panel). */
    tipoNegocioSinClasificar: "Tipo de negocio sin clasificar",
    /** El estado en una palabra (`ETIQUETA_ESTADO_EMPRESA`, que el panel sigue leyendo en castellano). */
    estado_PENDIENTE: "Pendiente",
    estado_VERIFICADA: "Verificada",
    estado_RECHAZADA: "Rechazada",
    estado_SUSPENDIDA: "Suspendida",
    /** El motivo de un rechazo (`MSG_MOTIVO_RECHAZO_EMPRESA`, que leen el panel y el correo). */
    motivo_DATOS_INSUFICIENTES: "Nos faltan datos para comprobar que el negocio existe.",
    motivo_WEB_NO_VALIDA: "No hemos podido comprobar la web que nos has dado.",
    motivo_ACTIVIDAD_NO_PERMITIDA: "Esta actividad no encaja con lo que podemos publicar.",
    motivo_SOSPECHA_FRAUDE: "No hemos podido verificar la cuenta.",
    motivo_DUPLICADA: "Ya tenemos registrado este negocio.",
    /**
     * Lo que cuesta un día en lo que ESE negocio puede comprar (`fraseQueEsUnCredito` del panel y el
     * correo): la unidad solo en el primer tramo («1 crédito en una ciudad y 2 en una región»).
     */
    tarifa: "Un día de campaña cuesta {tramos}, y se descuenta cada día que se muestra.",
    tarifaPrimera: { one: "{n} crédito {donde}", other: "{n} créditos {donde}" },
    tarifaOtra: "{n} {donde}",
    tarifaEn_CIUDAD: "en una ciudad",
    tarifaEn_ESTADO: "en una región",
    tarifaEn_PAIS: "por país",
    tarifaEn_GLOBAL: "en todo el mundo",
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
    /**
     * POR QUÉ HACE FALTA UN CORREO NUEVO, contado ANTES de intentarlo (no en la respuesta: eso sería un
     * oráculo de direcciones registradas). `MSG_EMPRESA_CORREO_NUEVO` lo documenta para la API y el
     * servicio; un test exige que digan lo mismo.
     */
    correoNuevo:
      "Usa un correo que no tenga ya cuenta en {marca}: una cuenta de empresa no participa, así que no se puede convertir una cuenta de participante en una.",
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

  // ── Portal de empresa (P5b2b) ────────────────────────────────────────────────────────────────────
  /** La navegación del portal (cliente: la monta el layout del portal). */
  portal: {
    navegacion: "Portal de empresa",
    seccion_resumen: "Resumen",
    seccion_retos: "Retos",
    seccion_publicidad: "Publicidad",
    seccion_creditos: "Créditos",
    seccion_cuenta: "Cuenta",
  },
  /** El correo sin verificar, contado en las pantallas del portal (servidor). */
  portalAviso: {
    titulo: "Antes, confirma tu correo",
    texto:
      "Verifica tu correo para entrar al portal. Es la misma barrera que protege todo lo que tiene efectos.",
    cta: "Ir a mi cuenta",
  },
  /** /empresa: el Resumen (servidor). */
  empresaResumen: {
    tituloSinVerificar: "Tu empresa",
    estado: "Estado",
    creditos: "Créditos de publicidad",
    verMovimientos: "Ver movimientos",
    enRevision: "Propuestas en revisión",
    verRetos: "Ver mis retos",
    /** El estado contado al dueño: qué significa, no el caso concreto (eso es el motivo). */
    relato_PENDIENTE_titulo: "Estamos revisando tu empresa",
    relato_PENDIENTE_cuerpo:
      "La revisamos a mano, una por una. Te escribimos en cuanto esté: no hace falta que vuelvas a enviarla.",
    relato_VERIFICADA_titulo: "Tu empresa está verificada",
    relato_VERIFICADA_cuerpo:
      "Ya puedes usar el portal. Lo que se puede hacer desde aquí irá creciendo.",
    relato_RECHAZADA_titulo: "No hemos podido verificar tu empresa",
    relato_RECHAZADA_cuerpo: "Si crees que es un error, escríbenos y lo miramos otra vez.",
    relato_SUSPENDIDA_titulo: "Tu empresa está suspendida",
    relato_SUSPENDIDA_cuerpo:
      "Puedes seguir viendo tus datos, pero no crear nada nuevo. Escríbenos y lo revisamos.",
    datosTitulo: "Los datos que nos diste",
    dato_nombre: "Nombre",
    dato_tipoCuenta: "Tipo de cuenta",
    dato_tipoNegocio: "Tipo de negocio",
    dato_pais: "País",
    dato_contacto: "Contacto",
    dato_alta: "Alta",
    dato_ciudad: "Ciudad",
    dato_web: "Web",
    dato_redes: "Redes",
    dato_direccion: "Dirección",
    dato_verificada: "Verificada",
    cambiarDatos: "Para cambiar cualquiera de estos datos, escríbenos: los revisamos a mano.",
  },
  /** /empresa/creditos: el saldo y su historial (servidor). */
  creditosEmpresa: {
    titulo: "Créditos de publicidad",
    todosMovimientos: "Aquí tienes todos tus movimientos.",
    aviso_ok:
      "Pago recibido. Los créditos aparecen en tu saldo en cuanto Stripe nos lo confirma; suele ser al momento.",
    aviso_cancelada: "Has cancelado el pago. No se te ha cobrado nada.",
    aviso_noDisponible:
      "No hemos podido abrir el recibo ahora mismo. Inténtalo en un rato; también te llegó por correo.",
    saldo: "Saldo",
    saldoPie: { one: "crédito de publicidad", other: "créditos de publicidad" },
    movimientos: "Movimientos",
    vacio: "Todavía no tienes movimientos. Aquí verás cada crédito de publicidad que recibas.",
    fecha: "Fecha",
    concepto: "Concepto",
    columnaCreditos: "Créditos",
    /** «Recibo», nunca «Factura». */
    recibo: "Recibo",
  },
  /** La compra de créditos (cliente). */
  creditosCompra: {
    titulo: "Comprar créditos",
    mejorPrecio: "Mejor precio",
    unidad: "créditos",
    porCredito: "{precio} por crédito",
    abriendo: "Abriendo el pago…",
    comprar: "Comprar",
    sinConexion: "No hemos podido conectar. Inténtalo otra vez.",
    condiciones:
      "Los créditos de publicidad no caducan y no son reembolsables, salvo que la ley lo exija. Pagas con Stripe; puedes añadir tu número fiscal y descargar el recibo desde aquí.",
  },
  /** /empresa/cuenta (servidor). */
  cuentaEmpresa: {
    titulo: "Cuenta",
    subtitulo: "El correo con el que entras es también donde te escribimos sobre tu empresa.",
  },

  // ── Publicidad del portal (P5b2b) ────────────────────────────────────────────────────────────────
  /**
   * Lo que comparten las pantallas de publicidad y el formulario (servidor Y cliente): el saldo en
   * humano, el alcance, a qué hora empieza cada día. Las cifras de saldo van TAL CUAL (sin separador de
   * miles), como antes: formatearlas sería un cambio visible que no se ha aprobado.
   */
  campanaComun: {
    volver: "Publicidad",
    creditosPalabra: { one: "crédito", other: "créditos" },
    saldoSolo: "Tienes {saldo} {palabra} de publicidad.",
    saldoComprometido:
      "Tienes {saldo} {palabra} de publicidad; {comprometido} ya están comprometidos en {donde}, así que te quedan {quedan} para nuevas.",
    donde_otras: "tus otras campañas",
    donde_todas: "tus campañas activas y programadas",
    /** `MSG_SALDO_NO_RETENIDO` (la cita el servicio); un test exige que digan lo mismo. */
    saldoNoRetenido:
      "Comprobamos que tienes créditos de publicidad para todos los días, pero no los apartamos: se descuentan cada día de campaña. Si cuando llegue un día no te quedan, la campaña se pausa.",
    /** `ETIQUETA_ALCANCE_PUBLICIDAD` (el panel); un test exige que digan lo mismo. */
    alcance_CIUDAD: "Una ciudad y alrededores",
    alcance_ESTADO: "Una región entera",
    alcance_PAIS: "Uno o varios países",
    alcance_GLOBAL: "Todo el mundo",
    /** «a la 1:00», «a las 19:00»: la forma la elige la hora con las reglas de plural del idioma. */
    aLaHora: { one: "a la {hora}", other: "a las {hora}" },
    inicioLocal: "Cada día de campaña empieza {cuando} en tu hora local.",
    inicioLocalVispera: "Cada día de campaña empieza {cuando} del día anterior, en tu hora local.",
    inicioCapital: "Cada día de campaña empieza {cuando}, hora de {capital}.",
    inicioCapitalVispera:
      "Cada día de campaña empieza {cuando} del día anterior, hora de {capital}.",
  },
  /** /empresa/publicidad y la ficha de una campaña (servidor). */
  publicidad: {
    titulo: "Publicidad",
    subtitulo: "Tus campañas y los días que tiene reservados cada una.",
    nueva: "Nueva campaña",
    sinVerificar: "Podrás crear campañas en cuanto verifiquemos tu empresa.",
    tusCampanas: "Tus campañas",
    vacioPosterior: "No quedan más campañas por aquí.",
    vacioPrimera:
      "Todavía no tienes ninguna campaña. Crea la primera: es un borrador hasta que tú la actives.",
    vacioSinVerificar: "Aquí verás tus campañas y los días de cada una.",
    col_campana: "Campaña",
    col_zona: "Zona",
    col_dias: "Días",
    col_crDia: "Cr./día",
    col_estado: "Estado",
    crDiaMovil: "{calendario} · {tarifa} cr./día",
    dias: { one: "{n} día", other: "{n} días" },
    desde: "Desde {fecha} · {dias}",
    tramo: "{desde} – {hasta}",
    /** `ETIQUETA_ESTADO_PUBLICIDAD` (el panel); un test exige que digan lo mismo. */
    estado_BORRADOR: "Borrador",
    estado_PROGRAMADA: "Programada",
    estado_ACTIVA: "Activa",
    estado_FINALIZADA: "Finalizada",
    estado_PAUSADA: "Pausada",
    estado_EN_REVISION: "En revisión",
    estado_TERMINADA: "Terminada",
    estado_RETIRADA: "Retirada",
    /** Qué significa cada estado, contado a la empresa (solo lo pinta el portal). */
    relato_BORRADOR: "Todavía no ocupa ningún día. Actívala o prográmala cuando quieras.",
    relato_PROGRAMADA: "Tiene sus días reservados y empieza a mostrarse en la fecha indicada.",
    relato_ACTIVA: "Se está mostrando en su zona, en el feed y en la portada.",
    relato_FINALIZADA: "Ya pasaron sus días contratados.",
    relato_PAUSADA:
      "Está pausada. Sus días por venir quedaron libres para otras campañas; puedes reanudarla.",
    relato_EN_REVISION:
      "La hemos pausado mientras revisamos unas denuncias. Sus días por venir quedaron libres y no se te descuenta nada. Te escribiremos cuando lo hayamos decidido.",
    relato_TERMINADA: "La terminaste antes de tiempo. Sus días por venir quedaron libres.",
    relato_RETIRADA: "La hemos retirado y ya no se muestra.",
    tituloFicha: "Campaña",
    /** El motivo viene del servidor, ya en humano (P5b3); aquí, lo que se le añade. */
    motivoRetirada: "{motivo} Si crees que es un error, contesta al correo que te enviamos.",
    asiSeVera: "Así se verá",
    llevaA: "Lleva a {resaltado:{url}}",
    cuantaGente: "Cuánta gente la verá",
    /** La cifra va resaltada DENTRO de la frase (con su espacio): antes eran dos trozos. */
    estZona:
      "{resaltado:unas {personas} }personas al día la verían, contando con las demás campañas de esas fechas.",
    estMenosDeUna: "Con el tráfico de estos días, menos de una persona al día.",
    estRespaldo:
      "{resaltado:unas {personas} }personas al día ven publicidad en {nivel}. Todavía no tenemos tráfico medido en {zona}.",
    estSinDatos: "Todavía no tenemos datos de {zona}: no podemos decirte cuánta gente la verá.",
    estComo:
      "Calculado con la gente que ha pasado por el feed en tu zona los últimos días, el peor día de tus fechas y redondeado a la baja.",
    laCampana: "La campaña",
    dato_alcance: "Alcance",
    dato_zona: "Zona",
    dato_empezaria: "Empezaría el",
    dato_dias: "Días",
    dato_crDia: "Créditos por día",
    dato_coste: "Coste total",
    dato_quedan: "Le quedan",
    /** Como antes, «días» siempre (también con uno). */
    borradorDias: "{fecha} · {dias} días",
    costeBorrador: "{resaltado:{coste} créditos}",
    costeQuedan: "{resaltado:{coste} créditos} ({dias} días)",
    queHacer: "Qué quieres hacer",
  },
  /** /empresa/publicidad/nueva (servidor). */
  nuevaCampana: {
    titulo: "Nueva campaña",
    sinRevision: "Sin revisión previa: la activas tú.",
    sinVerificar:
      "Podrás crear campañas en cuanto verifiquemos tu empresa. Te escribiremos cuando esté.",
    comoFunciona: "Cómo funciona",
    paso1: "Creas el borrador: todavía no ocupa días ni gasta créditos.",
    paso2: "En su ficha ves cuánta gente la verá al día y cuánto cuesta.",
    paso3: "La activas (o la programas para otro día) y reserva sus días.",
    loQueCuesta: "Lo que cuesta un día",
    tarifa_CIUDAD: "Ciudad (y 100 km)",
    tarifa_ESTADO: "Región",
    tarifa_PAIS: "Cada país",
    tarifa_GLOBAL: "Todo el mundo",
    cr: "{creditos} cr.",
    limites:
      "Como mucho {max} campañas por zona y día, para que cada una se vea. Puedes empezar hasta dentro de {dias} días.",
  },
  /** El formulario de una campaña nueva (cliente). */
  campanaFormulario: {
    falta_ciudad: "Elige la ciudad de la lista.",
    falta_region: "Elige la región.",
    falta_pais: "Añade al menos un país.",
    falta_nombre: "Ponle un nombre a la campaña (al menos 3 caracteres).",
    falta_texto: "Escribe el texto del anuncio.",
    falta_destino: "El enlace tiene que ser una dirección web completa (https://…).",
    falta_dias: "Elige entre {min} y {max} días.",
    falta_imagen: "Sube la imagen de la campaña.",
    errorCrear: "No hemos podido crear la campaña. Revisa los datos.",
    sinConexion: "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.",
    donde: "Dónde",
    dondeDescripcion: "Dónde se verá tu publicidad.",
    alcance: "Alcance",
    tarifaAlcance: "{tarifa} cr./día",
    tarifaAlcancePais: "{tarifa} por país cr./día",
    region: "Región",
    elegirRegion: "Elige una región",
    paises: "Países",
    elegirPais: "Elige un país",
    anadir: "Añadir",
    paisesElegidos: "Países elegidos",
    quitar: "Quitar {pais}",
    avisoGlobal: "Con {paises} países pagas lo mismo que por Todo el mundo, que llega a más gente.",
    cuando: "Cuándo",
    cuandoDescripcion: "Se cuenta por días completos.",
    empieza: "Empieza el",
    dias: "Días",
    pieza: "La pieza",
    piezaDescripcion: "Lo que verá la gente en el feed.",
    nombre: "Nombre de la campaña",
    nombrePlaceholder: "Solo para ti: no lo ve nadie más",
    texto: "Texto",
    destino: "Enlace al pulsar",
    imagen: "Imagen",
    imagenAyuda: "PNG, JPG o WebP. Mejor en vertical: el feed se ve en el móvil.",
    /** La barra del coste: UNA frase con su cifra resaltada dentro. */
    costeConComprometido:
      "{resaltado:{coste} créditos} en total · {tarifa} al día · te quedan {disponible} de {saldo} ({comprometido} ya comprometidos)",
    costeSinComprometido:
      "{resaltado:{coste} créditos} en total · {tarifa} al día · tienes {saldo}",
    noLlega: "No te llega para todos los días: acórtala o libera otra campaña.",
    creando: "Creando…",
    crear: "Crear borrador",
  },
  /** El buscador de la ciudad de una campaña (cliente). */
  buscadorCiudad: {
    ciudad: "Ciudad",
    placeholder: "Escribe el nombre de la ciudad",
    buscando: "Buscando…",
    error: "No hemos podido buscar. Inténtalo otra vez.",
    sinResultados: "No encontramos esa ciudad en tu país.",
    elegida: "Se verá en esta ciudad y en las que están a menos de 100 km.",
    ayuda: "Ciudades de más de 15.000 habitantes de tu país.",
  },
  /** Lo que se puede hacer con una campaña (cliente). */
  accionesCampana: {
    accion_ACTIVAR: "Activar",
    accion_PAUSAR: "Pausar",
    accion_REANUDAR: "Reanudar",
    accion_TERMINAR: "Terminar ya",
    accion_BORRAR: "Borrar borrador",
    programar: "Programar",
    unMomento: "Un momento…",
    confirmar_TERMINAR:
      "¿Terminar la campaña ya? Sus días por venir quedarán libres para otras campañas y no se puede reanudar.",
    confirmar_BORRAR: "¿Borrar este borrador? No se puede deshacer.",
    errorHacer: "No hemos podido hacerlo. Inténtalo otra vez.",
    sinConexion: "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.",
    hueco: "El primer hueco libre para todos sus días empieza el {resaltado:{fecha}}.",
    programarPara: "Programar para el {fecha}",
  },
  /**
   * LA PÁGINA 404 PROPIA (P5b2b, aprobada por Junior el 25 nov): una ruta que no existe, un idioma no
   * publicado o `/en/panel`. Una frase humana, sin datos inventados, y una sola acción: volver.
   */
  noEncontrada: {
    titulo: "Esta página no existe",
    texto:
      "Puede que el enlace esté mal escrito o que lo que buscabas ya no esté en {marca}. Desde el inicio llegas a todo lo demás.",
    volver: "Volver al inicio",
  },

  // ── /privacidad (P5b2b), palabra por palabra ─────────────────────────────────────────────────────
  /**
   * LA POLÍTICA DE PRIVACIDAD (servidor). Versión FUNCIONAL, no definitiva: los `{pendiente:…}` son
   * huecos declarados (se rellenan con los datos del responsable) y tiene que revisarla un abogado. Al
   * traducirla, los huecos se traducen como huecos: no se inventa un dato.
   */
  privacidad: {
    titulo: "Política de Privacidad",
    enPreparacion:
      "{resaltado:Documento en preparación.} Esta versión describe cómo tratamos tus datos hoy, pero todavía no es la definitiva: los huecos marcados como {pendiente:[PENDIENTE — pendiente]} se completan antes del lanzamiento, y el texto está pendiente de revisión legal.",
    actualizacion: "Última actualización: {pendiente:[PENDIENTE — fecha de publicación]}",
    s1: "Quién es el responsable de tus datos",
    s1_intro:
      "{marca} (en adelante, «la Plataforma», «nosotros») es un servicio de retos en vídeo con premios. El responsable del tratamiento de tus datos es:",
    s1_entidad: "{resaltado:Entidad:} {pendiente:[PENDIENTE — razón social del responsable]}",
    s1_domicilio: "{resaltado:Domicilio:} {pendiente:[PENDIENTE — domicilio social]}",
    s1_contacto: "{resaltado:Contacto de privacidad:} {pendiente:[PENDIENTE — correo de contacto]}",
    s1_rgpd:
      "Si resides en el Espacio Económico Europeo (EEE), el Reino Unido o Suiza, tratamos tus datos conforme al Reglamento General de Protección de Datos (RGPD) y a la normativa local aplicable.",
    s2: "Qué datos recogemos",
    s2_cuenta:
      "{resaltado:Datos de cuenta:} correo electrónico, nombre de usuario, contraseña (guardada siempre cifrada, nunca en claro), fecha de nacimiento (para comprobar que eres mayor de 18 años) y los datos opcionales de tu perfil (avatar, web, redes).",
    s2_contenido:
      "{resaltado:Contenido que publicas:} vídeos, comentarios, votos y tu participación en retos.",
    s2_uso:
      "{resaltado:Datos de uso y técnicos:} dirección IP, tipo de dispositivo y navegador, y registros de actividad, que usamos para seguridad y prevención del fraude. También guardamos la zona horaria de tu navegador, para mostrarte las horas en tu hora local.",
    s2_ubicacion:
      "{resaltado:Ubicación aproximada:} a partir de tu dirección IP deducimos tu país y una ciudad aproximada, nunca tu dirección exacta. Guardamos ese resultado, no la IP, y lo usamos para medir cuánta gente ve la Plataforma en cada zona y para la publicidad local. El recuento por zona es anónimo: dice cuántas personas, no quiénes.",
    s2_pago:
      "{resaltado:Datos de pago:} cuando compras un Boost, el pago lo procesa Stripe. {resaltado:No almacenamos los números de tu tarjeta} en ningún momento; solo guardamos el registro de la transacción (importe, moneda e identificador de pago) para tu historial.",
    s2_referidos:
      "{resaltado:Referidos:} si llegas por el enlace de otra persona, o invitas a alguien, registramos esa relación.",
    s2_comunicaciones:
      "{resaltado:Comunicaciones:} los correos que te enviamos (verificación de cuenta, avisos y recuperación de contraseña).",
    s3: "Para qué usamos tus datos y con qué base legal",
    s3_finalidad: "Finalidad",
    s3_base: "Base legal (RGPD)",
    s3_f1: "Crear y mantener tu cuenta, dejarte participar y ver el servicio",
    s3_b1: "Ejecución del contrato",
    s3_f2: "Comprobar que eres mayor de 18 años",
    s3_b2: "Obligación legal / ejecución del contrato",
    s3_f3: "Procesar compras de Boost y, en el futuro, el pago de premios",
    s3_b3: "Ejecución del contrato",
    s3_f4: "Seguridad, prevención del fraude y del abuso, y moderación",
    s3_b4: "Interés legítimo",
    s3_f5: "Medir la audiencia por zona y mostrar publicidad local con tu ubicación aproximada",
    s3_b5: "Interés legítimo (pendiente de revisión legal)",
    s3_f6: "Enviarte correos operativos (verificación, avisos de tu cuenta)",
    s3_b6: "Ejecución del contrato",
    s3_f7: "Enviarte comunicaciones opcionales, si las activas",
    s3_b7: "Consentimiento",
    s3_f8: "Cumplir obligaciones fiscales y responder a requerimientos legales",
    s3_b8: "Obligación legal",
    s4: "Mayores de 18 años",
    s4_texto:
      "{marca} es {resaltado:solo para mayores de 18 años}. No admitimos cuentas de menores de edad ni recogemos sus datos a sabiendas. Si detectamos la cuenta de un menor, la eliminamos.",
    s5: "Con quién compartimos tus datos",
    s5_intro:
      "No vendemos tus datos. Los compartimos únicamente con los proveedores que necesitamos para prestar el servicio, y solo lo imprescindible:",
    s5_bunny: "{resaltado:Bunny.net} — alojamiento y distribución (CDN) de los vídeos.",
    s5_stripe: "{resaltado:Stripe} — procesamiento de pagos y, en el futuro, el pago de premios.",
    s5_correo: "{resaltado:Proveedor de correo} — para enviarte los correos del servicio.",
    s5_alojamiento: "{resaltado:Proveedor de alojamiento} — donde se ejecuta la Plataforma.",
    s5_ley: "También podremos compartir datos cuando lo exija la ley o una autoridad competente.",
    s5_fuentes:
      "{resaltado:Fuentes de ubicación:} la ubicación aproximada sale de la base de datos de IP de {externo:DB-IP} y del catálogo de ciudades de {externo:GeoNames}, ambos con licencia {externo:CC BY 4.0}. Son ficheros que consultamos en nuestros servidores: no les enviamos ningún dato tuyo.",
    s5_transferencias:
      "{resaltado:Transferencias internacionales:} algunos de estos proveedores, y el propio responsable, pueden estar fuera del EEE. En ese caso aplicamos las garantías que exige el RGPD, como las cláusulas contractuales tipo. {pendiente:[PENDIENTE — mecanismo exacto, pendiente de revisión legal]}",
    s6: "Cuánto tiempo conservamos tus datos",
    s6_texto:
      "Conservamos tus datos mientras tu cuenta esté activa. Si la eliminas, los borramos o los anonimizamos, salvo lo que debamos conservar por obligación legal —por ejemplo, los registros de pagos durante el plazo fiscal aplicable— o para resolver disputas y prevenir el fraude.",
    s7: "Tus derechos",
    s7_texto:
      "Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad, así como retirar tu consentimiento cuando el tratamiento se base en él. Escríbenos a {pendiente:[PENDIENTE — correo de contacto]}.",
    s7_reclamar:
      "Si estás en el EEE, también puedes reclamar ante tu autoridad de control (en España, la Agencia Española de Protección de Datos).",
    s8: "Cookies",
    s8_texto:
      "Usamos cookies y almacenamiento local {resaltado:necesarios} para que la Plataforma funcione: mantener tu sesión iniciada, recordar tu preferencia de tema (claro u oscuro) y protegerte frente al fraude. No usamos cookies de publicidad de terceros. {pendiente:[PENDIENTE — si se añade analítica, requiere una capa de consentimiento]}",
    s9: "Seguridad",
    s9_texto:
      "Aplicamos medidas técnicas y organizativas para proteger tus datos: contraseñas cifradas, conexiones seguras, control de acceso y registros de seguridad. Ningún sistema es infalible, pero trabajamos para reducir el riesgo.",
    s10: "Cambios en esta política",
    s10_texto:
      "Podemos actualizar esta política. Si el cambio es relevante, te avisaremos por los medios habituales. La fecha de arriba indica la última versión.",
    s11: "Contacto",
    s11_texto:
      "Para cualquier cuestión sobre tus datos o esta política: {pendiente:[PENDIENTE — correo de contacto]}.",
  },

  // ── Retos patrocinados del portal (P5b2b) ────────────────────────────────────────────────────────
  /** /empresa/retos: sus propuestas y su extracto (servidor). */
  retosEmpresa: {
    titulo: "Mis retos",
    subtitulo: "Los retos patrocinados que nos propones, y lo que suma cada uno.",
    proponer: "Proponer un reto",
    enviada:
      "Hemos recibido tu propuesta. La revisamos a mano y te escribimos en cuanto la decidamos.",
    sinVerificar: "Podrás proponer retos en cuanto verifiquemos tu empresa.",
    tusPropuestas: "Tus propuestas",
    vacioPosterior: "No quedan más propuestas por aquí.",
    vacioPrimera:
      "Todavía no nos has propuesto ningún reto. Cuando lo hagas, aquí verás en qué punto está.",
    vacioSinVerificar: "Aquí verás tus propuestas y en qué punto está cada una.",
    col_reto: "Reto",
    col_premio: "Premio",
    col_fechas: "Abre – cierra",
    col_estado: "Estado",
    verPublicado: "Ver el reto publicado",
    tramo: "{abre} – {cierra}",
    lineaMovil: "{categoria} · Premio {premio} · {abre} – {cierra}",
    /** La propuesta en una palabra, y la línea que la acompaña (solo las pinta el portal). */
    estado_EN_REVISION: "En revisión",
    estado_RECHAZADA: "Rechazada",
    estado_CADUCADA: "Caducada",
    estado_APROBADA: "Aprobada",
    estado_PUBLICADA: "Publicada",
    relato_EN_REVISION: "La revisamos a mano y te escribimos en cuanto la decidamos.",
    relato_RECHAZADA: "No la hemos podido aprobar.",
    relato_CADUCADA:
      "Caducada: la fecha del reto ya pasó. Puedes proponerlo de nuevo con otras fechas.",
    /** Lo que promete es la regla de `publicarReto`: un reto de empresa no se publica sin el pago. */
    relato_APROBADA:
      "Está aprobada. Te escribiremos para organizar el pago, y la publicaremos en cuanto lo recibamos.",
    relato_PUBLICADA: "Está publicada: la gente ya puede participar.",
    /** `MSG_MOTIVO_RECHAZO_RETO` (el panel y el correo); un test exige que digan lo mismo. */
    motivo_FECHAS_NO_VIABLES: "Las fechas no nos dan tiempo a prepararlo y difundirlo bien.",
    motivo_PREMIO_NO_ADECUADO: "El premio no encaja con lo que suele mover un reto así.",
    motivo_CONTENIDO_NO_PERMITIDO: "El reto pide algo que no podemos publicar.",
    motivo_DATOS_INSUFICIENTES: "Nos falta información para entender qué tiene que hacer la gente.",
    motivo_DUPLICADA: "Ya tenemos una propuesta igual de tu empresa.",
    extracto: "Extracto",
    extractoVacio:
      "Cuando aprobemos uno de tus retos, aquí verás el premio para quien gane y el total a pagar de cada uno.",
    totalPagar: "Total a pagar",
    /** La cifra, tal cual (como antes). */
    retosPie: { one: "{cuantos} reto", other: "{cuantos} retos" },
    premioGanador: "Premio para quien gane",
    cerrado: "Cerrado",
    sinCerrar: "Sin cerrar",
    /**
     * CÓMO SE PAGA: lo que paga y que quien gane cobra el premio entero; NADA de cómo se reparte dentro
     * (`empresa-sin-comisiones`). Y promete una regla que el código cumple: «lo publicaremos en cuanto
     * lo recibamos» es `publicarReto`, que no publica un reto de empresa sin `pagoRecibidoEn`.
     */
    pago: "El pago se hace por transferencia, fuera de {marca}. Cuando aprobemos tu reto, te escribiremos para organizarlo, y lo publicaremos en cuanto lo recibamos. Quien gane cobra el premio entero.",
  },
  /** /empresa/retos/nuevo (servidor). */
  proponerReto: {
    volver: "Mis retos",
    titulo: "Proponer un reto",
    intro:
      "Tú pones el reto y el premio; nosotros lo revisamos, lo preparamos y lo publicamos con tu marca. Nada sale publicado sin que lo aprobemos.",
    sinVerificar:
      "Podrás proponer retos en cuanto verifiquemos tu empresa. Te escribiremos cuando esté.",
    comoFunciona: "Cómo funciona",
    despues: "Después de enviar",
    paso1: "La revisamos a mano y te escribimos en cuanto la decidamos.",
    paso2: "Si la aprobamos, la preparamos con tu marca.",
    paso3: "La publicamos en cuanto recibimos el pago.",
    elPago: "El pago",
    pendientes: "Puedes tener hasta {max} propuestas esperando a la vez.",
  },
  /** El formulario de la propuesta (cliente). */
  propuestaFormulario: {
    falta_titulo: "Escribe un título de al menos 3 caracteres.",
    falta_premio: "El premio no es válido. Usa un importe como 50 o 49.90.",
    falta_fechas: "Elige cuándo abre y cuándo cierra el reto.",
    cierreAntes: "El cierre tiene que ser después de la apertura.",
    cierrePasado: "El cierre tiene que estar en el futuro.",
    errorEnviar: "No hemos podido enviar la propuesta. Revisa los datos.",
    sinConexion: "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.",
    elReto: "El reto",
    titulo: "Título",
    tituloPlaceholder: "Lo que la gente verá en la tarjeta",
    categoria: "Categoría",
    descripcion: "Qué tiene que hacer la gente",
    reglas: "Reglas (opcional)",
    premioFechas: "Premio y fechas",
    fechasLocal: "Las fechas, en tu hora local.",
    premio: "Premio ({moneda})",
    ganadores: "Ganadores",
    abre: "Abre",
    cierra: "Cierra",
    tuMarca: "Tu marca",
    logo: "Logo (opcional)",
    logoAyuda: "PNG, JPG o WebP. Saldrá junto a «Patrocinado por» con el nombre de tu empresa.",
    enviando: "Enviando…",
    enviar: "Enviar propuesta",
  },
  /** Los resultados de una campaña (servidor). */
  informeCampana: {
    titulo: "Resultados",
    explicacion:
      "Veces que se mostró: las veces que la pusimos en el feed o en la portada. Clics: las veces que alguien la tocó para ir a tu web. Se actualizan cada {minutos} minutos.",
    mostrada: "Veces que se mostró",
    clics: "Clics",
    porCien: "Clics por cada 100 veces que se mostró",
    sinDiasAntiguos: "No hay días más antiguos.",
    sinCifras: "Todavía no hay cifras. Aparecen en cuanto la campaña empieza a mostrarse.",
    col_dia: "Día",
    col_mostrada: "Veces que se mostró",
    col_clics: "Clics",
    col_porCien: "Clics por cada 100 veces",
    veces: { one: "{n} vez", other: "{n} veces" },
    clicsN: { one: "{n} clic", other: "{n} clics" },
    movil: "se mostró {veces} · {clics}",
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
