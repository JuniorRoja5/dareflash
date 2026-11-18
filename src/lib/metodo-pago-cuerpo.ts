import { z } from "zod";

import { MSG_RETIRADA_NO_DISPONIBLE } from "@/config/constants";
import { MetodoRetiradaSchema } from "@/config/esquemas";

import type { DestinoRetirada } from "./retirada";

/**
 * EL CUERPO DE UN MÉTODO DE COBRO Y SU COPY, en un sitio y no en dos.
 *
 * Lo usan las DOS rutas que aceptan un destino: `POST /api/metodos-pago` (alta) y
 * `PUT /api/metodos-pago/[id]` (sustituir). Vive aquí y no en una de ellas porque un fichero de ruta
 * de Next solo puede exportar sus verbos: compartirlo desde allí no es una opción, y copiarlo sería
 * dejar dos validaciones del mismo dato libres de separarse — justo con el dato que, mal escrito, se
 * congela en todas las solicitudes futuras.
 *
 * El método sale del CATÁLOGO (`MetodoRetiradaSchema`), y hoy el catálogo es solo `BANK`. La forma
 * fina del IBAN la comprueba `validarDestino`, que es la misma función que corre en el navegador.
 */
export const CuerpoMetodoPagoSchema = z.object({
  metodo: MetodoRetiradaSchema,
  iban: z.string().min(10).max(40),
  titular: z.string().min(2).max(120),
});

/**
 * El copy por motivo de rechazo. Lo que la persona puede hacer algo con, nunca el código: "IBAN
 * inválido" no le dice qué mirar, "revisa el IBAN: no parece completo" sí.
 */
export const MENSAJE_METODO_PAGO: Record<string, string> = {
  SIN_CIFRADO: MSG_RETIRADA_NO_DISPONIBLE,
  DEMASIADOS:
    "Ya tienes todos los métodos de cobro que se pueden guardar. Borra uno para añadir otro.",
  IBAN_INVALIDO: "Revisa el IBAN: no parece completo.",
  TITULAR_VACIO: "Falta el nombre del titular de la cuenta.",
  METODO_DESCONOCIDO: "Solo puedes cobrar en una cuenta bancaria: añade su IBAN y el titular.",
};

/**
 * LEE EL CUERPO y, si no vale, dice POR QUÉ con una frase que se pueda enseñar.
 *
 * ┌─ UN MÉTODO FUERA DEL CATÁLOGO NO ES UN "NO HEMOS PODIDO PROCESAR" ────────────────────────────┐
 * │ Quien manda `metodo: "CRYPTO"` (una app vieja en caché, un formulario de antes de retirar la  │
 * │ cripto, una integración a mano) no ha mandado basura: ha pedido algo que ya no existe. Se le   │
 * │ dice qué SÍ se puede, en vez del genérico de validación, que no le dice qué cambiar.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function leerCuerpoMetodoPago(
  json: unknown,
):
  | { ok: true; destino: DestinoRetirada }
  | { ok: false; codigo: "METODO_DESCONOCIDO" | "VALIDATION"; mensaje: string } {
  const cuerpo = CuerpoMetodoPagoSchema.safeParse(json);
  if (cuerpo.success) return { ok: true, destino: cuerpo.data };
  const metodo = (json as { metodo?: unknown } | null)?.metodo;
  if (!MetodoRetiradaSchema.safeParse(metodo).success) {
    return {
      ok: false,
      codigo: "METODO_DESCONOCIDO",
      mensaje: MENSAJE_METODO_PAGO.METODO_DESCONOCIDO!,
    };
  }
  return { ok: false, codigo: "VALIDATION", mensaje: "No hemos podido procesar la petición." };
}
