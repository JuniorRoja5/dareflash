/**
 * EL FICHERO DE IP Y LA UBICACIÓN DE QUIEN MIRA (Fase 9 · P5).
 *
 * DIENTE DEL PLAN: sin fichero de IP se resuelve «desconocido» y NADA LANZA — ni el lector, ni la
 * resolución, ni guardar la ubicación en la sesión. La geolocalización mejora la publicidad; no puede
 * tumbar un login ni el feed.
 *
 * La lectura de un MMDB de verdad se prueba a mano con el fichero real (scripts/actualizar-geoip.sh y su
 * comprobación): un fichero de 127 MB no entra en el repositorio. Aquí se prueba todo lo que lo rodea
 * con un lector inyectado.
 *
 * Para romperlo a propósito: quitar el `try` de `buscar` (rojo el de fichero roto); que la ubicación de
 * un invitado desconocido se memoice (rojo); que `ubicarSesion` sobrescriba una ubicación ya guardada
 * (rojo); que `resolverUbicacion` no capture un fallo de la BD (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { UBICACION_DESCONOCIDA } from "../src/lib/geo";
import { type LectorIp, crearLectorIp, nombreSinBarrio } from "../src/server/geo/lector-ip";
import {
  type RedisMemo,
  resolverUbicacion,
  ubicacionDeInvitado,
  ubicarSesion,
} from "../src/server/geo/ubicacion";
import { createSession } from "../src/server/auth/session";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

const VALENCIA = 2509954;

/** Un lector de mentira que responde lo que se le diga por IP. */
function lectorFalso(
  tabla: Record<
    string,
    {
      paisIso: string;
      latitud: number | null;
      longitud: number | null;
      ciudadNombre?: string | null;
    }
  >,
): LectorIp & { llamadas: number } {
  const l = {
    llamadas: 0,
    buscar(ip: string) {
      l.llamadas += 1;
      return tabla[ip] ?? null;
    },
    async listo() {},
  };
  return l;
}

describe("el lector, sin fichero o con uno roto", () => {
  it("sin fichero: null, sin lanzar", async () => {
    const l = crearLectorIp({ ruta: "/no/existe/dbip.mmdb" });
    await l.listo();
    expect(l.buscar("8.8.8.8")).toBeNull();
  });

  it("con un fichero que no es un MMDB: null, sin lanzar", async () => {
    const l = crearLectorIp({
      ruta: "/x.mmdb",
      fechaFichero: async () => 1,
      leerFichero: async () => Buffer.from("<html>Error 404</html>"),
    });
    await l.listo();
    expect(() => l.buscar("8.8.8.8")).not.toThrow();
    expect(l.buscar("8.8.8.8")).toBeNull();
  });

  it("si leer el fichero revienta: null, sin lanzar", async () => {
    const l = crearLectorIp({
      ruta: "/x.mmdb",
      fechaFichero: async () => 1,
      leerFichero: async () => {
        throw new Error("EIO");
      },
    });
    await l.listo();
    expect(l.buscar("8.8.8.8")).toBeNull();
  });

  it("una IP mal formada o vacía: null", async () => {
    const l = crearLectorIp({ ruta: "/no/existe.mmdb" });
    for (const ip of ["", "no-es-una-ip", "missing-x-real-ip", "999.1.1.1"]) {
      expect(l.buscar(ip), ip).toBeNull();
    }
  });

  it("mira el disco como mucho una vez por minuto", async () => {
    let t = 0;
    let revisiones = 0;
    const l = crearLectorIp({
      ruta: "/x.mmdb",
      ahora: () => t,
      fechaFichero: async () => {
        revisiones += 1;
        return null;
      },
    });
    await l.listo();
    l.buscar("8.8.8.8");
    l.buscar("8.8.8.8");
    await l.listo();
    expect(revisiones).toBe(1);
    t = 61_000;
    await l.listo();
    expect(revisiones).toBe(2);
  });
});

