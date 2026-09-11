/**
 * NAVEGACIÓN DURA (recarga completa del documento). Obligatoria cuando cambia QUIÉN es el usuario: al
 * entrar y al salir. No es un capricho: con `router.push` tras el login, el bug llegó a producción.
 *
 * EL FALLO, reproducido en un navegador real (Chrome) contra la imagen de producción: un invitado en
 * /inicio tiene a la vista el CTA de /crear, y `<Link>` lo PRE-CARGA. El proxy contesta a ese prefetch
 * con 307 -> /entrar?siguiente=/crear (es un anónimo) y el router de cliente GUARDA la respuesta. Tras un
 * login con `router.push` + `router.refresh()` la cookie ya está, pero el router sigue sirviendo la
 * redirección guardada: al pulsar el CTA no llega NI UNA petición a /crear y el usuario, ya logueado,
 * cae en el login. El segundo login se "congela": `router.push("/crear")` vuelve a dar con la misma
 * redirección, aterriza en la MISMA URL de /entrar, el formulario no se desmonta y se queda en
 * "Entrando…". No era un cuelgue ni el pool: todas las peticiones respondieron en menos de 250 ms, y
 * pasaba igual con next 16.2.11 y el driver anterior.
 *
 * `router.refresh()` NO basta: según la doc de Next (use-router.md) limpia la caché de cliente de la RUTA
 * ACTUAL, no la de las demás, y lo pre-cargado sin `loading.js` dura 5 min (`staleTimes.static`). Una
 * recarga completa tira TODA la caché de cliente de una vez, que es lo único correcto cuando cambia la
 * identidad: todo lo pre-cargado se pidió como OTRA persona.
 *
 * Una función en vez de `window.location.assign` suelto: la regla vive en un sitio, y los tests pueden
 * comprobar que el login y el logout pasan por aquí.
 */
export function navegarDuro(destino: string): void {
  window.location.assign(destino);
}
