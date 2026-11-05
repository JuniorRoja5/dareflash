/**
 * CUENTAS DE EMPRESA (Fase 9 · P1) — registrar, mirar y verificar a mano.
 *
 * EL PUNTO ÚNICO donde nace y cambia una `Empresa`. Las rutas no saben gobernar: traen quién lo
 * pide y qué pide, y traducen el resultado a copy humano.
 *
 * ┌─ EL ÁMBITO ES UN PARÁMETRO OBLIGATORIO, NO UN FILTRO QUE SE PUEDA OLVIDAR ────────────────────┐
 * │ Todo lo que lee datos de UNA empresa recibe su `empresaId` como primer argumento, y ese id     │
 * │ solo lo produce `requireEmpresa()` (el chokepoint, en `server/auth/empresa-actual`). Nunca se  │
 * │ lee del cuerpo ni de la query: un `empresaId` que venga del cliente es un IDOR con otro        │
 * │ nombre — el fallo que ya costó una revisión en esta misma fase.                                 │
 * │                                                                                                 │
 * │ Un filtro opcional se puede olvidar y el código compila, pasa los tests y devuelve datos de    │
 * │ más. Un parámetro obligatorio NO compila si falta, y `typecheck` corre en el pre-commit.       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL MOTIVO SE ENSEÑA Y LA NOTA NO. Hay dos DTO y son distintos a propósito: el del dueño
 * (`MiEmpresa`) no trae `notaInterna` ni quién la verificó, y el del panel (`EmpresaPanel`) trae las
 * dos cosas. Misma regla que la nota del ajuste de puntos, y con su test de igualdad exacta de
 * claves: el hueco típico no es una consulta sin filtro, es un `select` que creció.
 *
 * EL AVISO VA EN LA MISMA TRANSACCIÓN que el registro (ver `registrarEmpresa`).
 */
import "server-only";

import {
  EMPRESAS_PAGINA,
  EMPRESA_CIUDAD_MAX,
  EMPRESA_CONTACTO_MAX,
  EMPRESA_CONTACTO_MIN,
  EMPRESA_DIRECCION_MAX,
  EMPRESA_FISCAL_MAX,
  EMPRESA_NOMBRE_MAX,
  EMPRESA_NOMBRE_MIN,
  EMPRESA_NOTA_MAX,
  EMPRESA_REDES_MAX,
  EMPRESA_WEB_MAX,
  MSG_EMPRESA_DATOS_INVALIDOS,
  MSG_EMPRESA_WEB_O_REDES,
  MSG_MOTIVO_RECHAZO_EMPRESA,
  SOCIO_FUNDADOR_CREDITOS,
  TITULO_AVISO_EMPRESA_NUEVA,
  msgAvisoEmpresaNueva,
  type AuditAccionEmpresa,
  type EstadoEmpresa,
  type MotivoRechazoEmpresa,
  type TipoCuentaEmpresa,
  type TipoNegocio,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  codificarCursorTiempo,
  conKeysetTiempo,
  decodificarCursorTiempo,
} from "@/lib/cursor-tiempo";
import { puedeDecidirEmpresa } from "@/lib/empresa";
import { esPaisIso } from "@/lib/paises";
import { generarCodigoReferido } from "@/server/auth/codigo-referido";
import { generarHandle, HANDLE_MAX_INTENTOS } from "@/server/auth/handle";
import { hashPassword } from "@/server/auth/password";
import {
  esViolacionUnicaDeCodigoReferido,
  esViolacionUnicaDeEmail,
  esViolacionUnicaDeUsername,
} from "@/server/auth/registration";
import type { Db } from "@/server/db/types";
import { renderCorreoHtml } from "@/server/email/plantilla";
import { enqueueEmail } from "@/server/email/send";
import { avisarCuentaExistente } from "@/server/services/aviso-cuenta-existente";
import { requestEmailVerification } from "@/server/services/email-verification";

export class EmpresaError extends Error {
  constructor(
    public readonly code: "DATOS_INVALIDOS",
    message: string,
  ) {
    super(message);
    this.name = "EmpresaError";
  }
}

/** Clave del aviso al admin: UNA por empresa. Un reintento del worker no manda un segundo correo. */
export function claveAvisoEmpresa(empresaId: string): string {
  return `empresa-pendiente:${empresaId}`;
}

// ---------------------------------------------------------------------------------------------------
// EL RESOLVEDOR DEL CHOKEPOINT. Es la ÚNICA función que busca una empresa por su dueño, y la usa
// solo `requireEmpresa()`. Todo lo demás parte del `empresaId` que ella devuelve.
// ---------------------------------------------------------------------------------------------------

export interface EmpresaDeSesion {
  id: string;
  estado: EstadoEmpresa;
}

/**
 * La empresa de ESTE usuario, o `null`. Devuelve lo mínimo —id y estado— porque es lo único que el
 * guard necesita para decidir; los datos se piden después, ya con el ámbito en la mano.
 */
