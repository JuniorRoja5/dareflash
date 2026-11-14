/**
 * ESQUEMAS de los catálogos de `constants.ts` (Fase 11 · P1b): el `z.enum` de cada uno, construido con
 * su lista `VALORES_*`. Es la ÚNICA puerta entre `constants.ts` y zod.
 *
 * Por qué viven aparte: `constants.ts` lo importan decenas de componentes de cliente (textos, límites,
 * catálogos), y un `z.enum(...)` en ámbito de módulo es una LLAMADA que el empaquetador no puede quitar.
 * Con los esquemas dentro, zod entero (~67 KB gzip) viajaba en el JS de TODAS las páginas. Aquí solo
 * los importa el servidor (rutas, servicios, jobs); el cliente valida un catálogo con `esUnoDe`
 * (`lib/valores`) sobre la MISMA lista.
 *
 * Sin copias: cada esquema se construye con la lista importada, nunca con los valores reescritos
 * (lo vigila `tests/zod-fuera-del-cliente.test.ts`, igual que que ningún cliente llegue hasta aquí).
 */
import { z } from "zod";

import {
  VALORES_METODO_RETIRADA,
  VALORES_RED_CRIPTO,
  VALORES_MOTIVO_RECHAZO,
  VALORES_PAQUETE_BOOST,
  VALORES_PLAN_VIP,
  VALORES_ESTADO_SUSCRIPCION,
  VALORES_COLOR_NOMBRE,
  VALORES_VIDEO_FAILURE_REASON,
  VALORES_WALLET_STATUS,
  VALORES_WALLET_ENTRY_TYPE,
  VALORES_CHALLENGE_STATUS,
  VALORES_MOTIVO_CIERRE,
  VALORES_TIPO_NOTIFICACION,
  VALORES_REF_NOTIFICACION,
  VALORES_AUDIENCIA_ANUNCIO,
  VALORES_RETIRADA_COMENTARIO,
  VALORES_BOOST_REASON,
  VALORES_REPORT_STATUS,
  VALORES_REPORT_TARGET_TYPE,
  VALORES_REPORT_TARGET_DENUNCIABLE,
  VALORES_REPORT_TARGET_MODERABLE,
  VALORES_REPORT_REASON,
  VALORES_AUDIT_ACCION_CUENTA,
  VALORES_JOB_STATUS,
  VALORES_JOB_TYPE,
  VALORES_VERIFICATION_PURPOSE,
  VALORES_TIPO_CUENTA_EMPRESA,
  VALORES_TIPO_NEGOCIO,
  VALORES_ESTADO_EMPRESA,
  VALORES_ALCANCE_PUBLICIDAD,
  VALORES_ESPACIO_PUBLICIDAD,
  VALORES_MOTIVO_RECHAZO_EMPRESA,
  VALORES_AUDIT_ACCION_EMPRESA,
  VALORES_ESTADO_RETO_SOLICITUD,
  VALORES_MOTIVO_RECHAZO_RETO,
  VALORES_AUDIT_ACCION_RETO_SOLICITUD,
  VALORES_RAZON_CREDITO,
  VALORES_PAQUETE_CREDITOS,
  VALORES_ESTADO_PUBLICIDAD,
  VALORES_MOTIVO_RETIRADA_PUBLICIDAD,
  VALORES_NIVEL_AFORO,
} from "./constants";

export const MetodoRetiradaSchema = z.enum(VALORES_METODO_RETIRADA);
export const RedCriptoSchema = z.enum(VALORES_RED_CRIPTO);
export const MotivoRechazoSchema = z.enum(VALORES_MOTIVO_RECHAZO);
export const PaqueteBoostSchema = z.enum(VALORES_PAQUETE_BOOST);
export const PlanVipSchema = z.enum(VALORES_PLAN_VIP);
export const EstadoSuscripcionSchema = z.enum(VALORES_ESTADO_SUSCRIPCION);
export const ColorNombreSchema = z.enum(VALORES_COLOR_NOMBRE);
export const VideoFailureReasonSchema = z.enum(VALORES_VIDEO_FAILURE_REASON);
export const WalletStatusSchema = z.enum(VALORES_WALLET_STATUS);
export const WalletEntryTypeSchema = z.enum(VALORES_WALLET_ENTRY_TYPE);
export const ChallengeStatusSchema = z.enum(VALORES_CHALLENGE_STATUS);
export const MotivoCierreSchema = z.enum(VALORES_MOTIVO_CIERRE);
export const TipoNotificacionSchema = z.enum(VALORES_TIPO_NOTIFICACION);
export const RefNotificacionSchema = z.enum(VALORES_REF_NOTIFICACION);
export const AudienciaAnuncioSchema = z.enum(VALORES_AUDIENCIA_ANUNCIO);
export const RetiradaComentarioSchema = z.enum(VALORES_RETIRADA_COMENTARIO);
export const BoostReasonSchema = z.enum(VALORES_BOOST_REASON);
export const ReportStatusSchema = z.enum(VALORES_REPORT_STATUS);
export const ReportTargetTypeSchema = z.enum(VALORES_REPORT_TARGET_TYPE);
export const ReportTargetDenunciableSchema = z.enum(VALORES_REPORT_TARGET_DENUNCIABLE);
export const ReportTargetModerableSchema = z.enum(VALORES_REPORT_TARGET_MODERABLE);
export const ReportReasonSchema = z.enum(VALORES_REPORT_REASON);
export const AuditAccionCuentaSchema = z.enum(VALORES_AUDIT_ACCION_CUENTA);
export const JobStatusSchema = z.enum(VALORES_JOB_STATUS);
export const JobTypeSchema = z.enum(VALORES_JOB_TYPE);
export const VerificationPurposeSchema = z.enum(VALORES_VERIFICATION_PURPOSE);
export const TipoCuentaEmpresaSchema = z.enum(VALORES_TIPO_CUENTA_EMPRESA);
export const TipoNegocioSchema = z.enum(VALORES_TIPO_NEGOCIO);
export const EstadoEmpresaSchema = z.enum(VALORES_ESTADO_EMPRESA);
export const AlcancePublicidadSchema = z.enum(VALORES_ALCANCE_PUBLICIDAD);
export const EspacioPublicidadSchema = z.enum(VALORES_ESPACIO_PUBLICIDAD);
export const MotivoRechazoEmpresaSchema = z.enum(VALORES_MOTIVO_RECHAZO_EMPRESA);
export const AuditAccionEmpresaSchema = z.enum(VALORES_AUDIT_ACCION_EMPRESA);
export const EstadoRetoSolicitudSchema = z.enum(VALORES_ESTADO_RETO_SOLICITUD);
export const MotivoRechazoRetoSchema = z.enum(VALORES_MOTIVO_RECHAZO_RETO);
export const AuditAccionRetoSolicitudSchema = z.enum(VALORES_AUDIT_ACCION_RETO_SOLICITUD);
export const RazonCreditoSchema = z.enum(VALORES_RAZON_CREDITO);
export const PaqueteCreditosSchema = z.enum(VALORES_PAQUETE_CREDITOS);
export const EstadoPublicidadSchema = z.enum(VALORES_ESTADO_PUBLICIDAD);
export const MotivoRetiradaPublicidadSchema = z.enum(VALORES_MOTIVO_RETIRADA_PUBLICIDAD);
export const NivelAforoSchema = z.enum(VALORES_NIVEL_AFORO);
