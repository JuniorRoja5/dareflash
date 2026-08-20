import { Placeholder } from "../placeholder";
import { seccionPorHref } from "../secciones";

const S = seccionPorHref("/panel/notificaciones")!;

export const metadata = { title: "Notificaciones · Panel" };

/** Sección PLACEHOLDER (honesta, sin datos). Hereda guard + noindex del layout. */
export default function Pagina() {
  return <Placeholder titulo={S.label} descripcion={S.descripcion} fase={S.fase!} />;
}