export async function empresaDeUsuario(db: Db, userId: string): Promise<EmpresaDeSesion | null> {
  const e = await db.empresa.findUnique({
    where: { ownerUserId: userId },
    select: { id: true, estado: true },
  });
  return e ? { id: e.id, estado: e.estado as EstadoEmpresa } : null;
}

// ---------------------------------------------------------------------------------------------------
// EL ALTA — SIEMPRE DESDE CERO
// ---------------------------------------------------------------------------------------------------

export interface EntradaRegistro {
  /** La cuenta se CREA aquí: no hay sesión previa. Ver el docblock de `altaEmpresaDesdeCero`. */
  email: string;
  password: string;
  /** Lo sella el servidor, como en el registro de participante: una fecha que manda quien consiente no prueba nada. */
  terminosAceptadosEn: Date;
  nombre: string;
  tipoCuenta: TipoCuentaEmpresa;
  tipoNegocio: TipoNegocio;
  /** ISO 3166-1 alpha-2. Obligatorio. */
  paisIso: string;
  /** Con quién se habla. Obligatorio. */
  personaContacto: string;
  /** Texto libre hasta P5: sirve para verificar, no segmenta nada. */
  ciudadTexto?: string | null;
  /** Web O redes: al menos uno de los dos (lo exige el servicio, no el esquema). */
  webUrl?: string | null;
  redes?: string | null;
  direccion?: string | null;
  /** Identificación fiscal y su país emisor. OPCIONALES, y no salen de la ficha del admin. */
  fiscalId?: string | null;
  fiscalPaisIso?: string | null;
}

/** Lo que hace falta para avisar. Se INYECTA: el servicio no lee `env` (regla de la casa). */
export interface AvisoRegistro {
  /** `null` = no hay destinatario configurado: no se encola nada y se deja una línea en el log. */
  adminEmail: string | null;
  /** Enlace a la cola del panel. Un enlace, no un token: se mira con una sesión. */
  urlPanel: string;
  /** Base para el enlace del correo de verificación (el de la cuenta recién creada). */
  appUrl: string;
  log?: (mensaje: string) => void;
}

export interface EmpresaRegistrada {
  /**
   * `false` = ese correo ya tenía cuenta (o dos altas simultáneas): NO se ha creado nada.
   *
   * NO LLEVA EL `id`, y es a propósito: quien llama responde lo MISMO en los dos casos (ver la
   * ruta). Devolver el id sería darle al cliente la forma de distinguirlos, que es el oráculo de
   * enumeración que el registro de participante se cuida de no abrir.
   */
  creado: boolean;
}

/** Texto opcional: se limpia y, si queda vacío, es `null` — no cadena vacía. */
const opcional = (v: string | null | undefined, max: number): string | null =>
  v?.trim().slice(0, max) || null;

/** Las reglas del alta que NO dependen de la base de datos. Lanzan con copy humano. */
function validarAlta(entrada: EntradaRegistro): {
  nombre: string;
  personaContacto: string;
  paisIso: string;
} {
  const nombre = entrada.nombre.trim();
  if (nombre.length < EMPRESA_NOMBRE_MIN || nombre.length > EMPRESA_NOMBRE_MAX) {
    throw new EmpresaError(
      "DATOS_INVALIDOS",
      `El nombre tiene que tener entre ${EMPRESA_NOMBRE_MIN} y ${EMPRESA_NOMBRE_MAX} caracteres.`,
    );
  }
  const personaContacto = entrada.personaContacto.trim();
  if (
    personaContacto.length < EMPRESA_CONTACTO_MIN ||
    personaContacto.length > EMPRESA_CONTACTO_MAX
  ) {
    throw new EmpresaError("DATOS_INVALIDOS", MSG_EMPRESA_DATOS_INVALIDOS);
  }
  const paisIso = entrada.paisIso.trim().toUpperCase();
  if (!esPaisIso(paisIso)) throw new EmpresaError("DATOS_INVALIDOS", MSG_EMPRESA_DATOS_INVALIDOS);
  // WEB O REDES, AL MENOS UNO. Es la regla que no cabe en el esquema (un CHECK que nadie ve) y la
  // que decide si el admin PUEDE verificar: sin ninguno de los dos no hay nada que comprobar.
  if (!entrada.webUrl?.trim() && !entrada.redes?.trim()) {
    throw new EmpresaError("DATOS_INVALIDOS", MSG_EMPRESA_WEB_O_REDES);
  }
  return { nombre, personaContacto, paisIso };
}