describe("resolver una IP a una ubicación", () => {
  it("coordenadas cerca de Valencia: Valencia, su estado y su país", async () => {
    const l = lectorFalso({ "1.2.3.4": { paisIso: "ES", latitud: 39.47, longitud: -0.38 } });
    expect(await resolverUbicacion(prisma, "1.2.3.4", l)).toEqual({
      paisIso: "ES",
      estadoCodigo: "ES.60",
      ciudadId: VALENCIA,
    });
  });

  it("sin coordenadas, o en mitad de la nada: el país y nada más (no se inventa una ciudad)", async () => {
    const l = lectorFalso({
      "1.1.1.1": { paisIso: "ES", latitud: null, longitud: null },
      // Mar Mediterráneo, a más de GEOIP_CIUDAD_MAX_KM de cualquier ciudad española del catálogo.
      "2.2.2.2": { paisIso: "ES", latitud: 38.6, longitud: 3.6 },
    });
    expect(await resolverUbicacion(prisma, "1.1.1.1", l)).toEqual({
      paisIso: "ES",
      estadoCodigo: null,
      ciudadId: null,
    });
    expect(await resolverUbicacion(prisma, "2.2.2.2", l)).toEqual({
      paisIso: "ES",
      estadoCodigo: null,
      ciudadId: null,
    });
  });

  it("solo casa ciudades DEL MISMO PAÍS: un punto en la frontera no salta de país", async () => {
    // Junto a Badajoz (ES), pero la IP dice Portugal: la ciudad tiene que ser portuguesa o ninguna.
    const l = lectorFalso({ "3.3.3.3": { paisIso: "PT", latitud: 38.88, longitud: -6.97 } });
    const u = await resolverUbicacion(prisma, "3.3.3.3", l);
    expect(u.paisIso).toBe("PT");
    if (u.ciudadId !== null) {
      const c = await prisma.ciudad.findUnique({ where: { id: u.ciudadId } });
      expect(c?.paisIso).toBe("PT");
    }
  });

  it("prefiere la ciudad que se llama como dice el fichero frente al distrito más cercano", async () => {
    // Coordenadas de una IP madrileña real (DB-IP): caen más cerca de «Chamartín» —un distrito que
    // GeoNames lista aparte— que del centro de Madrid. Con el nombre, Madrid; sin él, el distrito.
    const punto = { paisIso: "ES", latitud: 40.4478, longitud: -3.69413 };
    const conNombre = await resolverUbicacion(
      prisma,
      "4.4.4.4",
      lectorFalso({ "4.4.4.4": { ...punto, ciudadNombre: "Madrid" } }),
    );
    const sinNombre = await resolverUbicacion(prisma, "4.4.4.4", lectorFalso({ "4.4.4.4": punto }));
    expect(conNombre.ciudadId).toBe(3117735); // Madrid
    expect(sinNombre.ciudadId).toBe(3125239); // Chamartín
    // Un exónimo que no está en el catálogo («Seville») no rompe nada: se queda la más cercana.
    const exonimo = await resolverUbicacion(
      prisma,
      "4.4.4.4",
      lectorFalso({ "4.4.4.4": { ...punto, ciudadNombre: "Seville" } }),
    );
    expect(exonimo.ciudadId).toBe(3125239);
  });

  it("el nombre de DB-IP, sin el barrio entre paréntesis y sin acentos que estorben", () => {
    expect(nombreSinBarrio("Medellín (La Aguacatala)")).toBe("Medellín");
    expect(nombreSinBarrio("Berkeley (North Berkeley)")).toBe("Berkeley");
    expect(nombreSinBarrio("Madrid")).toBe("Madrid");
    expect(nombreSinBarrio("  ")).toBeNull();
    expect(nombreSinBarrio(undefined)).toBeNull();
  });

  it("IP desconocida: desconocido", async () => {
    expect(await resolverUbicacion(prisma, "9.9.9.9", lectorFalso({}))).toEqual(
      UBICACION_DESCONOCIDA,
    );
  });

  it("si la base de datos falla: desconocido, sin lanzar", async () => {
    const l = lectorFalso({ "1.2.3.4": { paisIso: "ES", latitud: 39.47, longitud: -0.38 } });
    const rota = {
      ciudad: {
        findMany: async () => {
          throw new Error("BD caída");
        },
      },
    } as unknown as PrismaClient;
    expect(await resolverUbicacion(rota, "1.2.3.4", l)).toEqual(UBICACION_DESCONOCIDA);
  });
});

