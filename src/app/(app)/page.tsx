import { FeedInicio } from "./_inicio/feed-inicio";

export const metadata = { title: "DareFlash" };

/**
 * INICIO — el feed inmersivo (boceto 1), en la ruta "/" DENTRO del grupo (app) (la nav lo marca
 * Inicio -> "/"). Reemplaza la landing placeholder; una landing publica para deslogueados es
 * decision posterior. Maqueta sin backend.
 *
 * FULL-BLEED: Inicio escapa del padding de contenido del layout (app). En movil cancela el `pb-24`
 * (la nav inferior se SUPERPONE al video, no lo empuja). En escritorio conserva el hueco de la nav
 * lateral (`lg:pl-56` del layout) y el feed centra el 9:16. Las demas pantallas conservan su padding.
 */
export default function InicioPage() {
  return (
    <div className="-mb-24 lg:mb-0">
      <FeedInicio />
    </div>
  );
}