/**
 * EL ALTA DE UNA EMPRESA, SIEMPRE DESDE CERO: crea la CUENTA y la EMPRESA juntas.
 *
 * ┌─ POR QUÉ NO SE PUEDE COLGAR DE UNA CUENTA QUE YA EXISTE ───────────────────────────────────────┐
 * │ Una cuenta de empresa NO PARTICIPA (ver `User.esCuentaEmpresa` y el candado de                 │
 * │ `mutatingRoute`). Si el alta convirtiera una cuenta de participante, habría que decidir qué    │
 * │ pasa con sus vídeos, sus votos, sus puntos y su monedero — y cualquier respuesta a eso es peor │
 * │ que la regla simple: una empresa se registra con un correo NUEVO. Así la cuenta nace siendo lo │
 * │ que es y no hay ninguna conversión que auditar.                                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SIN ENUMERACIÓN, igual que el registro de participante y por lo mismo: si el correo ya tiene
 * cuenta, esto es un no-op SILENCIOSO (`creado: false`) y quien llama responde lo mismo que si
 * hubiera creado. El coste en tiempo también es el mismo: argon2 se calcula SIEMPRE y ANTES de
 * tocar la base de datos. Lo que explica la regla al humano es el copy del formulario
 * (`MSG_EMPRESA_CORREO_NUEVO`), que se lee ANTES de intentarlo y no delata nada.
 *
 * TODO EN UNA TRANSACCIÓN: la cuenta, su marca de empresa, la empresa y el aviso al admin. Si algo
 * revienta no queda ni media cuenta ni un correo prometiendo una empresa que no existe.
 *
 * EL CORREO DE VERIFICACIÓN VA DESPUÉS, fuera de la transacción, y no es un descuido: es lo que ya
 * hace `registerUser`, y la diferencia con el aviso al admin es que este SÍ se puede recuperar
 * («reenviar verificación») mientras que una empresa esperando sin que nadie lo sepa, no.
 *
 * El `username` y el `referralCode` se auto-generan y, si chocan, se REGENERAN y se reintenta
 * (acotado), igual que en el alta de participante: la constraint es el árbitro, nunca un
 * findUnique-luego-create.
 */
export async function altaEmpresaDesdeCero(
  db: PrismaClient,
  entrada: EntradaRegistro,
  aviso: AvisoRegistro,
  now: Date = new Date(),
): Promise<EmpresaRegistrada> {
  const { nombre, personaContacto, paisIso } = validarAlta(entrada);
  const email = entrada.email.trim().toLowerCase();

  // SIEMPRE y ANTES de mirar la BD: el coste dominante es igual exista o no la cuenta, así que no
  // hay diferencia de tiempo que delate direcciones registradas.
  const passwordHash = await hashPassword(entrada.password);

  const datosEmpresa = {
    nombre,
    tipoCuenta: entrada.tipoCuenta,
    tipoNegocio: entrada.tipoNegocio,
    estado: "PENDIENTE",
    paisIso,
    personaContacto,
    ciudadTexto: opcional(entrada.ciudadTexto, EMPRESA_CIUDAD_MAX),
    webUrl: opcional(entrada.webUrl, EMPRESA_WEB_MAX),
    redes: opcional(entrada.redes, EMPRESA_REDES_MAX),
    direccion: opcional(entrada.direccion, EMPRESA_DIRECCION_MAX),
    fiscalId: opcional(entrada.fiscalId, EMPRESA_FISCAL_MAX),
    fiscalPaisIso: entrada.fiscalPaisIso?.trim().toUpperCase() || null,
    createdAt: now,
  };

  for (let intento = 0; ; intento += 1) {
    try {
      await db.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email,
            username: generarHandle(),
            referralCode: generarCodigoReferido(),
            passwordHash,
            terminosAceptadosEn: entrada.terminosAceptadosEn,
            emailVerified: null, // sin verificar: sin acciones con efectos, tampoco en el portal
            // LA MARCA, en la MISMA transacción que la fila de `Empresa`: por eso el cache no
            // puede discrepar de la verdad — no hay forma de crear una sin la otra.
            esCuentaEmpresa: true,
            createdAt: now,
          },
          select: { id: true },
        });

        const e = await tx.empresa.create({
          data: { ownerUserId: u.id, ...datosEmpresa },
          select: { id: true },
        });

        if (aviso.adminEmail) {
          await enqueueEmail(
            tx,
            {
              to: aviso.adminEmail,
              subject: TITULO_AVISO_EMPRESA_NUEVA,
              text: msgAvisoEmpresaNueva({
                nombre,
                tipoNegocio: entrada.tipoNegocio,
                urlPanel: aviso.urlPanel,
              }),
            },
            { idempotencyKey: claveAvisoEmpresa(e.id), runAt: now },
          );
        } else {
          aviso.log?.(
            "[empresas] ADMIN_EMAIL sin configurar: la empresa queda registrada y NADIE recibe el aviso.",
          );
        }
      });
      break; // creada
    } catch (err) {
      // El correo ya tenía cuenta (o dos altas a la vez): SIN enumeración, pero NO en silencio.
      // Se avisa al DUEÑO de la dirección, y así la pantalla («te hemos enviado un mensaje») es
      // verdad también en este caso. Antes era un no-op mudo y la pantalla mentía: lo encontró
      // Junior en producción. Ver `services/aviso-cuenta-existente`.
      if (esViolacionUnicaDeEmail(err)) {
        await avisarCuentaExistente(db, {
          email,
          motivo: "EMPRESA",
          appUrl: aviso.appUrl,
          ahora: now,
        });
        return { creado: false };
      }
      // Handle o código de referido repetidos: valores aleatorios que chocaron. Se regeneran solos
      // en el siguiente intento, que es lo que hace el alta de participante.
      const recuperable = esViolacionUnicaDeUsername(err) || esViolacionUnicaDeCodigoReferido(err);
      if (recuperable && intento < HANDLE_MAX_INTENTOS - 1) continue;
      throw err;
    }
  }

  // Fuera de la transacción, como en el alta de participante (ver el docblock).
  await requestEmailVerification(db, { email, appUrl: aviso.appUrl, now });
  return { creado: true };
}

