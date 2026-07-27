/**
 * Utilidades compartidas de la API: forma unica de error, IP de cliente (para
 * rate-limit) y comprobacion de Origin. Convencion de error: `{ error: { code, message } }`.
 * Nunca stack traces, SQL ni detalles internos al cliente.
 */
import { createHmac } from "node:crypto";

import { NextResponse } from "next/server";

import { deriveKey } from "@/server/auth/keys";

export function apiError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function apiOk<T extends Record<string, unknown>>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

/**
 * Normaliza una IP para agrupar el rate-limit:
 *  - IPv4: tal cual.
 *  - IPv6: truncada al prefijo /64. A un usuario domestico se le asigna un /64
 *    entero (2^64 direcciones); sin truncar, cada peticion podria usar una IP
 *    distinta y el rate-limit por IP no existiria para quien tenga IPv6.
 */
export function normalizeIp(ip: string): string {
  if (!ip.includes(":")) return ip; // IPv4
  // IPv6: quedarnos con los primeros 4 hextetos (/64). Expandir "::" primero.
  const zoneless = ip.split("%")[0] ?? ip;
  const parts = zoneless.split("::");
  let head: string[];
  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    head = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  } else {
    head = zoneless.split(":");
  }
  return head.slice(0, 4).join(":") + "::/64";
}

/**
 * IP real del cliente. SOLO se lee `X-Real-IP`, que fija Caddy con
 * `header_up X-Real-IP {remote_host}` (Set = reemplaza lo del cliente); `web` no
 * expone puerto, asi que nadie se salta a Caddy para falsificarla. NO se lee
 * `X-Forwarded-For` a ciegas.
 *
 * Si falta la cabecera (en produccion NO deberia: todo pasa por Caddy), se registra
 * como ANOMALIA DE INFRAESTRUCTURA en vez de fundir todo en un cubo silencioso.
 */
export function clientIp(req: Request): string {
  const raw = req.headers.get("x-real-ip")?.trim();
  if (!raw) {
    console.warn("[api] ANOMALIA: falta X-Real-IP (revisar Caddy/infra). Rate-limit degradado.");
    return "missing-x-real-ip";
  }
  return normalizeIp(raw);
}

/** Clave de rate-limit por IP: HMAC con subclave de dominio (no SHA-256 pelado; la IP
 *  en claro nunca se guarda). */
export function clientIpKey(req: Request, secret: string): string {
  return createHmac("sha256", deriveKey(secret, "ip.v1")).update(clientIp(req)).digest("hex");
}

/** Clave de rate-limit generica (p.ej. por cuenta): HMAC con subclave ratelimit.v1. */
export function rateLimitKey(secret: string, value: string): string {
  return createHmac("sha256", deriveKey(secret, "ratelimit.v1")).update(value).digest("hex");
}

/**
 * Comprobacion de Origin para peticiones que MUTAN: el header Origin debe existir y
 * coincidir con `appUrl` (env.APP_URL). Ataja la mayoria de CSRF antes de mirar el
 * token. Devuelve true si es aceptable.
 */
export function originAllowed(req: Request, appUrl: string): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
