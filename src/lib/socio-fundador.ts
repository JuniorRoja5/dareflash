import { SOCIO_FUNDADOR_HASTA_ISO } from "@/config/constants";

/**
 * ¿Es SOCIO FUNDADOR una empresa verificada en este instante? Pura (Fase 9 · P4).
 *
 * Se decide por `Empresa.verificadaEn`, que se SELLA una vez —la primera verificación— y no se mueve:
 * una empresa verificada a tiempo y rechazada después sigue habiéndose verificado a tiempo. El límite
 * es INCLUSIVO y lleva su zona dentro (`SOCIO_FUNDADOR_HASTA_ISO`, Europe/Madrid): verificada a las
 * 23:59:59.999 de Madrid del último día, entra.
 *
 * La migración del backfill usa el MISMO instante escrito en UTC; `tests/creditos` comprueba que los
 * dos dicen lo mismo, para que cambiar la fecha aquí no deje la migración con la vieja.
 */
export function esSocioFundador(verificadaEn: Date): boolean {
  return verificadaEn.getTime() <= new Date(SOCIO_FUNDADOR_HASTA_ISO).getTime();
}
