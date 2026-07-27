import { describe, expect, it } from "vitest";

import { normalizeIp } from "../src/server/http/ip";

describe("normalizeIp (agrupacion de rate-limit por IP)", () => {
  it("IPv4 se queda tal cual", () => {
    expect(normalizeIp("203.0.113.5")).toBe("203.0.113.5");
  });

  it("IPv4 MAPEADA en IPv6 se trata como IPv4 (no colapsa todas al mismo /64)", () => {
    expect(normalizeIp("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(normalizeIp("::ffff:198.51.100.7")).toBe("198.51.100.7");
    // Insensible a mayusculas del prefijo.
    expect(normalizeIp("::FFFF:203.0.113.5")).toBe("203.0.113.5");
    // El bug: dos mapeadas distintas caian en "0:0:0:0::/64" (mismo cubo). Ahora NO.
    expect(normalizeIp("::ffff:203.0.113.5")).not.toBe(normalizeIp("::ffff:198.51.100.7"));
  });

  it("IPv6 nativa se trunca al /64 (mismo prefijo -> mismo cubo)", () => {
    expect(normalizeIp("2001:db8:1234:5678:9abc:def0:1111:2222")).toBe("2001:db8:1234:5678::/64");
    // Dos direcciones del MISMO /64 comparten cubo (evita saltarse el limite cambiando de host).
    expect(normalizeIp("2001:db8:1234:5678::1")).toBe(normalizeIp("2001:db8:1234:5678::9999"));
  });

  it("IPv6 comprimida (::) se expande antes de truncar", () => {
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });
});
