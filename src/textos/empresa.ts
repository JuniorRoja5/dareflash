/**
 * LAS FRASES DE EMPRESA QUE SE CONSTRUYEN CON CIFRAS DE LA CONFIG, en el idioma de la página (Fase 11 ·
 * P5b2b). Las cifras (créditos de regalo, días, la fecha de fin, lo que cuesta un día) salen de
 * `config/constants`; las palabras, del espacio `negocio`. Puras: reciben la `t` del espacio. El
 * panel y los servicios siguen con su castellano en la config, y un test exige que digan lo mismo.
 */
import {
  ALCANCES_POR_NEGOCIO,
  alcanceMasBarato,
  CREDITOS_POR_DIA,
  diasDeRegalo,
  SOCIO_FUNDADOR_CREDITOS,
  SOCIO_FUNDADOR_HASTA_ISO,
  type EstadoEmpresa,
  type MotivoRechazoEmpresa,
  type RazonCredito,
  type TipoCuentaEmpresa,
  type TipoNegocio,
} from "@/config/constants";
import {
  formatearFecha,
  formatearLista,
  formatearNumero,
  ZONA_MADRID,
  type Idioma,
} from "@/lib/formato";

import type { FuncionT } from "./plantilla";
import type { Textos } from "./servidor";

type T = FuncionT<Textos["negocio"]>;

/** El aviso de Socios Fundadores. La fecha, en hora de Madrid: es la del contrato, no la de quien lee. */
export function socioFundador(t: T, idioma: Idioma): string {
  const local = alcanceMasBarato("FISICO");
  const fuera = alcanceMasBarato("ONLINE");
  return t("socioFundador", {
    fecha: formatearFecha(SOCIO_FUNDADOR_HASTA_ISO, idioma, ZONA_MADRID, "diaMesLargoAno"),
    creditos: formatearNumero(SOCIO_FUNDADOR_CREDITOS, idioma),
    diasLocal: t("dias", { n: diasDeRegalo(local) }),
    alcanceLocal: t(`regaloEn_${local}`),
    diasFuera: t("dias", { n: diasDeRegalo(fuera) }),
    alcanceFuera: t(`regaloEn_${fuera}`),
  });
}

/** Lo que cuesta un día de campaña, en una ciudad y en todo el mundo. */
export function creditoDia(t: T, idioma: Idioma): string {
  return t("creditoDia", {
    n: CREDITOS_POR_DIA.CIUDAD,
    global: formatearNumero(CREDITOS_POR_DIA.GLOBAL, idioma),
  });
}

/**
 * Lo que cuesta un día en lo que ESE negocio puede comprar (`ALCANCES_POR_NEGOCIO`), con su tarifa. El
 * tipo es obligatorio, como en `fraseQueEsUnCredito`: quien no lo conoce pide `creditoDia`.
 */
export function queEsUnCredito(t: T, tipo: TipoNegocio, idioma: Idioma): string {
  const tramos = ALCANCES_POR_NEGOCIO[tipo].map((a, i) => {
    const n = CREDITOS_POR_DIA[a];
    const donde = t(`tarifaEn_${a}`);
    return i === 0 ? t("tarifaPrimera", { n, donde }) : t("tarifaOtra", { n, donde });
  });
  return t("tarifa", { tramos: formatearLista(tramos, idioma) });
}

export const tipoCuenta = (t: T, c: TipoCuentaEmpresa) => t(`tipoCuenta_${c}`);
/** Un tipo guardado fuera del catálogo llega como `null` (`tipoNegocioDe`): se dice, no se inventa. */
export const tipoNegocio = (t: T, n: TipoNegocio | null) =>
  n ? t(`tipoNegocio_${n}`) : t("tipoNegocioSinClasificar");
export const estadoEmpresa = (t: T, e: EstadoEmpresa) => t(`estado_${e}`);
export const motivoRechazo = (t: T, m: MotivoRechazoEmpresa) => t(`motivo_${m}`);

/** El concepto de un movimiento de créditos en el idioma de `t` (P5b3). */
export function conceptoDeCredito(
  t: FuncionT<Textos["creditosEmpresa"]>,
  c: { razon: RazonCredito | null; campana: string | null },
): string {
  const etiqueta = c.razon ? t(`razon_${c.razon}`) : t("razonDesconocida");
  return c.campana ? t("conceptoConCampana", { etiqueta, campana: c.campana }) : etiqueta;
}