// ---------------------------------------------------------------------------------------------------
// MIRAR — dos DTO distintos, y la diferencia es el punto
// ---------------------------------------------------------------------------------------------------

/**
 * LO QUE VE EL DUEÑO. No trae `notaInterna` ni `verificadaPor`: la nota es traza del equipo y el
 * handle de quien verifica no es asunto de nadie de fuera (misma regla que el ajuste de puntos).
 * Hay test de igualdad EXACTA de claves, no de "contiene": así un `select` que crezca se pone rojo.
 */
export interface MiEmpresa {
  id: string;
  nombre: string;
  tipoCuenta: TipoCuentaEmpresa;
  tipoNegocio: TipoNegocio;
  estado: EstadoEmpresa;
  paisIso: string;
  ciudadTexto: string | null;
  personaContacto: string;
  webUrl: string | null;
  redes: string | null;
  direccion: string | null;
  motivoRechazo: MotivoRechazoEmpresa | null;
  creadaMs: number;
  verificadaMs: number | null;
}

/**
 * La empresa del portal, POR SU `empresaId` (el que produce el chokepoint). No recibe un `userId`
 * ni lo busca: así no hay forma de pedir "la empresa de este otro usuario" ni por descuido.
 */
export async function miEmpresa(db: Db, empresaId: string): Promise<MiEmpresa | null> {
  const e = await db.empresa.findUnique({
    where: { id: empresaId },
    // SIN `fiscalId` NI `fiscalPaisIso`: en una marca personal es el documento de una persona, y
    // solo se enseña en la ficha de verificación del admin (ver `fichaEmpresa`).
    select: {
      id: true,
      nombre: true,
      tipoCuenta: true,
      tipoNegocio: true,
      estado: true,
      paisIso: true,
      ciudadTexto: true,
      personaContacto: true,
      webUrl: true,
      redes: true,
      direccion: true,
      motivoRechazo: true,
      createdAt: true,
      verificadaEn: true,
    },
  });
  if (!e) return null;
  return {
    id: e.id,
    nombre: e.nombre,
    tipoCuenta: e.tipoCuenta as TipoCuentaEmpresa,
    tipoNegocio: e.tipoNegocio as TipoNegocio,
    estado: e.estado as EstadoEmpresa,
    paisIso: e.paisIso,
    ciudadTexto: e.ciudadTexto,
    personaContacto: e.personaContacto,
    webUrl: e.webUrl,
    redes: e.redes,
    direccion: e.direccion,
    motivoRechazo: e.motivoRechazo as MotivoRechazoEmpresa | null,
    creadaMs: e.createdAt.getTime(),
    verificadaMs: e.verificadaEn?.getTime() ?? null,
  };
}

/**
 * LO QUE VE EL PANEL EN EL LISTADO: lo del dueño MÁS la nota interna y las firmas.
 *
 * DOS COSAS QUE NO ESTÁN, y las dos por la misma razón —un listado enseña veinticinco de golpe—:
 *  - el EMAIL del dueño (su única puerta es la ficha de la cuenta, que escribe `AuditLog`);
 *  - la IDENTIFICACIÓN FISCAL, que en una marca personal es el documento de una persona. Vive en
 *    `FichaEmpresa`, de una en una. Hay test de igualdad EXACTA de claves: el hueco de verdad no es
 *    una consulta sin filtro, es un `select` que crece.
 */
export interface EmpresaPanel {
  id: string;
  nombre: string;
  tipoCuenta: TipoCuentaEmpresa;
  tipoNegocio: TipoNegocio;
  estado: EstadoEmpresa;
  paisIso: string;
  ciudadTexto: string | null;
  personaContacto: string;
  webUrl: string | null;
  redes: string | null;
  direccion: string | null;
  motivoRechazo: MotivoRechazoEmpresa | null;
  notaInterna: string | null;
  /** Handle del dueño (no su correo). */
  dueno: string | null;
  creadaMs: number;
  verificadaMs: number | null;
  /** Handle de quien la verificó, para el equipo. */
  verificadaPor: string | null;
}

