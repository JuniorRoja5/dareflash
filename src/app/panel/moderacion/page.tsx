import { requireSeccion } from "../panel-guard";
import { Placeholder } from "../placeholder";
import { seccionPorHref } from "../secciones";

const S = seccionPorHref("/panel/moderacion")!;

export const metadata = { title: "Moderación · Panel" };

/** Sección PLACEHOLDER (honesta, sin datos). Guard PROPIO, derivado de su sección (MODERATOR). */
export default async function Pagina() {
  await requireSeccion("/panel/moderacion");
  return <Placeholder titulo={S.label} descripcion={S.descripcion} fase={S.fase!} />;
}
