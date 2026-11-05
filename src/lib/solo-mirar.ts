/**
 * ¿ESTA SESIÓN SOLO MIRA? Fuente ÚNICA de la decisión "no se le ofrecen controles de participación"
 * (Fase 9, P2). Hoy la toma una cuenta de EMPRESA, que mira todo y no participa.
 *
 * ┌─ POR QUÉ UNA FUNCIÓN Y NO `esCuentaEmpresa` LEÍDO EN CADA PANTALLA ───────────────────────────┐
 * │ La barrera de verdad es `mutatingRoute`: a una empresa le responde 403 en votar, participar,   │
 * │ dar like, comentar o denunciar. Esto es la otra mitad, la de la pantalla: no ofrecerle un      │
 * │ botón que el servidor le va a negar. Si cada página preguntara por `esCuentaEmpresa` a su      │
 * │ manera, el día que otra clase de cuenta solo mire (o que la empresa pueda hacer algo) habría   │
 * │ que encontrar todos los sitios. Así es una línea.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * QUÉ HACE CADA PANTALLA CON ESTO (decidido contra MARCA.md, ver el docblock de `FeedVertical`):
 * los controles se ESCONDEN, no se desactivan —un botón de `--df-action` desactivado sigue ocupando
 * la única acción de la pantalla sin hacer nada—; y donde el control era LA acción del sitio (la caja
 * de comentar, "Participar"), su hueco lo ocupa una línea que dice por qué (`MSG_EMPRESA_SOLO_MIRA`).
 *
 * Pura y cliente-segura: la calcula el servidor con la sesión y viaja como prop.
 */
export function soloMirar(sesion: { esCuentaEmpresa: boolean } | null | undefined): boolean {
  return sesion?.esCuentaEmpresa === true;
}