export interface PaginaEmpresas {
  items: EmpresaPanel[];
  proximoCursor: string | null;
}

/**
 * LA COLA DE VERIFICACIÓN: más nuevas primero, por KEYSET sobre (createdAt, id), con filtro
 * opcional de estado. Dos consultas por página haya las que haya: la página y los handles.
 *
 * EL FILTRO SE COMPONE CON `conKeysetTiempo`, NO CON SPREAD. Hoy el `where` es una conjunción plana
 * y el spread funcionaría; el día que alguien añada un `OR` —"pendientes **o** rechazadas"— el
 * spread se comería una de las dos ramas SIN AVISAR y la página 2 dejaría de filtrar lo que
 * filtraba la 1. Cuesta lo mismo hacerlo bien desde el principio.
 */
/**
 * EL FILTRO DE LA COLA, en un solo sitio. Lo usan la LISTA (`listarEmpresas`) y el CONTADOR
 * (`contarEmpresas`), y es lo que hace que el número de la insignia y las filas de la cola no puedan
 * discrepar: si mañana «pendiente» pasa a excluir algo, cambia aquí y cambian los dos. Dos `where`
 * escritos a mano acabarían diciendo «3 por verificar» sobre una cola de 2.
 */
export function filtroEmpresas(estado: EstadoEmpresa | null | undefined): { estado?: string } {
  return estado ? { estado } : {};
}

/** Cuántas hay en ese estado. Lee EL MISMO filtro que la cola (ver `filtroEmpresas`). */
export function contarEmpresas(db: Db, estado: EstadoEmpresa): Promise<number> {
  return db.empresa.count({ where: filtroEmpresas(estado) });
}

export async function listarEmpresas(
  db: Db,
  opciones: { estado?: EstadoEmpresa | null; cursor?: string | null; limite?: number } = {},
): Promise<PaginaEmpresas> {
  const limite = Math.min(Math.max(opciones.limite ?? EMPRESAS_PAGINA, 1), 50);
  const filtro = filtroEmpresas(opciones.estado);

  const filas = await db.empresa.findMany({
    where: conKeysetTiempo(filtro, decodificarCursorTiempo(opciones.cursor)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
    // SIN `fiscalId` NI `fiscalPaisIso`: un listado enseña veinticinco de golpe (ver el DTO).
    select: {
      id: true,
      nombre: true,
      tipoCuenta: true,
      tipoNegocio: true,
      estado: true,
      paisIso: true,
      ciudadTexto: true,
      personaContacto: true,
      webUrl: true,
      redes: true,
      direccion: true,
      motivoRechazo: true,
      notaInterna: true,
      ownerUserId: true,
      verificadaPor: true,
      createdAt: true,
      verificadaEn: true,
    },
  });
  const pagina = filas.slice(0, limite);
  if (pagina.length === 0) return { items: [], proximoCursor: null };

  // Los handles del dueño y de quien verificó, en UNA consulta para toda la página (no N+1).
  const ids = [
    ...new Set([
      ...pagina.map((e) => e.ownerUserId),
      ...pagina.flatMap((e) => (e.verificadaPor ? [e.verificadaPor] : [])),
    ]),
  ];
  const cuentas = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true },
  });
  const handle = new Map(cuentas.map((c) => [c.id, c.username]));

  const ultima = pagina[pagina.length - 1]!;
  return {
    items: pagina.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      tipoCuenta: e.tipoCuenta as TipoCuentaEmpresa,
      tipoNegocio: e.tipoNegocio as TipoNegocio,
      estado: e.estado as EstadoEmpresa,
      paisIso: e.paisIso,
      ciudadTexto: e.ciudadTexto,
      personaContacto: e.personaContacto,
      webUrl: e.webUrl,
      redes: e.redes,
      direccion: e.direccion,
      motivoRechazo: e.motivoRechazo as MotivoRechazoEmpresa | null,
      notaInterna: e.notaInterna,
      dueno: handle.get(e.ownerUserId) ?? null,
      creadaMs: e.createdAt.getTime(),
      verificadaMs: e.verificadaEn?.getTime() ?? null,
      verificadaPor: e.verificadaPor ? (handle.get(e.verificadaPor) ?? null) : null,
    })),
    proximoCursor:
      filas.length > limite
        ? codificarCursorTiempo({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}

/**
 * LA FICHA DE VERIFICACIÓN: una empresa, de una en una.
 *
 * LA IDENTIFICACIÓN FISCAL NO VIENE AQUÍ, solo si la HAY. Se pide aparte, y esa petición deja
 * rastro (`fiscalDeEmpresa`), igual que el correo de una cuenta en `/panel/usuarios`: en una marca
 * personal es el documento de una persona, así que no se pinta "de paso" al abrir una ficha —se
 * pide a propósito, y queda escrito quién lo miró—.
 */
export interface FichaEmpresa extends EmpresaPanel {
  /** Si hay identificación fiscal guardada. El VALOR se pide por su puerta (ver `fiscalDeEmpresa`). */
  tieneFiscal: boolean;
}

export async function fichaEmpresa(db: Db, empresaId: string): Promise<FichaEmpresa | null> {
  const e = await db.empresa.findUnique({
    where: { id: empresaId },
    select: {
      id: true,
      nombre: true,
      tipoCuenta: true,
      tipoNegocio: true,
      estado: true,
      paisIso: true,
      ciudadTexto: true,
      personaContacto: true,
      webUrl: true,
      redes: true,
      direccion: true,
      fiscalId: true,
      fiscalPaisIso: true,
      motivoRechazo: true,
      notaInterna: true,
      ownerUserId: true,
      verificadaPor: true,
      createdAt: true,
      verificadaEn: true,
    },
  });
  if (!e) return null;

  const ids = [e.ownerUserId, ...(e.verificadaPor ? [e.verificadaPor] : [])];
  const cuentas = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true },
  });
  const handle = new Map(cuentas.map((c) => [c.id, c.username]));

  return {
    id: e.id,
    nombre: e.nombre,
    tipoCuenta: e.tipoCuenta as TipoCuentaEmpresa,
    tipoNegocio: e.tipoNegocio as TipoNegocio,
    estado: e.estado as EstadoEmpresa,
    paisIso: e.paisIso,
    ciudadTexto: e.ciudadTexto,
    personaContacto: e.personaContacto,
    webUrl: e.webUrl,
    redes: e.redes,
    direccion: e.direccion,
    tieneFiscal: e.fiscalId !== null,
    motivoRechazo: e.motivoRechazo as MotivoRechazoEmpresa | null,
    notaInterna: e.notaInterna,
    dueno: handle.get(e.ownerUserId) ?? null,
    creadaMs: e.createdAt.getTime(),
    verificadaMs: e.verificadaEn?.getTime() ?? null,
    verificadaPor: e.verificadaPor ? (handle.get(e.verificadaPor) ?? null) : null,
  };
}

