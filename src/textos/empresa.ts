/**
 * LAS FRASES DE EMPRESA QUE SE CONSTRUYEN CON CIFRAS DE LA CONFIG, en el idioma de la página (Fase 11 ·
 * P5b2b). Las cifras (créditos de regalo, días, la fecha de fin, lo que cuesta un día) salen de
 * `config/constants`; las palabras, del espacio `negocio`. Puras: reciben la `t` del espacio. El
 * panel y los servicios siguen con su castellano en la config, y un test exige que digan lo mismo.
 */
import {
  alcanceMasBarato,
  CREDITOS_POR_DIA,
  diasDeRegalo,
  SOCIO_FUNDADOR_CREDITOS,
  SOCIO_FUNDADOR_HASTA_ISO,
  type TipoCuentaEmpresa,
  type TipoNegocio,
} from "@/config/constants";
import { formatearFecha, formatearNumero, ZONA_MADRID, type Idioma } from "@/lib/formato";

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

export const tipoCuenta = (t: T, c: TipoCuentaEmpresa) => t(`tipoCuenta_${c}`);
export const tipoNegocio = (t: T, n: TipoNegocio) => t(`tipoNegocio_${n}`);
