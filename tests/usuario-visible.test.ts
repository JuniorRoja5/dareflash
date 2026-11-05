/**
 * UNA CUENTA DE EMPRESA NO APARECE COMO PARTICIPANTE EN NINGÚN SITIO PÚBLICO (Fase 9, P2).
 *
 * La regla vive en UN sitio, `USUARIO_VISIBLE` (y su forma SQL, `usuarioVisibleSql`), como
 * `VIDEO_VISIBLE` para los vídeos. Aquí se fijan tres cosas:
 *
 *  1. EL CENSO. Cada función de `src/` que consulta `User` —por Prisma o por SQL a pelo— está
 *     clasificada: PÚBLICA (resuelve o lista personas a la vista de otros, y entonces usa la regla) o
 *     PRIVADA (la propia sesión, el panel, la autenticación, un proceso interno), con su porqué. Una
 *     consulta nueva sin clasificar es rojo; una pública sin la regla, también.
 *  2. LAS DOS FORMAS DICEN LO MISMO: Prisma y SQL, ejecutadas contra la misma base, devuelven las
 *     mismas filas.
 *  3. EL COMPORTAMIENTO, contra la base real: /u/<handle> de una empresa da el MISMO 404 que un handle
 *     inexistente; no sale en el buscador (sí en el del panel), ni en el ranking, ni en la vitrina,
 *     ni su código de invitación resuelve.
 *
 * Lo que NO entra en el censo, y por qué: las consultas de CONTENIDO que traen al autor como relación
 * (participaciones, comentarios, el top de un reto). Ahí manda la regla del contenido —`VIDEO_VISIBLE`
 * reutiliza `USUARIO_VISIBLE` para el autor— y, sobre todo, una empresa no puede tener contenido:
 * `mutatingRoute` le cierra subir, participar y comentar (ver `empresa-no-participa`). El top de un reto
 * cerrado, además, no se filtra a propósito: su orden es el del cierre que repartió los premios.
 *
 * Para romperlo a propósito: quitar `...USUARIO_VISIBLE` de `cargarPerfil` (rojo el censo y el 404);
 * volver a escribir `bannedAt IS NULL` a mano en el buscador (rojo el censo y el del buscador); añadir
 * una función que lea `User` sin clasificarla (rojo el censo); cambiar `esCuentaEmpresa = 0` por `= 1`
 * en la forma SQL (rojo la equivalencia).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma, type PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({ env: {} }));

const { USUARIO_VISIBLE, usuarioVisibleSql } =
  await import("../src/server/services/usuario-visible");
const { perfilPublicoPorUsername } = await import("../src/server/services/perfil");
const { buscarUsuarios, buscarCuentas } = await import("../src/server/services/buscar");
const { rankingMensual } = await import("../src/server/services/ranking");
const { destacadosVigentes } = await import("../src/server/services/boost-destacados");
const { referentePorCodigo } = await import("../src/server/services/referidos");
const { GET: videosDePerfil } = await import("../src/app/api/perfiles/[username]/videos/route");

// ---------------------------------------------------------------------------------------------------
// 1. El censo
// ---------------------------------------------------------------------------------------------------

const RAIZ = path.resolve(__dirname, "..");
const soloCodigo = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" ? [] : fuentes(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** Una consulta a `User`: por el cliente (`db.user.findMany(`…) o por SQL a pelo (FROM/JOIN `User`). */
const CONSULTA_USER =
  /\.user\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow|count|groupBy|aggregate)\(|(?:FROM|JOIN)\s+\\`User\\`/g;
/** Dónde empieza cada función: la consulta se atribuye a la última que empezó antes que ella. */
const INICIO_FUNCION = /^(?:export )?(?:default )?(?:async )?function (\w+)/gm;

/** `fichero#función` de cada consulta a `User` de `src/`. */
function censo(): Map<string, string> {
  const unidades = new Map<string, string>();
  for (const f of fuentes(path.join(RAIZ, "src"))) {
    const codigo = soloCodigo(readFileSync(f, "utf8"));
    const consultas = [...codigo.matchAll(CONSULTA_USER)];
    if (consultas.length === 0) continue;
    const inicios = [...codigo.matchAll(INICIO_FUNCION)].map((m) => ({ n: m[1]!, i: m.index! }));
    const rel = path.relative(RAIZ, f).split(path.sep).join("/");
    for (const c of consultas) {
      const fn = inicios.filter((x) => x.i < c.index!).at(-1);
      const clave = `${rel}#${fn?.n ?? "<módulo>"}`;
      // El cuerpo: desde su inicio hasta el de la siguiente función.
      const desde = fn?.i ?? 0;
      const hasta = inicios.find((x) => x.i > desde)?.i ?? codigo.length;
      unidades.set(clave, codigo.slice(desde, hasta));
    }
  }
  return unidades;
}

/** PÚBLICAS: resuelven o listan personas a la vista de otros. Tienen que usar la regla. */
const PUBLICAS: Record<string, string> = {
  "src/server/services/perfil.ts#cargarPerfil": "/u/<handle> (por handle y por id)",
  "src/app/api/perfiles/[username]/videos/route.ts#GET": "la rejilla de vídeos de un perfil",
  "src/server/services/buscar.ts#filasDeUsuarios": "el buscador (en modo público)",
  "src/server/services/ranking.ts#rankingMensual": "el ranking del mes (y el Top de la portada)",
  "src/server/services/boost-destacados.ts#destacadosVigentes": "la vitrina de destacados",
  "src/server/services/toque.ts#darToque": "a quién se le puede dar un toque",
  "src/server/services/referidos.ts#referentePorCodigo": "el código de un enlace de invitación",
  "src/server/services/referidos.ts#premiarReferido": "quién cobra una invitación",
  // La audiencia de un anuncio: las tres leen el MISMO `audiencia()`, que es `USUARIO_VISIBLE`.
  "src/server/services/anuncios.ts#tamanoAudiencia": "audiencia de anuncios (número previo)",
  "src/server/services/anuncios.ts#enviarAnuncio": "audiencia de anuncios (foto del envío)",
  "src/server/services/anuncios.ts#repartirAnuncio": "audiencia de anuncios (reparto)",
};

/** Las que satisfacen la regla a través de un ayudante que la contiene (y se comprueba que la contiene). */
const VIA_AYUDANTE: Record<string, { usa: string; ayudante: string }> = {
  "src/server/services/anuncios.ts#tamanoAudiencia": { usa: "audiencia(", ayudante: "audiencia" },
  "src/server/services/anuncios.ts#enviarAnuncio": { usa: "audiencia(", ayudante: "audiencia" },
  "src/server/services/anuncios.ts#repartirAnuncio": { usa: "audiencia(", ayudante: "audiencia" },
};

/** PRIVADAS: la propia sesión, el panel, la autenticación o un proceso interno. Con su porqué. */
const PRIVADAS: Record<string, string> = {
  "src/app/(app)/(shell)/boosts/page.tsx#BoostsPage": "la propia sesión",
  "src/app/(app)/(shell)/empresa/cuenta/page.tsx#CuentaEmpresaPage": "la propia sesión",
  "src/app/(app)/(shell)/layout.tsx#ShellLayout": "la propia sesión (cromo)",
  "src/app/(app)/(shell)/perfil/editar/page.tsx#EditarPerfilPage": "la propia sesión",
  "src/app/(app)/(shell)/puntos/page.tsx#PuntosPage": "la propia sesión",
  "src/app/(app)/(shell)/referidos/page.tsx#ReferidosPage": "la propia sesión",
  "src/app/(app)/(shell)/retos/[codigo]/page.tsx#RetoDetallePage": "los puntos de la propia sesión",
  "src/app/(app)/(shell)/wallet/page.tsx#WalletPage": "la propia sesión",
  "src/app/api/auth/change-password/route.ts#<módulo>": "autenticación",
  "src/app/api/auth/forgot-password/route.ts#POST": "autenticación",
  "src/app/api/auth/resend-verification/route.ts#POST": "autenticación",
  "src/app/api/perfil/email/route.ts#<módulo>": "la propia sesión",
  "src/app/panel/layout.tsx#PanelLayout": "panel",
  "src/server/auth/account-unlock.ts#requestAccountUnlockEmail": "autenticación",
  "src/server/auth/login.ts#login": "autenticación",
  "src/server/auth/password-reset.ts#resetPassword": "autenticación",
  "src/server/auth/session.ts#createSession": "autenticación",
  "src/server/services/anuncios.ts#listarAnuncios": "panel",
  "src/server/services/anuncios.ts#inspeccionarNotificaciones": "panel",
  "src/server/services/aviso-cuenta-existente.ts#avisarCuentaExistente": "alta (sin enumeración)",
  "src/server/services/boost-admin.ts#fichaBoost": "panel",
  "src/server/services/boost-admin.ts#destacadosPanel": "panel",
  "src/server/services/cambio-email.ts#solicitarCambioEmail": "la propia sesión",
  "src/server/services/cambio-email.ts#confirmarCambioEmail": "la propia cuenta (token)",
  "src/server/services/comentarios.ts#publicarComentario": "la propia sesión (autor)",
  "src/server/services/cuentas-panel.ts#listarCuentas": "panel",
  "src/server/services/cuentas-panel.ts#fichaCuenta": "panel",
  "src/server/services/cuentas-panel.ts#emailDeCuenta": "panel",
  "src/server/services/dareup-admin.ts#fichaDareUp": "panel",
  "src/server/services/dareup-admin.ts#historialPuntos": "panel",
  "src/server/services/email-verification.ts#confirmEmailVerification": "la propia cuenta (token)",
  "src/server/services/empresas.ts#listarEmpresas": "panel",
  "src/server/services/empresas.ts#fichaEmpresa": "panel",
  "src/server/services/gobierno-cuentas.ts#cuentaDestino": "panel",
  "src/server/services/ledger.ts#applyLedgerCore": "interno (cerrojo del saldo)",
  "src/server/services/monedero-admin.ts#listarAjustesMonedero": "panel",
  "src/server/services/monedero-admin.ts#fichaMonedero": "panel",
  "src/server/services/monedero-export.ts#exportarRetiradas": "panel",
  "src/server/services/monedero-export.ts#exportarAjustes": "panel",
  "src/server/services/ocultado-automatico.ts#repartirAvisoAutoOculto": "interno (al equipo)",
  "src/server/services/panel-metricas.ts#metricasPanel": "panel",
  "src/server/services/panel-metricas.ts#metricasDinero": "panel",
  "src/server/services/participacion.ts#motivoDeBloqueoDelReto": "la propia sesión",
  "src/server/services/patrocinios.ts#exportarGanadores": "panel",
  "src/server/services/perfil.ts#miPerfil": "la propia sesión",
  "src/server/services/racha.ts#leerRacha": "la propia sesión",
  "src/server/services/recalculo-scores.ts#barridoUsuarios": "interno (job)",
  "src/server/services/referidos.ts#misReferidos": "la propia sesión",
  "src/server/services/referidos.ts#resumenReferidos": "la propia sesión",
  "src/server/services/retirada-admin.ts#listarRetiradas": "panel",
  "src/server/services/retirada.ts#solicitarRetirada": "la propia sesión",
};

const REGLA = /USUARIO_VISIBLE|usuarioVisibleSql\(/;

describe("el censo de las consultas a User", () => {
  const unidades = censo();

  it("toda consulta a User está clasificada (y ninguna clasificada ha desaparecido)", () => {
    const clasificadas = [...Object.keys(PUBLICAS), ...Object.keys(PRIVADAS)].sort();
    expect([...unidades.keys()].sort()).toEqual(clasificadas);
  });

  it("ninguna es pública y privada a la vez", () => {
    expect(Object.keys(PUBLICAS).filter((k) => k in PRIVADAS)).toEqual([]);
  });

  it("cada pública usa la regla única, directamente o por su ayudante", () => {
    for (const clave of Object.keys(PUBLICAS)) {
      const cuerpo = unidades.get(clave) ?? "";
      const via = VIA_AYUDANTE[clave];
      if (via) {
        expect(cuerpo, clave).toContain(via.usa);
        const fichero = clave.split("#")[0]!;
        const ayudante = censoDe(fichero, via.ayudante);
        expect(ayudante, `${fichero}#${via.ayudante}`).toMatch(REGLA);
      } else {
        expect(cuerpo, clave).toMatch(REGLA);
      }
    }
  });

  it("nadie vuelve a escribir la regla a mano en una pública (forma Prisma)", () => {
    // Solo la forma Prisma: en el buscador, `bannedAt IS NULL` es el filtro «activa» del PANEL, que
    // vive en la misma función. Que el modo público no la escriba a mano lo prueba el comportamiento.
    for (const clave of Object.keys(PUBLICAS)) {
      const cuerpo = unidades.get(clave) ?? "";
      expect(cuerpo, clave).not.toMatch(/bannedAt:\s*null/);
    }
  });

  it("VIDEO_VISIBLE reutiliza la regla para el autor", () => {
    const src = soloCodigo(
      readFileSync(path.join(RAIZ, "src/server/services/video-visible.ts"), "utf8"),
    );
    expect(src).toMatch(/user: USUARIO_VISIBLE,/);
  });
});

/** El cuerpo de una función concreta de un fichero (sin comentarios). */
function censoDe(fichero: string, funcion: string): string {
  const codigo = soloCodigo(readFileSync(path.join(RAIZ, fichero), "utf8"));
  const inicios = [...codigo.matchAll(INICIO_FUNCION)].map((m) => ({ n: m[1]!, i: m.index! }));
  const yo = inicios.find((x) => x.n === funcion);
  if (!yo) return "";
  const siguiente = inicios.find((x) => x.i > yo.i)?.i ?? codigo.length;
  return codigo.slice(yo.i, siguiente);
}

// ---------------------------------------------------------------------------------------------------
// 2 y 3. Contra la base real
// ---------------------------------------------------------------------------------------------------

let prisma: PrismaClient;
beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

/** Una de cada: visible, borrada, baneada y de empresa. */
async function cuatro() {
  const visible = await crearUsuario(prisma, { username: "lucia_visible", displayName: "Lucía" });
  const borrada = await crearUsuario(prisma, { username: "lucia_borrada", displayName: "Lucía B" });
  const baneada = await crearUsuario(prisma, { username: "lucia_baneada", displayName: "Lucía C" });
  const empresa = await crearUsuario(prisma, { username: "lucia_empresa", displayName: "Lucía D" });
  await prisma.user.update({ where: { id: borrada }, data: { deletedAt: new Date() } });
  await prisma.user.update({ where: { id: baneada }, data: { bannedAt: new Date() } });
  await prisma.user.update({ where: { id: empresa }, data: { esCuentaEmpresa: true } });
  return { visible, borrada, baneada, empresa };
}

describe("las dos formas de la regla dicen lo mismo", () => {
  it("Prisma y SQL (sin alias y con alias) devuelven exactamente las mismas filas", async () => {
    const { visible } = await cuatro();
    const porPrisma = (await prisma.user.findMany({ where: USUARIO_VISIBLE, select: { id: true } }))
      .map((u) => u.id)
      .sort();
    const sinAlias = (
      await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM \`User\` WHERE ${usuarioVisibleSql()}`,
      )
    )
      .map((u) => u.id)
      .sort();
    const conAlias = (
      await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT u.id FROM \`User\` u WHERE ${usuarioVisibleSql("u")}`,
      )
    )
      .map((u) => u.id)
      .sort();
    expect(porPrisma).toEqual([visible]);
    expect(sinAlias).toEqual(porPrisma);
    expect(conAlias).toEqual(porPrisma);
  });

  it("un alias que no es un identificador no llega a ser SQL", () => {
    expect(() => usuarioVisibleSql("u; DROP TABLE User")).toThrow();
  });
});