export type ResultadoFiscal =
  | { estado: "hecho"; fiscalId: string | null; fiscalPaisIso: string | null }
  | { estado: "rechazado"; motivo: "NO_ENCONTRADA" };

/**
 * LA IDENTIFICACIÓN FISCAL, CON RASTRO. Se lee y se anota en la MISMA transacción, y en ese orden:
 * si la anotación falla, la transacción revierte y nadie se lleva el dato. Un registro de accesos
 * que se pueda saltar cuando algo va mal no es un registro de accesos.
 *
 * Puede devolver `null` legítimamente (una empresa que no la dio: es opcional). Se anota igual —lo
 * que se registra es QUE SE MIRÓ, no qué había—, y el valor NO se copia al `AuditLog`: duplicar el
 * documento de una persona en la tabla de auditoría multiplicaría el problema que el registro
 * existe para vigilar.
 *
 * Es el MISMO trato que el correo de una cuenta en `/panel/usuarios`, y por el mismo motivo.
 */
export async function fiscalDeEmpresa(
  db: PrismaClient,
  entrada: { actorId: string; empresaId: string },
): Promise<ResultadoFiscal> {
  return db.$transaction(async (tx): Promise<ResultadoFiscal> => {
    const fila = await tx.empresa.findUnique({
      where: { id: entrada.empresaId },
      select: { fiscalId: true, fiscalPaisIso: true },
    });
    if (!fila) return { estado: "rechazado", motivo: "NO_ENCONTRADA" };

    await anotar(tx, {
      accion: "EMPRESA_FISCAL_VIEW",
      actorId: entrada.actorId,
      empresaId: entrada.empresaId,
    });
    return { estado: "hecho", fiscalId: fila.fiscalId, fiscalPaisIso: fila.fiscalPaisIso };
  });
}

// ---------------------------------------------------------------------------------------------------
// VERIFICAR / RECHAZAR — a mano, con rastro, y sin hacer daño al repetirse
// ---------------------------------------------------------------------------------------------------

export type ResultadoEmpresa =
  | { estado: "hecho" }
  /** Ya estaba así: no se escribe nada, ni rastro. Repetir un gesto no es un hecho nuevo. */
  | { estado: "sin_cambios" }
  | { estado: "rechazado"; motivo: "NO_ENCONTRADA" };

/** El rastro, siempre igual y siempre DENTRO de la transacción del cambio. */
async function anotar(
  tx: Db,
  entrada: {
    accion: AuditAccionEmpresa;
    actorId: string;
    empresaId: string;
    metadata?: Record<string, string>;
  },
): Promise<string> {
  const fila = await tx.auditLog.create({
    data: {
      actorId: entrada.actorId,
      action: entrada.accion,
      targetType: "EMPRESA",
      targetId: entrada.empresaId,
      metadata: entrada.metadata ?? {},
    },
    select: { id: true },
  });
  // Se devuelve el id porque es la clave natural de "ESTE cambio": el correo que avisa a la empresa
  // de una verificación o un rechazo se ata a él, así que una vuelta (rechazo → verificación) son
  // dos correos —dos hechos— y un reintento del mismo cambio es uno.
  return fila.id;
}

