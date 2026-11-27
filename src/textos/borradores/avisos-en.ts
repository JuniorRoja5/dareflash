/**
 * BORRADOR SIN PUBLICAR — el inglés de los avisos y de la pantalla de subida (Fase 11 · P5b4).
 *
 * NO ES UN DICCIONARIO y nadie lo importa (lo fija `tests/avisos-texto`): es el inglés que vivía en
 * dos tablas ES/EN propias, fuera del sistema de textos —`textoAviso` en `lib/notificaciones` y
 * `COPY_SUBIDA` en `lib/estado-subida`— y que NUNCA se sirvió (los dos que lo pedían elegían `.es`).
 * Se guarda aquí, con las claves de `es.ts`, para que la P5c lo pase a `en.ts` revisado en vez de
 * traducir otra vez desde cero. Sin `{marca}` ni marcas de `tRico`: frases planas, como en `es.ts`.
 */
export const AVISOS_EN_BORRADOR = {
  contenidoOculto: "Content was hidden after multiple reports. It is pending review.",
  videoListo: "Your video is live and ready to watch.",
  videoFallido_UPLOAD_INCOMPLETE:
    "Your video didn't finish uploading and won't be published. Upload it again whenever you like.",
  videoFallido_OBJETO_INEXISTENTE:
    "Your video is no longer available and won't be published. You can upload it again.",
  votoRecibido: 'Someone voted for your video in "{reto}".',
  ganasteReto: {
    one: 'You won "{reto}". You earn {n} point.',
    other: 'You won "{reto}". You earn {n} points.',
  },
  top20: {
    one: 'You finished in the top 20 of "{reto}". You earn {n} point.',
    other: 'You finished in the top 20 of "{reto}". You earn {n} points.',
  },
  subisteNivel: "You reached {nivel}.",
  toque: "@{autor} gave you a nudge.",
  comentarioEnReto: '@{autor} commented on your video in "{reto}".',
  comentario: "@{autor} commented on your video.",
  // Nueva en la P5b4 (no había inglés de la frase genérica): la propone este borrador.
  generico: "You have a new notification.",
} as const;

/** Los estados de la pantalla de subida (`subida.estado_*`), con las claves de `es.ts`. */
export const SUBIDA_EN_BORRADOR = {
  estado_preparando: "Getting the upload ready…",
  estado_subiendo: "Uploading your video…",
  "estado_en-cola":
    "Video uploaded and safe. It's queued for processing; it'll show up on your profile when it's ready.",
  estado_listo: "Done. Your video is ready to watch.",
  "estado_sin-conexion":
    "Couldn't connect to upload the video. Check your connection and try again.",
  estado_corte: "The upload stopped partway. Your connection is fine, so give it another go.",
  estado_credencial: "The upload permission expired. Press Publish again to start over.",
  estado_rechazo: "This video wasn't accepted. Try another file or another format.",
  "estado_servidor-ocupado":
    "The video service isn't responding right now. It's not your fault: try again in a few minutes.",
  "estado_fallo-codificacion":
    "Your video couldn't be prepared and won't be published. Upload another one to take part.",
  "estado_demasiado-largo":
    "Your video is longer than 90 seconds, so it wasn't published. Trim it and upload it again.",
} as const;
