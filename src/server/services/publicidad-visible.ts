/**
 * QUÉ CAMPAÑA SE SIRVE (Fase 9 · P8) — la regla, en UN sitio, como `VIDEO_VISIBLE` para los vídeos.
 *
 * Una campaña sale en el feed y en la portada si quiere salir (ACTIVA), no la ha pausado el umbral de
 * denuncias (`ocultoAutoEn` vacío), tiene su imagen y es de una empresa VERIFICADA (suspender una empresa
 * para sus campañas sin esperar a ningún job). Lo que se sirve es también lo único que se puede
 * denunciar: si la entrega y la denuncia tuvieran cada una su copia de esta regla, se podría denunciar
 * algo que no se ve —o no poder denunciar algo que sí—.
 *
 * Es una LECTURA (un `where`): no escribe nada. Por eso puede nombrar `ocultoAutoEn: null` sin romper la
 * regla de «una sola puerta de vuelta» (ver `ocultado-una-direccion`, que lo sabe).
 *
 * Además, para salir HOY tiene que ocupar el día de hoy: eso lo añade quien sirve (`campanasDeHoy`).
 */
import type { Prisma } from "@/generated/prisma/client";

export const PUBLICIDAD_SERVIBLE = {
  estado: "ACTIVA",
  ocultoAutoEn: null,
  imagen: { not: null },
  empresa: { estado: "VERIFICADA" },
} satisfies Prisma.PublicidadWhereInput;
