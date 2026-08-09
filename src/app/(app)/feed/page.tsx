import { FeedInicio } from "./feed-inicio";

export const metadata = { title: "Feed · DareFlash" };

/**
 * FEED — el feed inmersivo (boceto 1), en `/feed` DENTRO del grupo (app) pero FUERA del grupo
 * `(shell)`: NO recibe la barra superior ni la rejilla del shell de escritorio; conserva su layout
 * inmersivo. En movil la nav inferior se SUPERPONE al video; en escritorio conserva el hueco de la
 * lateral (`lg:pl-56` del layout) y centra el 9:16. Maqueta sin backend.
 */
export default function FeedPage() {
  return <FeedInicio />;
}