describe("una empresa no aparece como participante", () => {
  it("/u/<handle>: null, igual que un handle que no existe (la página da el mismo 404)", async () => {
    await cuatro();
    expect(await perfilPublicoPorUsername(prisma, "lucia_visible")).not.toBeNull();
    expect(await perfilPublicoPorUsername(prisma, "lucia_empresa")).toBeNull();
    expect(await perfilPublicoPorUsername(prisma, "no_existe_nadie")).toBeNull();
  });

  it("su rejilla de vídeos: la MISMA respuesta que la de un handle inexistente", async () => {
    await cuatro();
    const pedir = async (username: string) => {
      const r = await videosDePerfil(
        new Request(`https://x.test/api/perfiles/${username}/videos`),
        {
          params: Promise.resolve({ username }),
        },
      );
      return { status: r.status, cuerpo: await r.json() };
    };
    const empresa = await pedir("lucia_empresa");
    expect(empresa.status).toBe(404);
    expect(empresa).toEqual(await pedir("no_existe_nadie"));
  });

  it("el buscador público no la encuentra; el del panel, sí (es gobierno de cuentas)", async () => {
    const { visible, empresa } = await cuatro();
    const publico = (await buscarUsuarios(prisma, "lucia", null)).items.map((u) => u.id);
    expect(publico).toEqual([visible]);
    const panel = (await buscarCuentas(prisma, "lucia", null)).items.map((u) => u.id);
    expect(panel).toContain(empresa);
  });

  it("el ranking del mes no la enseña", async () => {
    const { visible, empresa } = await cuatro();
    await prisma.rankingMensual.createMany({
      data: [
        { periodo: "2026-11", userId: visible, victorias: 1 },
        { periodo: "2026-11", userId: empresa, victorias: 2 },
      ],
    });
    const { filas } = await rankingMensual(prisma, { periodo: "2026-11" });
    expect(filas.map((f) => f.userId)).toEqual([visible]);
  });

  it("la vitrina de destacados no la enseña", async () => {
    const { visible, empresa } = await cuatro();
    const ahora = new Date();
    for (const userId of [visible, empresa]) {
      await prisma.boostActivation.create({
        data: {
          userId,
          startsAt: new Date(ahora.getTime() - 60_000),
          expiresAt: new Date(ahora.getTime() + 3_600_000),
        },
      });
    }
    expect((await destacadosVigentes(prisma, { ahora })).map((p) => p.userId)).toEqual([visible]);
  });

  it("su código de invitación no resuelve: invitar a participar no es algo que pueda cobrar", async () => {
    const { visible, empresa } = await cuatro();
    const codigo = async (id: string) =>
      (await prisma.user.findUniqueOrThrow({ where: { id }, select: { referralCode: true } }))
        .referralCode;
    expect(await referentePorCodigo(prisma, await codigo(visible))).toBe(visible);
    expect(await referentePorCodigo(prisma, await codigo(empresa))).toBeNull();
  });
});
