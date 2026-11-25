import { TextosProvider } from "@/components/textos-provider";
import { textos, textosClienteDeLaPeticion } from "@/textos/servidor";

import { BuscarCliente } from "./buscar-cliente";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("buscar") };
}

/**
 * /buscar — buscador PÚBLICO (dentro del shell, que ya deja pasar invitados). Lee `?q`/`?tipo` de la
 * URL (los rellena el buscador de la barra superior al enviar) y arranca la isla cliente con ellos.
 * Contenedor de ancho contenido (una lista se lee mejor así); maqueta desktop v2, sin estructura fuera
 * de lo aprobado. Un invitado puede buscar; actuar sobre un resultado pasa por el gate existente.
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string }>;
}) {
  const sp = await searchParams;
  const qInicial = typeof sp.q === "string" ? sp.q : "";
  const tipoInicial =
    sp.tipo === "retos" ? "retos" : sp.tipo === "categorias" ? "categorias" : "usuarios";
  const [t, textosBuscar] = await Promise.all([
    textos("buscar"),
    textosClienteDeLaPeticion(["buscar"] as const),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 lg:px-8 lg:py-12">
      <h1
        className="mb-5 text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        {t("titulo")}
      </h1>
      <TextosProvider textos={textosBuscar}>
        <BuscarCliente qInicial={qInicial} tipoInicial={tipoInicial} />
      </TextosProvider>
    </div>
  );
}
