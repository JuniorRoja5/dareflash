// GENERA la tabla de `src/lib/zona-horaria-pais.ts` (Fase 9 · P10) desde GeoNames: por país, la zona
// horaria de su capital (PPLC; si no la hay, la de su ciudad más poblada) y si tiene VARIAS zonas (sus
// ciudades usan más de un desfase en enero o en julio). Uso, con `cities15000.txt` de GeoNames:
//   node scripts/generar-zonas-pais.mjs cities15000.txt zonas.json
// y copiar las zonas a la tabla. Los nombres en castellano de las capitales se escriben a mano.
import fs from "node:fs";

const [, , ruta, salida] = process.argv;
const porPais = new Map();
for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
  const c = linea.split("\t");
  if (c.length < 18) continue;
  const [nombre, feature, pais, pob, tz] = [c[1], c[7], c[8], Number(c[14]), c[17]];
  if (!tz) continue;
  const p = porPais.get(pais) ?? { zonas: new Set(), capital: null, mayor: null };
  p.zonas.add(tz);
  if (feature === "PPLC" && !p.capital) p.capital = { nombre, tz };
  if (!p.mayor || pob > p.mayor.pob) p.mayor = { nombre, tz, pob };
  porPais.set(pais, p);
}
const desfase = (tz, iso) => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
  return f.formatToParts(new Date(iso)).find((x) => x.type === "timeZoneName").value;
};
const filas = [];
for (const [pais, p] of [...porPais].sort()) {
  const base = p.capital ?? p.mayor;
  const firmas = new Set(
    [...p.zonas].map(
      (z) => `${desfase(z, "2026-01-15T12:00:00Z")}|${desfase(z, "2026-07-15T12:00:00Z")}`,
    ),
  );
  filas.push({
    pais,
    zona: base.tz,
    capital: base.nombre,
    esCapital: !!p.capital,
    varias: firmas.size > 1,
  });
}
fs.writeFileSync(salida, JSON.stringify(filas, null, 1));
console.log(
  "paises",
  filas.length,
  "sin capital",
  filas
    .filter((f) => !f.esCapital)
    .map((f) => f.pais)
    .join(" "),
);
console.log(
  "varias:",
  filas
    .filter((f) => f.varias)
    .map((f) => `${f.pais}=${f.capital}(${f.zona})`)
    .join("; "),
);