/**
 * LO QUE LE CONTAMOS A LA EMPRESA cuando decidimos. Existe porque el portal y el alta le PROMETEN
 * «te escribimos en cuanto esté», y verificar o rechazar no enviaba nada: otra pantalla diciendo
 * algo que no era verdad. Va en la MISMA transacción que el cambio de estado —el aviso sin el hecho,
 * o el hecho sin el aviso, son los dos huecos de siempre— y por la cola, con la clave atada a la fila
 * de `AuditLog` de ese cambio.
 *
 * EL MOTIVO SÍ, LA NOTA NO: el correo de rechazo lleva el motivo de la lista cerrada (es lo que ve en
 * su portal) y jamás la nota interna. Tampoco quién lo decidió.
 */
async function avisarDecision(
  tx: Db,
  entrada: {
    empresaId: string;
    decision: "VERIFICADA" | "RECHAZADA";
    motivo?: MotivoRechazoEmpresa;
    claveCambio: string;
    appUrl: string;
    ahora: Date;
    /** Créditos de publicidad que se le acaban de regalar como Socio Fundador (0 = ninguno). */
    regaloCreditos?: number;
  },
): Promise<void> {
  const e = await tx.empresa.findUnique({
    where: { id: entrada.empresaId },
    select: { nombre: true, user: { select: { email: true } } },
  });
  // Una cuenta sin correo (anonimizada) no tiene a quién avisar. No es un error de la decisión.
  if (!e?.user.email) return;

  const portal = new URL("/empresa", entrada.appUrl).toString();
  const verificada = entrada.decision === "VERIFICADA";
  const titulo = verificada ? "Tu empresa está verificada" : "No hemos podido verificar tu empresa";
  // EL REGALO SE CUENTA EN EL MISMO CORREO: se le prometió en el alta («las empresas que verifiquemos
  // antes de… se llevan N días de publicidad»), y este es el momento en que se cumple.
  const regalo = entrada.regaloCreditos
    ? ` Como Socio Fundador, te regalamos ${entrada.regaloCreditos} créditos de publicidad: cada uno es un día de anuncio.`
    : "";
  const cuerpo = verificada
    ? `Hemos revisado ${e.nombre} y está verificada. Ya puedes usar tu portal.${regalo}`
    : `Hemos revisado ${e.nombre} y no hemos podido verificarla. ${
        entrada.motivo ? MSG_MOTIVO_RECHAZO_EMPRESA[entrada.motivo] : ""
      }`.trim();
  const nota = verificada
    ? "Lo que se puede hacer desde el portal irá creciendo."
    : "Si crees que es un error, contesta a este correo y lo miramos otra vez.";

  await enqueueEmail(
    tx,
    {
      to: e.user.email,
      subject: titulo,
      text: [cuerpo, "", `Tu portal: ${portal}`, "", nota].join("\n"),
      html: renderCorreoHtml({
        preheader: cuerpo,
        titulo,
        intro: cuerpo,
        cta: { texto: "Ir a mi portal", href: portal },
        notas: [nota],
      }),
    },
    { idempotencyKey: `empresa-decision:${entrada.claveCambio}`, runAt: entrada.ahora },
  );
}

async function estadoActual(
  db: Db,
  empresaId: string,
): Promise<{
  estado: EstadoEmpresa;
  verificadaEn: Date | null;
  motivoRechazo: string | null;
  notaInterna: string | null;
} | null> {
  const e = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { estado: true, verificadaEn: true, motivoRechazo: true, notaInterna: true },
  });
  return e ? { ...e, estado: e.estado as EstadoEmpresa } : null;
}

/**
 * VERIFICAR. Vale también para revertir un rechazo o levantar una suspensión: es el mismo gesto —
 * "esta empresa es buena" — y queda con su fila de `AuditLog`.
 *
 * `verificadaEn` SE ESCRIBE UNA SOLA VEZ (si estaba a `null`). Es la fecha que decidirá el regalo de
 * Socio Fundador (P4), y nadie debería perderlo porque un rechazo se revirtiera meses después. El
 * historial de las vueltas está en `AuditLog`, que es donde corresponde.
 */