describe("la ubicación de la sesión", () => {
  it("se guarda una vez, y la sesión la trae al validarse", async () => {
    const userId = await crearUsuario(prisma);
    const s = await createSession(prisma, userId);
    const l = lectorFalso({ "1.2.3.4": { paisIso: "ES", latitud: 39.47, longitud: -0.38 } });
    await ubicarSesion(prisma, s.sessionId, "1.2.3.4", l);
    const fila = await prisma.session.findUnique({ where: { id: s.sessionId } });
    expect(fila).toMatchObject({ geoPais: "ES", geoEstado: "ES.60", geoCiudadId: VALENCIA });

    const { validateSession } = await import("../src/server/auth/session");
    const u = await validateSession(prisma, s.rawToken);
    expect(u?.ubicacion).toEqual({ paisIso: "ES", estadoCodigo: "ES.60", ciudadId: VALENCIA });
  });

  it("no sobrescribe una ubicación ya guardada (una vez por sesión)", async () => {
    const userId = await crearUsuario(prisma);
    const s = await createSession(prisma, userId);
    await ubicarSesion(
      prisma,
      s.sessionId,
      "1.2.3.4",
      lectorFalso({ "1.2.3.4": { paisIso: "ES", latitud: 39.47, longitud: -0.38 } }),
    );
    await ubicarSesion(
      prisma,
      s.sessionId,
      "5.5.5.5",
      lectorFalso({ "5.5.5.5": { paisIso: "CO", latitud: 6.25, longitud: -75.57 } }),
    );
    expect((await prisma.session.findUnique({ where: { id: s.sessionId } }))?.geoPais).toBe("ES");
  });

  it("sin fichero no escribe nada y no lanza", async () => {
    const userId = await crearUsuario(prisma);
    const s = await createSession(prisma, userId);
    await expect(
      ubicarSesion(prisma, s.sessionId, "8.8.8.8", crearLectorIp({ ruta: "/no/existe.mmdb" })),
    ).resolves.toBeUndefined();
    expect((await prisma.session.findUnique({ where: { id: s.sessionId } }))?.geoPais).toBeNull();
  });
});

describe("la ubicación de un invitado, memoizada por IP hasheada", () => {
  function redisFalso(): RedisMemo & { datos: Map<string, string> } {
    const datos = new Map<string, string>();
    return {
      datos,
      async get(k) {
        return datos.get(k) ?? null;
      },
      async set(k, v) {
        datos.set(k, v);
        return "OK";
      },
    };
  }

  it("se resuelve una vez y la segunda sale del memo; la clave es el hash, nunca la IP", async () => {
    const l = lectorFalso({ "1.2.3.4": { paisIso: "ES", latitud: 39.47, longitud: -0.38 } });
    const redis = redisFalso();
    const a = await ubicacionDeInvitado(
      prisma,
      { ip: "1.2.3.4", ipHash: "h1" },
      { lector: l, redis },
    );
    const b = await ubicacionDeInvitado(
      prisma,
      { ip: "1.2.3.4", ipHash: "h1" },
      { lector: l, redis },
    );
    expect(a).toEqual(b);
    expect(l.llamadas).toBe(1);
    expect([...redis.datos.keys()]).toEqual(["geo:ip:h1"]);
    expect([...redis.datos.keys()].join()).not.toContain("1.2.3.4");
  });

  it("«desconocido» NO se memoiza (suele ser que el fichero aún carga)", async () => {
    const l = lectorFalso({});
    const redis = redisFalso();
    await ubicacionDeInvitado(prisma, { ip: "9.9.9.9", ipHash: "h2" }, { lector: l, redis });
    await ubicacionDeInvitado(prisma, { ip: "9.9.9.9", ipHash: "h2" }, { lector: l, redis });
    expect(l.llamadas).toBe(2);
    expect(redis.datos.size).toBe(0);
  });

  it("con Redis caído se resuelve igual, sin lanzar", async () => {
    const l = lectorFalso({ "1.2.3.4": { paisIso: "ES", latitud: 39.47, longitud: -0.38 } });
    const caido: RedisMemo = {
      get: async () => {
        throw new Error("ECONNREFUSED");
      },
      set: async () => {
        throw new Error("ECONNREFUSED");
      },
    };
    const u = await ubicacionDeInvitado(
      prisma,
      { ip: "1.2.3.4", ipHash: "h3" },
      { lector: l, redis: caido },
    );
    expect(u.ciudadId).toBe(VALENCIA);
  });
});
