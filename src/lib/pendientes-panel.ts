/**
 * LO QUE ESPERA AL ADMIN — puro, para que la barra, la cabecera y el Resumen digan lo mismo.
 *
 * Existe porque el admin tenía que BUSCAR para enterarse: una empresa podía llevar días pendiente y
 * nada en el panel lo decía. Ahora hay tres sitios que lo enseñan (la insignia de la sección, el
 * indicador de la cabecera y la tarjeta del Resumen), y los tres leen de aquí. Tres cifras calculadas
 * por separado acaban discrepando, y un contador que no cuadra con su cola es peor que ninguno: enseña
 * a no creérselo.
 *
 * PREPARADO PARA CRECER: hoy solo cuentan las empresas por verificar; P3 sumará los retos de empresa
 * por revisar y P8 la publicidad denunciada. Cada fuente nueva es una clave en `PendientesPanel` y
 * una línea en `SECCION_DE_PENDIENTE`: el total y las insignias salen solos.
 *
 * SOLO CUENTA LO QUE QUIEN MIRA PUEDE ATENDER. Un moderador no verifica empresas (la sección es de
 * ADMIN), así que para él esa cifra no existe: ni insignia ni total. Avisarle de algo que no puede
 * resolver es ruido, y además le contaría qué hay en una sección que no ve.
 */
import { alcanzaRol } from "@/lib/permisos";

/** Una cifra por cosa que pide una decisión. Cada clave la produce `services/pendientes-panel`. */
export interface PendientesPanel {
  empresas: number;
}

/** De qué sección es cada cifra, y qué rol hace falta para atenderla. */
export const SECCION_DE_PENDIENTE: Record<
  keyof PendientesPanel,
  { href: string; rol: "ADMIN" | "MODERATOR" }
> = {
  empresas: { href: "/panel/empresas", rol: "ADMIN" },
};

/** Lo que este rol puede atender: el resto se pone a cero (no se le cuenta, no se le enseña). */
export function pendientesVisibles(p: PendientesPanel, rol: string): PendientesPanel {
  return {
    empresas: alcanzaRol(rol, SECCION_DE_PENDIENTE.empresas.rol) ? p.empresas : 0,
  };
}

/** El total de la cabecera: la suma de lo que este rol puede atender. */
export function totalPendientes(p: PendientesPanel, rol: string): number {
  const v = pendientesVisibles(p, rol);
  return (Object.keys(v) as (keyof PendientesPanel)[]).reduce((s, k) => s + v[k], 0);
}

/** La cifra de la insignia de una sección, o 0 si no tiene o este rol no la atiende. */
export function pendientesDeSeccion(href: string, p: PendientesPanel, rol: string): number {
  const v = pendientesVisibles(p, rol);
  return (Object.keys(SECCION_DE_PENDIENTE) as (keyof PendientesPanel)[])
    .filter((k) => SECCION_DE_PENDIENTE[k].href === href)
    .reduce((s, k) => s + v[k], 0);
}

/** Cómo se escribe en una insignia: hasta 99 tal cual, y «99+» a partir de ahí (no cabe más). */
export function textoInsignia(n: number): string | null {
  if (n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}
