import { TextosProvider } from "@/components/textos-provider";
import { textosClienteDeLaPeticion } from "@/textos/servidor";

import { Desbloqueo } from "./desbloqueo";

/**
 * /unlock. La página es de SERVIDOR solo para poner los textos (Fase 11 · P5b2a): el contenido, que
 * reactiva la cuenta con un botón, es una isla de cliente (`desbloqueo.tsx`, con el porqué de cada cosa).
 */
export default async function UnlockPage() {
  return (
    <TextosProvider textos={await textosClienteDeLaPeticion(["desbloquear"] as const)}>
      <Desbloqueo />
    </TextosProvider>
  );
}
