import { requireSeccion } from "../panel-guard";
import { Placeholder } from "../placeholder";
import { seccionPorHref } from "../secciones";

const S = seccionPorHref("/panel/monedero")!;

export const metadata = { title: "Monedero y retiradas · Panel" };

/** Sección PLACEHOLDER (honesta, sin datos). Guard PROPIO derivado de su sección (ADMIN: es dinero). */
export default async function Pagina() {
  await requireSeccion("/panel/monedero");
  return <Placeholder titulo={S.label} descripcion={S.descripcion} fase={S.fase!} />;
}
