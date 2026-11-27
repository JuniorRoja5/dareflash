/**
 * LA MISMA FRASE EN DOS SITIOS DICE LO MISMO (Fase 11 · P5b3).
 *
 * Al sacar los textos del servidor, algunas frases quedan en dos espacios: la que pinta una pantalla
 * (de su espacio, para el cliente) y la que devuelve la ruta (del espacio `api`, server-only); o la del
 * usuario (traducible) y la del PANEL o un CORREO (en castellano, que no se traducen todavía). Quien
 * escribe a soporte cita la palabra que ve: si las dos copias se separan, el botón y el mensaje del
 * servidor se contradicen. Cada par, aquí, con igualdad EXACTA.
 *
 * Para romperlo: cambiar una letra de cualquiera de las dos copias (rojo con el par).
 */
import { describe, expect, it } from "vitest";

import {
  ETIQUETA_MOVIMIENTO_CREDITO,
  FRASE_RECHAZO,
  FRASE_RECHAZO_DESCONOCIDO,
  MSG_MOTIVO_RETIRADA_PUBLICIDAD,
} from "@/config/constants";
import { MARCA } from "@/config/marca";
import { es } from "@/textos/es";

const conMarca = (s: string) => s.replaceAll("{marca}", MARCA);

describe("lo que dice la pantalla y lo que devuelve la ruta", () => {
  const PARES: [string, string, string][] = [
    ["boostCliente.pagoNoDisponible", es.boostCliente.pagoNoDisponible, es.api.losPagosNo],
    ["vipCliente.pagoNoDisponible", es.vipCliente.pagoNoDisponible, es.api.lasSuscripcionesNo],
    ["vipCliente.canceladaOk", es.vipCliente.canceladaOk, es.api.vipCanceladaOk],
    ["creditosCompra.pagoNoDisponible", es.creditosCompra.pagoNoDisponible, es.api.laCompraDe],
    ["creditosCompra.sinVerificar", es.creditosCompra.sinVerificar, es.api.podrasComprarCreditos],
    ["registro.edadMinima", es.registro.edadMinima, es.api.tienesQueSer],
    ["registro.revisaCorreo", es.registro.revisaCorreo, es.api.revisaCorreoRegistro],
    ["altaFormulario.revisaCorreo", es.altaFormulario.revisaCorreo, es.api.revisaCorreoEmpresa],
    ["altaFormulario.webORedes", es.altaFormulario.webORedes, es.api.empresaWebORedes],
    ["participar.soloVip", es.participar.soloVip, es.api.esteRetoEs],
    ["voto.sinVer", es.voto.sinVer, es.api.reproduceEsteVideo],
    ["voto.yaVotoOtra", es.voto.yaVotoOtra, es.api.yaVotasteOtra],
    ["denunciar.sinVerificar", es.denunciar.sinVerificar, es.api.verificaTuCorreoParaPoder],
    ["monedero.sinMinimo", es.monedero.sinMinimo, es.api.retiradaSinMinimo],
    [
      "nuevaCampana.tipoNegocioDesconocido",
      es.nuevaCampana.tipoNegocioDesconocido,
      es.api.publicidadTipoNegocioDesconocido,
    ],
  ];
  it.each(PARES)("%s", (_clave, pantalla, ruta) => {
    expect(pantalla).toBe(ruta);
  });
});

describe("lo que lee el usuario y lo que dice el panel (o el correo)", () => {
  it("el motivo de rechazo de un cobro", () => {
    for (const [m, frase] of Object.entries(FRASE_RECHAZO)) {
      expect(es.cobros[`rechazo_${m}` as keyof typeof es.cobros], m).toBe(frase);
    }
    expect(es.cobros.rechazoDesconocido).toBe(FRASE_RECHAZO_DESCONOCIDO);
  });

  it("el motivo de retirada de una campaña", () => {
    for (const [m, frase] of Object.entries(MSG_MOTIVO_RETIRADA_PUBLICIDAD)) {
      const clave = `motivoRetirada_${m}` as keyof typeof es.publicidad;
      expect(conMarca(es.publicidad[clave] as string), m).toBe(frase);
    }
  });

  it("el concepto de un movimiento de créditos", () => {
    for (const [r, etiqueta] of Object.entries(ETIQUETA_MOVIMIENTO_CREDITO)) {
      const clave = `razon_${r}` as keyof typeof es.creditosEmpresa;
      expect(conMarca(es.creditosEmpresa[clave] as string), r).toBe(etiqueta);
    }
  });
});
