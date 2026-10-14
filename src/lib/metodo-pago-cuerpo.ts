import { z } from "zod";

import {
  MetodoRetiradaSchema,
  MSG_RETIRADA_NO_DISPONIBLE,
  RedCriptoSchema,
} from "@/config/constants";

/**
 * EL CUERPO DE UN MÉTODO DE COBRO Y SU COPY, en un sitio y no en dos.
 *
 * Lo usan las DOS rutas que aceptan un destino: `POST /api/metodos-pago` (alta) y
 * `PUT /api/metodos-pago/[id]` (sustituir). Vive aquí y no en una de ellas porque un fichero de ruta
 * de Next solo puede exportar sus verbos: compartirlo desde allí no es una opción, y copiarlo sería
 * dejar dos validaciones del mismo dato libres de separarse — justo con el dato que, mal escrito, se
 * congela en todas las solicitudes futuras.
 *
 * La RED es obligatoria en cripto y de la LISTA CERRADA: una red que DareFlash no envía es dinero
 * perdido. La comprobación de que la dirección es DE esa red la hace `validarDestino`, que es la
 * misma función que corre en el navegador.
 */
export const CuerpoMetodoPagoSchema = z.discriminatedUnion("metodo", [
  z.object({
    metodo: z.literal(MetodoRetiradaSchema.enum.BANK),
    iban: z.string().min(10).max(40),
    titular: z.string().min(2).max(120),
  }),
  z.object({
    metodo: z.literal(MetodoRetiradaSchema.enum.CRYPTO),
    direccion: z.string().min(10).max(120),
    red: RedCriptoSchema,
  }),
]);

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
  RED_NO_SOPORTADA: "Esa red no está disponible. Elige una de la lista.",
  DIRECCION_INVALIDA: "Revisa la dirección: no parece completa.",
  DIRECCION_NO_ES_DE_LA_RED:
    "Esa dirección no es de la red elegida. Comprueba las dos: un envío a la red equivocada no se puede recuperar.",
  METODO_DESCONOCIDO: "Elige banco o cripto.",
};
