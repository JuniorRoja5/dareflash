import { Boton } from "@/components/ui/boton";

export const metadata = { title: "Panel · DareFlash" };

/**
 * Inicio del PANEL DE ADMIN. Contenido MÍNIMO (M4): anuncia dónde irá "Crear reto" sin botones muertos
 * que engañen — el CTA está deshabilitado con copy honesto ("próximamente"). El formulario y el
 * endpoint de crear reto llegan en el siguiente mensaje. El guard del acceso vive en el layout.
 */
export default function PanelPage() {
  return (
    <div className="df-rise">
      <h1
        className="text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        Administración
      </h1>
      <p className="mt-2 text-sm text-text-dim">
        Desde aquí gestionarás la plataforma. La creación de retos llega en el siguiente paso.
      </p>

      <section className="mt-8 rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)]">
        <h2 className="text-sm font-semibold tracking-widest text-text-dim uppercase">Retos</h2>
        <p className="mt-2 max-w-prose text-sm text-text-dim">
          Aquí crearás y publicarás retos con su premio, plazo, número de ganadores y reglas.
        </p>
        {/* Único magenta de la pantalla, DESHABILITADO a propósito: no engaña (aún no hay flujo). */}
        <Boton variante="principal" disabled className="mt-4">
          Crear reto — próximamente
        </Boton>
      </section>
    </div>
  );
}
