import { requireSeccion } from "../panel-guard";
import { Placeholder } from "../placeholder";
import { seccionPorHref } from "../secciones";

const S = seccionPorHref("/panel/boost")!;

export const metadata = { title: "Boost · Panel" };

/** Sección PLACEHOLDER (honesta, sin datos). Guard PROPIO derivado de su sección (ADMIN). */
export default async function Pagina() {
  await requireSeccion("/panel/boost");
  return <Placeholder titulo={S.label} descripcion={S.descripcion} fase={S.fase!} />;
}
