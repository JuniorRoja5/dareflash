import { z } from "zod";

import {
  MSG_NO_DISPONIBLE,
  MSG_VOTO_AUTOVOTO,
  MSG_VOTO_RETO_CERRADO,
  MSG_VOTO_SIN_VER,
  MSG_VOTO_SIN_VOTO,
  MSG_VOTO_YA_VOTO_OTRA,
  RATE_LIMITS,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { apiError, apiOk, clientIpKey, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";
import type { MotivoRechazo, ResultadoVoto } from "@/server/services/votes";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta: un id absurdo -> 404 sin tocar la BD. */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * `permitirMover` es CONSENTIMIENTO EXPLÍCITO, no una comodidad: mover el voto se lo quita a otra
 * persona. Por defecto `false`, así que un cliente que no sepa nada de esto JAMÁS mueve un voto por
 * accidente. El cuerpo entero es opcional (un POST sin cuerpo = votar sin permiso para mover).
 */
const BodySchema = z.object({ permitirMover: z.boolean().optional() });

/**
 * Traduce el motivo del servicio a (código, copy humano, status). ÚNICO sitio donde se hace, para los
 * dos verbos: si cada uno escribiera el suyo, los textos divergirían y el 404 dejaría de ser el mismo.
 *
 * `SIN_PARTICIPACION` y `NO_PUBLICADA` colapsan en el MISMO 404, con el MISMO `code` y el MISMO texto.
 * No es cosmética: distinguirlos —aunque solo fuera en el `code`— convertiría la ruta en un oráculo
 * para enumerar participaciones ocultas o retiradas. El resto de la API usa el mismo criterio (404 y
 * no 403 ante un recurso ajeno).
 *
 * El status de los conflictos de estado es **409**: la petición es válida y está autorizada; lo que
 * pasa es que el estado actual no la admite. Un 400 diría "cliente mal escrito" y un 403 diría "no
 * eres quién", y ninguna de las dos es cierta cuando el reto simplemente se cerró.
 */
function rechazo(motivo: MotivoRechazo) {
  switch (motivo) {
    case "SIN_PARTICIPACION":
    case "NO_PUBLICADA":
      return apiError("NOT_FOUND", MSG_NO_DISPONIBLE, 404);
    case "AUTOVOTO":
      return apiError("AUTOVOTO", MSG_VOTO_AUTOVOTO, 409);
    case "RETO_CERRADO":
      return apiError("RETO_CERRADO", MSG_VOTO_RETO_CERRADO, 409);
    case "SIN_VOTO":
      return apiError("SIN_VOTO", MSG_VOTO_SIN_VOTO, 409);
    case "YA_VOTO_OTRA":
      // No debería llegar aquí (el POST lo intercepta antes para ofrecer mover), pero si un camino
      // futuro lo trae, se responde con la señal accionable y no con un error mudo.
      return requiereMover();
  }
}

/** Ni éxito ni error: "tienes el voto en otra, ¿lo muevo?". 200, porque hay una acción que ofrecer. */
function requiereMover() {
  return apiOk({ estado: "requiere-mover", mensaje: MSG_VOTO_YA_VOTO_OTRA });
}

/** El estado tipado del servicio se devuelve tal cual; la Pieza 3 decide qué pintar con él. */
function respuesta(r: ResultadoVoto) {
  return r.estado === "rechazado" ? rechazo(r.motivo) : apiOk({ ...r });
}

/**
 * Cubo por USUARIO (no por IP), COMPARTIDO por votar/mover/quitar: son la misma acción vista desde
 * fuera, y el límite se pondría de rodillas si cada verbo tuviera el suyo. Por usuario porque la sesión
 * ya está resuelta y es la identidad que de verdad importa aquí.
 */
async function limitar(prisma: PrismaClient, secret: string, userId: string) {
  const { rateLimit } = await import("@/server/security/rate-limit");
  const rl = await rateLimit(prisma, {
    key: `voto:user:${rateLimitKey(secret, userId)}`,
    ...RATE_LIMITS.VOTO_PER_USER,
  });
  return rl.allowed
    ? null
    : apiError("RATE_LIMITED", "Demasiadas peticiones. Inténtalo en un momento.", 429);
}

/**
 * POST /api/participaciones/[id]/voto — VOTAR esta participación, y opcionalmente MOVER aquí el voto
 * que ya se tuviera en otra del mismo reto.
 *
 * UN SOLO VIAJE, no dos: con `permitirMover: true` esta única petición deja al usuario con
 * exactamente un voto en el destino, tuviera ninguno o tuviera uno en otra participación. La
 * alternativa —que el cliente reciba "ya votaste otra", pregunte, y mande una segunda petición a un
 * endpoint distinto de "mover"— duplica el viaje y, sobre todo, duplica la lógica de decidir cuál de
 * las dos operaciones toca. Aquí eso lo decide el servidor, que es el único que sabe el estado real.
 *
 * SIN `permitirMover`, tener el voto en otra participación NO es un error: es un 200 con
 * `estado: "requiere-mover"`. Es información accionable —"pregúntale si quiere moverlo"—, y un 4xx
 * habría obligado a la Pieza 3 a leer códigos de error para distinguir "no puedes" de "confírmame".
 *
 * EL GATE DE "VISTO" VA PRIMERO: votar exige haber reproducido el vídeo (Pieza 2B). Es fricción
 * deliberada y spoofeable —el servidor no puede comprobar una reproducción—, y por eso se aplica aquí
 * y no se sobre-ingenieriza. Sin Redis el gate se abre solo y lo dice en el log: ver `services/visto`.
 *
 * `challengeId` NUNCA llega del cliente: lo deriva el servicio leyendo la Submission. Si viniera del
 * cuerpo, cualquiera podría votar N veces en un reto declarando uno falso y el UNIQUE de la BD no le
 * pararía. Igual con el dueño de la participación: el autovoto se corta contra la fila real.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { user, env, prisma }, { params }) => {
    const { emitirVoto, moverVoto } = await import("@/server/services/votes");
    const { haVisto, visibilidadParticipacion } = await import("@/server/services/visto");

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_NO_DISPONIBLE, 404);
    const submissionId = parsed.data.id;

    // Cuerpo OPCIONAL: sin cuerpo (o con uno ilegible) se vota SIN permiso para mover, que es el
    // comportamiento seguro. Solo se rechaza si el cuerpo existe y trae un `permitirMover` que no es
    // booleano: eso sí es un cliente roto, y tragárselo escondería el bug.
    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      /* sin cuerpo: se queda en {} */
    }
    const cuerpo = BodySchema.safeParse(body ?? {});
    if (!cuerpo.success) return apiError("VALIDATION", "Datos inválidos.", 400);
    const permitirMover = cuerpo.data.permitirMover === true;

    const limitado = await limitar(prisma, env.AUTH_SECRET, user.userId);
    if (limitado) return limitado;

    if (!(await haVisto({ userId: user.userId, submissionId }))) {
      // EL 404 TIENE PRECEDENCIA sobre el gate: decirle "reprodúcelo" a quien pide una participación
      // que no existe (o que está retirada) sería mentirle, y además dejaría el 404 inalcanzable por
      // esta ruta. La comprobación se hace SOLO en esta rama, así que el camino feliz no paga la
      // consulta extra: quien ha visto el vídeo ya demostró que existe.
      const v = await visibilidadParticipacion(prisma, submissionId);
      if (!v.visible) return rechazo(v.motivo);
      return apiError("SIN_VER", MSG_VOTO_SIN_VER, 409);
    }

    // IP HASHEADA (HMAC), nunca en claro, con el mismo helper que el rate-limit: es el mismo dominio
    // —identificar una IP sin guardarla— y una subclave distinta daría dos hashes de la misma IP
    // imposibles de cruzar, que es justo para lo que existe `Vote.ipHash`. La 2A la purga a los 90 días.
    const ipHash = clientIpKey(req, env.AUTH_SECRET);

    const r = await emitirVoto(prisma, { userId: user.userId, submissionId, ipHash });

    if (r.estado === "rechazado" && r.motivo === "YA_VOTO_OTRA") {
      if (!permitirMover) return requiereMover();
      // Mover es una operación ENTERA del servicio, con sus dos filas bloqueadas en orden y todo
      // revalidado dentro de la transacción. La ruta ORQUESTA, no reimplementa: si entre las dos
      // llamadas cambia algo (el reto se cierra, o el usuario mueve su voto desde otra pestaña),
      // `moverVoto` lo ve y responde en consecuencia. No hay estado que se pueda quedar a medias:
      // `emitirVoto` no escribió nada al rechazar, así que aquí no hay nada que deshacer.
      return respuesta(await moverVoto(prisma, { userId: user.userId, submissionId, ipHash }));
    }

    return respuesta(r);
  },
);

/**
 * DELETE /api/participaciones/[id]/voto — RETIRAR el voto de esta participación.
 *
 * NO pide "visto": el gate existe para que votar cueste abrir el vídeo, no para atrapar a nadie con un
 * voto puesto. Exigirlo para retirar sería una trampa (marca caducada -> no puedes deshacer).
 *
 * El id de la ruta NO es decorativo: el servicio exige que el voto esté EN ESA participación. Si no,
 * bastaría mandar cualquier id para borrar el voto que el usuario tenga puesto donde sea, y un id
 * equivocado en el cliente tendría ese efecto. Y solo con el reto ABIERTO: cerrado el plazo, los votos
 * son el resultado y no se retiran.
 */
export const DELETE = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { user, env, prisma }, { params }) => {
    const { quitarVoto } = await import("@/server/services/votes");

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", MSG_NO_DISPONIBLE, 404);

    const limitado = await limitar(prisma, env.AUTH_SECRET, user.userId);
    if (limitado) return limitado;

    return respuesta(
      await quitarVoto(prisma, { userId: user.userId, submissionId: parsed.data.id }),
    );
  },
);