export async function verificarEmpresa(
  db: PrismaClient,
  /** `appUrl` es OBLIGATORIO: sin él no hay enlace al portal en el correo que avisa a la empresa. */
  entrada: { empresaId: string; actorId: string; appUrl: string; ahora?: Date },
): Promise<ResultadoEmpresa> {
  const actual = await estadoActual(db, entrada.empresaId);
  if (!actual) return { estado: "rechazado", motivo: "NO_ENCONTRADA" };
  // La MISMA regla que esconde el botón en la ficha (`puedeDecidirEmpresa`).
  if (!puedeDecidirEmpresa(actual.estado, "VERIFICAR")) return { estado: "sin_cambios" };

  const ahora = entrada.ahora ?? new Date();
  await db.$transaction(async (tx) => {
    await tx.empresa.update({
      where: { id: entrada.empresaId },
      data: {
        estado: "VERIFICADA",
        // Primera verificación: se sella. Las siguientes no la mueven (ver el docblock).
        ...(actual.verificadaEn === null ? { verificadaEn: ahora } : {}),
        verificadaPor: entrada.actorId,
        // El motivo del rechazo anterior se limpia: ya no describe nada y el dueño lo vería.
        motivoRechazo: null,
      },
    });
    const cambio = await anotar(tx, {
      accion: "EMPRESA_VERIFY",
      actorId: entrada.actorId,
      empresaId: entrada.empresaId,
      metadata: { de: actual.estado },
    });
    // EL REGALO DE SOCIO FUNDADOR, en ESTA transacción (Fase 9 · P4): o se verifica y se regala, o
    // ninguna de las dos. Se decide por la fecha SELLADA (la primera verificación), y su clave es la de
    // la empresa: rechazarla y volver a verificarla no lo cobra dos veces. La fila de la empresa ya
    // está bloqueada por el `update` de arriba; el primitivo la vuelve a pedir FOR UPDATE (es la misma
    // transacción) y no toca la fila del User.
    const { regalarSocioFundador } = await import("./creditos");
    const { regalado } = await regalarSocioFundador(tx, {
      empresaId: entrada.empresaId,
      verificadaEn: actual.verificadaEn ?? ahora,
    });
    // Lo prometido en su portal: «te escribimos en cuanto esté».
    await avisarDecision(tx, {
      empresaId: entrada.empresaId,
      decision: "VERIFICADA",
      claveCambio: cambio,
      appUrl: entrada.appUrl,
      ahora,
      regaloCreditos: regalado ? SOCIO_FUNDADOR_CREDITOS : 0,
    });
  });
  return { estado: "hecho" };
}

/**
 * RECHAZAR, con motivo de la lista cerrada (el dueño lo ve) y nota interna opcional (no lo ve).
 *
 * Rechazar lo ya rechazado no escribe nada, ni con otro motivo ni con otra nota (Fase 9 · P4): la
 * ficha no ofrece ese botón y el servidor aplica la MISMA regla (`puedeDecidirEmpresa`). Para cambiar
 * el motivo se verifica y se vuelve a rechazar: dos hechos, cada uno con su rastro en `AuditLog`.
 */
export async function rechazarEmpresa(
  db: PrismaClient,
  entrada: {
    empresaId: string;
    actorId: string;
    motivo: MotivoRechazoEmpresa;
    nota?: string | null;
    /** OBLIGATORIO: sin él no hay enlace al portal en el correo que avisa a la empresa. */
    appUrl: string;
  },
): Promise<ResultadoEmpresa> {
  const actual = await estadoActual(db, entrada.empresaId);
  if (!actual) return { estado: "rechazado", motivo: "NO_ENCONTRADA" };

  // La MISMA regla que esconde el botón en la ficha (`puedeDecidirEmpresa`): un botón nunca promete
  // un cambio que el servidor no va a hacer.
  if (!puedeDecidirEmpresa(actual.estado, "RECHAZAR")) return { estado: "sin_cambios" };

  const nota = entrada.nota?.trim().slice(0, EMPRESA_NOTA_MAX) || null;

  await db.$transaction(async (tx) => {
    await tx.empresa.update({
      where: { id: entrada.empresaId },
      data: {
        estado: "RECHAZADA",
        motivoRechazo: entrada.motivo,
        notaInterna: nota,
        verificadaPor: entrada.actorId,
      },
    });
    const cambio = await anotar(tx, {
      accion: "EMPRESA_REJECT",
      actorId: entrada.actorId,
      empresaId: entrada.empresaId,
      // El MOTIVO sí (es la decisión); la NOTA no: el rastro no es el sitio donde duplicar un texto
      // libre que ya vive en su columna, y así no hay dos copias que puedan discrepar.
      metadata: { motivo: entrada.motivo, de: actual.estado },
    });
    // Siempre se avisa: solo se llega aquí desde un estado que NO era rechazada, así que para la
    // empresa es una decisión nueva (re-rechazar ya no existe, ver arriba).
    await avisarDecision(tx, {
      empresaId: entrada.empresaId,
      decision: "RECHAZADA",
      motivo: entrada.motivo,
      claveCambio: cambio,
      appUrl: entrada.appUrl,
      ahora: new Date(),
    });
  });
  return { estado: "hecho" };
}
