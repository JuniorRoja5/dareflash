// STUB de detalle (Paso C · unidad 1/2): solo el id, para que el tap de una tarjeta aterrice. La
// pantalla real "Reto por dentro" (marcador en heroe, votar) es la unidad 3. `params` es un Promise
// en Next 16 (API asincrona): se hace await.
export default async function RetoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="text-sm text-text-dim">Reto</p>
      <h1 className="text-2xl font-semibold text-text">{id}</h1>
    </div>
  );
}
