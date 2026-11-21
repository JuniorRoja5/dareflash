/**
 * LA ZONA HORARIA DE QUIEN MIRA (Fase 11 · P1) — parte PURA.
 *
 * Solo el NAVEGADOR sabe su zona (`Intl.DateTimeFormat().resolvedOptions().timeZone`). El servidor la
 * necesita para pintar «el contador se reinicia a las 01:00» o «13 nov, 14:30» en hora local, y para
 * pintarlo él —no el cliente— hay una razón que ya costó un fallo: el ICU de Node y el de Chrome no
 * siempre coinciden, y una cadena distinta a cada lado rompe la hidratación (ver la lista de países).
 *
 * ┌─ EL MECANISMO ───────────────────────────────────────────────────────────────────────────────────┐
 * │ Un script EN LÍNEA de unos 200 bytes en el <head> (`SCRIPT_ZONA`) guarda la zona en una cookie,   │
 * │ como el tema: corre antes que nada, no añade JS al bundle y la CSP ya admite scripts en línea.    │
 * │ El servidor la lee, la VALIDA (`zonaHoraria`) y formatea; el navegador recibe la cadena hecha.    │
 * │ Sin cookie —la primerísima vista de alguien nuevo— NO se inventa una zona: la hora no se dice y  │
 * │ las fechas van sin hora (`estiloSinHora`). Las pantallas con hora (Boost, toques, monedero)        │
 * │ exigen sesión, y el login navega en duro: cuando se llega a ellas, la cookie ya está.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NO es una credencial ni dato personal sensible (no es una ubicación: media Europa comparte zona), así
 * que no es `HttpOnly` y `SameSite=Lax` basta. Lo peor que puede hacer quien la manipule es ver SU hora
 * en otra zona; un valor raro lo descarta `zonaHoraria`.
 */
import { EXPRESION_ZONA_NAVEGADOR, type ZonaHoraria, zonaCanonica, zonaHoraria } from "./formato";

export const ZONA_COOKIE = "df-zona";

/** Un año, como el tema; el script la renueva en cada visita si cambió (un viaje, el horario de verano no). */
const MAX_EDAD_S = 60 * 60 * 24 * 365;

/**
 * El script en línea. Solo ESCRIBE si falta o cambió (no toca la cookie en cada carga). Envuelto en
 * `try`: un navegador sin `Intl` o con cookies bloqueadas no puede romper la página.
 */
export const SCRIPT_ZONA = `try{var z=${EXPRESION_ZONA_NAVEGADOR};if(z&&document.cookie.indexOf("${ZONA_COOKIE}="+encodeURIComponent(z))<0)document.cookie="${ZONA_COOKIE}="+encodeURIComponent(z)+";path=/;max-age=${MAX_EDAD_S};samesite=lax"}catch(e){}`;

/**
 * LA REGLA ÚNICA PARA GUARDAR LA ZONA DEL USUARIO, y para LEER la guardada (Fase 11 · P2): en la web
 * (`validateSession`) y en el worker (correos, push), que corren la MISMA imagen de Node y por tanto el
 * mismo ICU. Es la regla de la cookie (`zonaHoraria`) y, encima, la FORMA CANÓNICA que da el ICU.
 *
 * POR QUÉ CANÓNICA: hay zonas con dos nombres válidos —renombradas (`Europe/Kyiv`, antes `Europe/Kiev`;
 * `Asia/Kolkata`, antes `Asia/Calcutta`) o alias (`Etc/UTC`, `GMT` → `UTC`; `US/Eastern` →
 * `America/New_York`)— y dos navegadores pueden decir la misma con nombres distintos. Guardada tal
 * cual, cada cambio de dispositivo sería «otra zona» y una escritura, sin que la hora mostrada cambie
 * un minuto. Con la canónica, los dos nombres son el mismo valor y no se escribe nada.
 *
 * La cookie, para MOSTRAR, sigue como en la P1 (`zonaDesdeCookie`, tal cual la dijo el navegador): el
 * resultado de formatear es idéntico con los dos nombres. Si un ICU nuevo cambia la canónica, cada
 * usuario se reescribe UNA vez y converge; no hay bucle.
 */
export function zonaParaGuardar(valor: unknown): ZonaHoraria | null {
  const z = zonaHoraria(valor);
  return z ? zonaCanonica(z) : null;
}

/** La zona a partir del valor crudo de la cookie (codificado en URI). `null` si falta o no vale. */
export function zonaDesdeCookie(valor: string | null | undefined): ZonaHoraria | null {
  if (!valor) return null;
  try {
    return zonaHoraria(decodeURIComponent(valor));
  } catch {
    return null;
  }
}
