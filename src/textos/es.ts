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
